import type { CrawledProduct, CrawlRun, CrawlStatus, CrawlTrigger, PriceSnapshot, StoredProduct } from '../domain/types';
import { bool, buildProductFilter, jsonArray, num, numOrNull, str, strOrNull, type ProductFilter } from './rowMappers';
import type { Row, SqlDriver, SqlValue } from './sql';

/**
 * Toàn bộ truy vấn dữ liệu của hệ thống – viết 1 lần, chạy trên cả Node (node:sqlite) và Cloudflare D1.
 *
 * Lưu ý giới hạn D1: tối đa 100 tham số/câu lệnh. Vì vậy ghi hàng loạt dùng 1 tham số JSON + `json_each`
 * (1 câu lệnh cho cả trang 50 sản phẩm) thay vì nhiều tham số.
 */

export interface CrawlJob {
  id: number;
  runId: number;
  categorySlug: string;
  categoryName: string;
  pageIndex: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
}

export interface JobSummary {
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  productCount: number;
  invalidCount: number;
  errors: { categoryName: string; pageIndex: number; error: string }[];
  invalidByCategory: { categoryName: string; invalid: number }[];
}

/** Ánh xạ trường PriceSnapshot ↔ cột price_snapshots. Thêm trường: thêm 1 dòng + 1 migration. */
const SNAPSHOT_COLUMNS: [keyof PriceSnapshot, string][] = [
  ['crawlDate', 'crawl_date'],
  ['productCode', 'product_code'],
  ['categorySlug', 'category_slug'],
  ['price', 'price'],
  ['listPrice', 'list_price'],
  ['discountPercent', 'discount_percent'],
  ['flashPrice', 'flash_price'],
  ['isAvailable', 'is_available'],
  ['soldCount', 'sold_count'],
  ['soldText', 'sold_text'],
  ['totalRate', 'total_rate'],
  ['rating', 'rating'],
  ['promoStart', 'promo_start'],
  ['promoEnd', 'promo_end'],
  ['flashStart', 'flash_start'],
  ['flashEnd', 'flash_end'],
  ['flashHours', 'flash_hours'],
  ['flashQuota', 'flash_quota'],
  ['giftText', 'gift_text'],
  ['giftValue', 'gift_value'],
  ['promoLabels', 'promo_labels'],
  ['installment', 'installment'],
  ['otherPromos', 'other_promos'],
];

const PRODUCT_COLUMNS: [string, string][] = [
  ['productCode', 'product_code'],
  ['modelCode', 'model_code'],
  ['name', 'name'],
  ['brand', 'brand'],
  ['categorySlug', 'category_slug'],
  ['categoryName', 'category_name'],
  ['url', 'url'],
  ['imageUrl', 'image_url'],
  ['specs', 'specs'],
  ['sizeKey', 'size_key'],
  ['isSet', 'is_set'],
  ['isOnlineOnly', 'is_online_only'],
];

const jsonField = (field: string) => `json_extract(j.value, '$.${field}')`;

const UPSERT_PRODUCTS_SQL = `
  INSERT INTO products (${PRODUCT_COLUMNS.map(([, c]) => c).join(', ')}, first_seen_date, last_seen_date, updated_at)
  SELECT ${PRODUCT_COLUMNS.map(([f]) => jsonField(f)).join(', ')}, ?2, ?2, datetime('now')
  FROM json_each(?1) j WHERE true
  ON CONFLICT(product_code) DO UPDATE SET
    ${PRODUCT_COLUMNS.filter(([, c]) => c !== 'product_code')
      .map(([, c]) => `${c} = excluded.${c}`)
      .join(',\n    ')},
    first_seen_date = MIN(products.first_seen_date, excluded.first_seen_date),
    last_seen_date = MAX(products.last_seen_date, excluded.last_seen_date),
    updated_at = datetime('now')`;

const UPSERT_SNAPSHOTS_SQL = `
  INSERT INTO price_snapshots (${SNAPSHOT_COLUMNS.map(([, c]) => c).join(', ')})
  SELECT ${SNAPSHOT_COLUMNS.map(([f]) => (f === 'crawlDate' ? '?2' : jsonField(f))).join(', ')}
  FROM json_each(?1) j WHERE true
  ON CONFLICT(crawl_date, product_code) DO UPDATE SET
    ${SNAPSHOT_COLUMNS.filter(([, c]) => c !== 'crawl_date' && c !== 'product_code')
      .map(([, c]) => `${c} = excluded.${c}`)
      .join(',\n    ')}`;

export class SqlStore {
  constructor(private readonly db: SqlDriver) {}

  // ================= Ghi dữ liệu cào =================

