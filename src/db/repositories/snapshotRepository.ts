import type { PriceSnapshot } from '../../domain/types';
import type { Database } from '../database';
import { bool, buildProductFilter, numOrNull, str, strOrNull, type ProductFilter } from '../rowMappers';

/**
 * Ánh xạ trường của PriceSnapshot ↔ cột trong bảng price_snapshots.
 * Thêm trường mới: thêm 1 dòng ở đây + 1 migration (db/migrations.ts) + cập nhật domain/types.ts.
 */
type SqlValue = string | number | null;
const COLUMNS: { field: keyof PriceSnapshot; column: string; toDb?: (v: unknown) => SqlValue }[] = [
  { field: 'crawlDate', column: 'crawl_date' },
  { field: 'productCode', column: 'product_code' },
  { field: 'categorySlug', column: 'category_slug' },
  { field: 'price', column: 'price' },
  { field: 'listPrice', column: 'list_price' },
  { field: 'discountPercent', column: 'discount_percent' },
  { field: 'flashPrice', column: 'flash_price' },
  { field: 'isAvailable', column: 'is_available', toDb: (v) => (v ? 1 : 0) },
  { field: 'soldCount', column: 'sold_count' },
  { field: 'soldText', column: 'sold_text' },
  { field: 'totalRate', column: 'total_rate' },
  { field: 'rating', column: 'rating' },
  { field: 'promoStart', column: 'promo_start' },
  { field: 'promoEnd', column: 'promo_end' },
  { field: 'flashStart', column: 'flash_start' },
  { field: 'flashEnd', column: 'flash_end' },
  { field: 'flashHours', column: 'flash_hours' },
  { field: 'flashQuota', column: 'flash_quota' },
  { field: 'giftText', column: 'gift_text' },
  { field: 'giftValue', column: 'gift_value' },
  { field: 'promoLabels', column: 'promo_labels' },
  { field: 'installment', column: 'installment' },
  { field: 'otherPromos', column: 'other_promos' },
];
const KEY_COLUMNS = new Set(['crawl_date', 'product_code']);

const UPSERT_SQL = `INSERT INTO price_snapshots (${COLUMNS.map((c) => c.column).join(', ')})
  VALUES (${COLUMNS.map(() => '?').join(', ')})
  ON CONFLICT(crawl_date, product_code) DO UPDATE SET
  ${COLUMNS.filter((c) => !KEY_COLUMNS.has(c.column))
    .map((c) => `${c.column} = excluded.${c.column}`)
    .join(',\n  ')}`;

export class SnapshotRepository {
  constructor(private readonly db: Database) {}

  /** Mỗi sản phẩm chỉ có 1 bản ghi/ngày; cào lại trong ngày sẽ ghi đè. */
  upsert(snapshot: PriceSnapshot): void {
    const values = COLUMNS.map((c) => {
      const v = snapshot[c.field];
      return c.toDb ? c.toDb(v) : ((v ?? null) as SqlValue);
    });
    this.db.prepare(UPSERT_SQL).run(...values);
  }

  /** Tất cả snapshot trong khoảng [from, to] (bao gồm 2 đầu), lọc theo danh mục/hãng. */
  findBetween(from: string, to: string, filter?: ProductFilter): PriceSnapshot[] {
    const where = buildProductFilter(filter);
    return this.db
      .prepare(
        `SELECT s.* FROM price_snapshots s
         JOIN products p ON p.product_code = s.product_code
         WHERE s.crawl_date BETWEEN ? AND ? AND ${where.sql}
         ORDER BY s.crawl_date, s.product_code`,
      )
      .all(from, to, ...where.params)
      .map(mapSnapshot);
  }

  /** Danh sách ngày đã có dữ liệu (tăng dần). */
  crawlDates(from?: string, to?: string): string[] {
    return this.db
      .prepare(
        `SELECT DISTINCT crawl_date FROM price_snapshots
         WHERE crawl_date >= ? AND crawl_date <= ? ORDER BY crawl_date`,
      )
      .all(from ?? '0000-00-00', to ?? '9999-12-31')
      .map((r) => str(r.crawl_date));
  }

  /** Ngày có dữ liệu gần nhất, nhỏ hơn hẳn `date`. */
  latestDateBefore(date: string): string | null {
    const row = this.db.prepare('SELECT MAX(crawl_date) AS d FROM price_snapshots WHERE crawl_date < ?').get(date);
    return strOrNull(row?.d);
  }

  firstCrawlDate(): string | null {
    return strOrNull(this.db.prepare('SELECT MIN(crawl_date) AS d FROM price_snapshots').get()?.d);
  }

  lastCrawlDate(): string | null {
    return strOrNull(this.db.prepare('SELECT MAX(crawl_date) AS d FROM price_snapshots').get()?.d);
  }

  countByDate(date: string): Map<string, number> {
    const rows = this.db
      .prepare('SELECT category_slug, COUNT(*) AS c FROM price_snapshots WHERE crawl_date = ? GROUP BY category_slug')
      .all(date);
    return new Map(rows.map((r) => [str(r.category_slug), Number(r.c)]));
  }
}

function mapSnapshot(r: Record<string, unknown>): PriceSnapshot {
  return {
    crawlDate: str(r.crawl_date),
    productCode: str(r.product_code),
    categorySlug: str(r.category_slug),
    price: numOrNull(r.price),
    listPrice: numOrNull(r.list_price),
    discountPercent: numOrNull(r.discount_percent),
    flashPrice: numOrNull(r.flash_price),
    isAvailable: bool(r.is_available),
    soldCount: numOrNull(r.sold_count),
    soldText: strOrNull(r.sold_text),
    totalRate: numOrNull(r.total_rate),
    rating: numOrNull(r.rating),
    promoStart: strOrNull(r.promo_start),
    promoEnd: strOrNull(r.promo_end),
    flashStart: strOrNull(r.flash_start),
    flashEnd: strOrNull(r.flash_end),
    flashHours: strOrNull(r.flash_hours),
    flashQuota: numOrNull(r.flash_quota),
    giftText: strOrNull(r.gift_text),
    giftValue: numOrNull(r.gift_value),
    promoLabels: strOrNull(r.promo_labels),
    installment: strOrNull(r.installment),
    otherPromos: strOrNull(r.other_promos),
  };
}