  /** Lưu 1 trang sản phẩm (thông tin SP + snapshot giá ngày crawlDate) trong 1 transaction. */
  async saveCrawledPage(crawlDate: string, items: CrawledProduct[]): Promise<void> {
    if (items.length === 0) return;
    const products = items.map(({ product: p }) => ({
      ...p,
      specs: JSON.stringify(p.specs),
      isSet: p.isSet ? 1 : 0,
      isOnlineOnly: p.isOnlineOnly ? 1 : 0,
    }));
    const snapshots = items.map(({ snapshot: s }) => ({ ...s, isAvailable: s.isAvailable ? 1 : 0 }));
    await this.db.batch([
      { sql: UPSERT_PRODUCTS_SQL, params: [JSON.stringify(products), crawlDate] },
      { sql: UPSERT_SNAPSHOTS_SQL, params: [JSON.stringify(snapshots), crawlDate] },
    ]);
  }

  // ================= Lượt cào & job =================

  async createRun(crawlDate: string, trigger: CrawlTrigger): Promise<number> {
    const res = await this.db.run(
      `INSERT INTO crawl_runs (crawl_date, trigger, status, started_at) VALUES (?, ?, 'running', ?)`,
      [crawlDate, trigger, new Date().toISOString()],
    );
    if (res.lastRowId == null) throw new Error('Không tạo được lượt cào');
    return res.lastRowId;
  }

  async finishRun(
    id: number,
    result: { status: Exclude<CrawlStatus, 'running'>; productCount: number; warnings: string[]; error?: string },
  ): Promise<void> {
    await this.db.run(
      `UPDATE crawl_runs SET status = ?, finished_at = ?, product_count = ?, warnings = ?, error = ? WHERE id = ?`,
      [
        result.status,
        new Date().toISOString(),
        result.productCount,
        JSON.stringify(result.warnings),
        result.error ?? null,
        id,
      ],
    );
  }

  /** Lượt đang chạy gần nhất (nếu có). */
  async runningRun(): Promise<CrawlRun | null> {
    const row = await this.db.first(`SELECT * FROM crawl_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1`);
    return row ? mapRun(row) : null;
  }

  async getRun(id: number): Promise<CrawlRun | null> {
    const row = await this.db.first('SELECT * FROM crawl_runs WHERE id = ?', [id]);
    return row ? mapRun(row) : null;
  }

  /** Đánh dấu các lượt "đang chạy" bắt đầu trước `beforeIso` là thất bại (vd bị bỏ dở). */
  async failStaleRuns(beforeIso: string, reason: string): Promise<number> {
    const stale = await this.db.all(`SELECT id FROM crawl_runs WHERE status = 'running' AND started_at < ?`, [
      beforeIso,
    ]);
    if (stale.length === 0) return 0;
    const ids = stale.map((r) => num(r.id));
    await this.db.batch(
      ids.flatMap((id) => [
        {
          sql: `UPDATE crawl_runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?`,
          params: [new Date().toISOString(), reason, id],
        },
        { sql: `UPDATE crawl_jobs SET status = 'failed', error = ? WHERE run_id = ? AND status IN ('pending','running')`, params: [reason, id] },
      ]),
    );
    return ids.length;
  }

  async recentRuns(limit = 10): Promise<CrawlRun[]> {
    return (await this.db.all('SELECT * FROM crawl_runs ORDER BY id DESC LIMIT ?', [limit])).map(mapRun);
  }

  async addJobs(runId: number, jobs: { categorySlug: string; categoryName: string; pageIndex: number }[]) {
    if (jobs.length === 0) return;
    await this.db.run(
      `INSERT OR IGNORE INTO crawl_jobs (run_id, category_slug, category_name, page_index)
       SELECT ?2, ${jsonField('categorySlug')}, ${jsonField('categoryName')}, ${jsonField('pageIndex')}
       FROM json_each(?1) j`,
      [JSON.stringify(jobs), runId],
    );
  }

  /**
   * Nhận 1 job để xử lý (đánh dấu running). Job "running" quá hạn (bị bỏ dở) được nhận lại.
   * Dùng 1 câu UPDATE … RETURNING để 2 lần chạy song song không nhận trùng job.
   */
  async claimNextJob(staleBeforeIso: string): Promise<CrawlJob | null> {
    const rows = await this.db.all(
      `UPDATE crawl_jobs SET status = 'running', claimed_at = ?1, attempts = attempts + 1
       WHERE id = (
         SELECT j.id FROM crawl_jobs j JOIN crawl_runs r ON r.id = j.run_id
         WHERE r.status = 'running'
           AND (j.status = 'pending' OR (j.status = 'running' AND j.claimed_at < ?2))
         ORDER BY j.id LIMIT 1
       )
       RETURNING *`,
      [new Date().toISOString(), staleBeforeIso],
    );
    const r = rows[0];
    return r ? mapJob(r) : null;
  }

  async completeJob(id: number, productCount: number, invalidCount: number): Promise<void> {
    await this.db.run(
      `UPDATE crawl_jobs SET status = 'done', product_count = ?, invalid_count = ?, error = NULL WHERE id = ?`,
      [productCount, invalidCount, id],
    );
  }

  /** Job lỗi: thử lại nếu còn lượt, hết lượt thì đánh dấu failed. */
  async failJob(id: number, error: string, maxAttempts: number): Promise<void> {
    await this.db.run(
      `UPDATE crawl_jobs SET status = CASE WHEN attempts >= ? THEN 'failed' ELSE 'pending' END, error = ? WHERE id = ?`,
      [maxAttempts, error, id],
    );
  }

  async jobSummary(runId: number): Promise<JobSummary> {
    const counts = await this.db.first(
      `SELECT COUNT(*) AS total,
              SUM(status = 'pending') AS pending, SUM(status = 'running') AS running,
              SUM(status = 'done') AS done, SUM(status = 'failed') AS failed,
              SUM(product_count) AS products, SUM(invalid_count) AS invalid
       FROM crawl_jobs WHERE run_id = ?`,
      [runId],
    );
    const errors = await this.db.all(
      `SELECT category_name, page_index, error FROM crawl_jobs WHERE run_id = ? AND status = 'failed' ORDER BY id`,
      [runId],
    );
    const invalid = await this.db.all(
      `SELECT category_name, SUM(invalid_count) AS invalid FROM crawl_jobs
       WHERE run_id = ? GROUP BY category_name HAVING SUM(invalid_count) > 0`,
      [runId],
    );
    return {
      total: num(counts?.total),
      pending: num(counts?.pending),
      running: num(counts?.running),
      done: num(counts?.done),
      failed: num(counts?.failed),
      productCount: num(counts?.products),
      invalidCount: num(counts?.invalid),
      errors: errors.map((e) => ({ categoryName: str(e.category_name), pageIndex: num(e.page_index), error: str(e.error) })),
      invalidByCategory: invalid.map((i) => ({ categoryName: str(i.category_name), invalid: num(i.invalid) })),
    };
  }

  /** Kết quả từng danh mục của 1 lượt cào (cho lệnh `npm run crawl`). */
  async categoryResults(runId: number): Promise<{ categoryName: string; productCount: number; error: string | null }[]> {
    const rows = await this.db.all(
      `SELECT category_name, SUM(product_count) AS products,
              MAX(CASE WHEN status = 'failed' THEN error END) AS error
       FROM crawl_jobs WHERE run_id = ? GROUP BY category_name ORDER BY MIN(id)`,
      [runId],
    );
    return rows.map((r) => ({ categoryName: str(r.category_name), productCount: num(r.products), error: strOrNull(r.error) }));
  }

  // ================= Đọc dữ liệu =================

  async products(filter?: ProductFilter): Promise<StoredProduct[]> {
    const where = buildProductFilter(filter);
    return (
      await this.db.all(`SELECT * FROM products p WHERE ${where.sql} ORDER BY p.category_slug, p.brand, p.name`, where.params)
    ).map(mapProduct);
  }

  async snapshotsBetween(from: string, to: string, filter?: ProductFilter): Promise<PriceSnapshot[]> {
    const where = buildProductFilter(filter);
    return (
      await this.db.all(
        `SELECT s.* FROM price_snapshots s JOIN products p ON p.product_code = s.product_code
         WHERE s.crawl_date BETWEEN ? AND ? AND ${where.sql}
         ORDER BY s.crawl_date, s.product_code`,
        [from, to, ...where.params],
      )
    ).map(mapSnapshot);
  }

  /** Bảng giá mới nhất kèm thông tin SP – cho bảng xem nhanh trên web. */
  async latestPrices(opts: { filter?: ProductFilter; keyword?: string; limit: number }) {
    const date = await this.lastCrawlDate();
    if (!date) return { date: null, items: [] as (StoredProduct & PriceSnapshot)[] };
    const where = buildProductFilter(opts.filter);
    const params: SqlValue[] = [date, ...where.params];
    let keywordSql = '';
    if (opts.keyword) {
      keywordSql = ` AND (LOWER(p.name) LIKE ? OR LOWER(p.model_code) LIKE ?)`;
      const like = `%${opts.keyword.toLowerCase().slice(0, 40)}%`;
      params.push(like, like);
    }
    params.push(opts.limit);
    const rows = await this.db.all(
      `SELECT p.*, s.* FROM price_snapshots s JOIN products p ON p.product_code = s.product_code
       WHERE s.crawl_date = ? AND ${where.sql}${keywordSql}
       ORDER BY p.category_name, s.price LIMIT ?`,
      params,
    );
    return { date, items: rows.map((r) => ({ ...mapProduct(r), ...mapSnapshot(r) })) };
  }

  async crawlDates(from = '0000-00-00', to = '9999-12-31'): Promise<string[]> {
    return (
      await this.db.all(
        'SELECT DISTINCT crawl_date FROM price_snapshots WHERE crawl_date >= ? AND crawl_date <= ? ORDER BY crawl_date',
        [from, to],
      )
    ).map((r) => str(r.crawl_date));
  }

  async latestDateBefore(date: string): Promise<string | null> {
    return strOrNull((await this.db.first('SELECT MAX(crawl_date) AS d FROM price_snapshots WHERE crawl_date < ?', [date]))?.d);
  }

  async firstCrawlDate(): Promise<string | null> {
    return strOrNull((await this.db.first('SELECT MIN(crawl_date) AS d FROM price_snapshots'))?.d);
  }

  async lastCrawlDate(): Promise<string | null> {
    return strOrNull((await this.db.first('SELECT MAX(crawl_date) AS d FROM price_snapshots'))?.d);
  }

  async categoryCounts(date: string): Promise<Map<string, number>> {
    const rows = await this.db.all(
      'SELECT category_slug, COUNT(*) AS c FROM price_snapshots WHERE crawl_date = ? GROUP BY category_slug',
      [date],
    );
    return new Map(rows.map((r) => [str(r.category_slug), num(r.c)]));
  }

  async productCount(): Promise<number> {
    return num((await this.db.first('SELECT COUNT(*) AS c FROM products'))?.c);
  }

  async brands(): Promise<{ brand: string; productCount: number }[]> {
    return (await this.db.all('SELECT brand, COUNT(*) AS c FROM products GROUP BY brand ORDER BY c DESC, brand')).map(
      (r) => ({ brand: str(r.brand), productCount: num(r.c) }),
    );
  }
}

// ================= Ánh xạ row → domain =================

function mapProduct(r: Row): StoredProduct {
  return {
    productCode: str(r.product_code),
    modelCode: str(r.model_code),
    name: str(r.name),
    brand: str(r.brand),
    categorySlug: str(r.category_slug),
    categoryName: str(r.category_name),
    url: str(r.url),
    imageUrl: str(r.image_url),
    specs: jsonArray(r.specs),
    sizeKey: strOrNull(r.size_key),
    isSet: bool(r.is_set),
    isOnlineOnly: bool(r.is_online_only),
    firstSeenDate: str(r.first_seen_date),
    lastSeenDate: str(r.last_seen_date),
  };
}

function mapSnapshot(r: Row): PriceSnapshot {
  const out: Record<string, unknown> = {};
  for (const [field, column] of SNAPSHOT_COLUMNS) out[field] = r[column] ?? null;
  return {
    ...(out as unknown as PriceSnapshot),
    crawlDate: str(r.crawl_date),
    productCode: str(r.product_code),
    categorySlug: str(r.category_slug),
    price: numOrNull(r.price),
    listPrice: numOrNull(r.list_price),
    discountPercent: numOrNull(r.discount_percent),
    flashPrice: numOrNull(r.flash_price),
    isAvailable: bool(r.is_available),
    soldCount: numOrNull(r.sold_count),
    totalRate: numOrNull(r.total_rate),
    rating: numOrNull(r.rating),
    flashQuota: numOrNull(r.flash_quota),
    giftValue: numOrNull(r.gift_value),
  };
}

function mapRun(r: Row): CrawlRun {
  return {
    id: num(r.id),
    crawlDate: str(r.crawl_date),
    trigger: str(r.trigger) as CrawlTrigger,
    status: str(r.status) as CrawlStatus,
    startedAt: str(r.started_at),
    finishedAt: strOrNull(r.finished_at),
    productCount: num(r.product_count),
    warnings: jsonArray(r.warnings),
    error: strOrNull(r.error),
  };
}

function mapJob(r: Row): CrawlJob {
  return {
    id: num(r.id),
    runId: num(r.run_id),
    categorySlug: str(r.category_slug),
    categoryName: str(r.category_name),
    pageIndex: num(r.page_index),
    status: str(r.status) as CrawlJob['status'],
    attempts: num(r.attempts),
  };
}
