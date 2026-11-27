import type { PriceSnapshot } from '../../domain/types';
import type { Database } from '../database';
import { bool, buildProductFilter, numOrNull, str, strOrNull, type ProductFilter } from '../rowMappers';

export class SnapshotRepository {
  constructor(private readonly db: Database) {}

  /** Mỗi sản phẩm chỉ có 1 bản ghi/ngày; cào lại trong ngày sẽ ghi đè. */
  upsert(snapshot: PriceSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO price_snapshots (
           crawl_date, product_code, category_slug, price, list_price, discount_percent, flash_price,
           is_available, sold_count, sold_text, total_rate, rating
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(crawl_date, product_code) DO UPDATE SET
           category_slug = excluded.category_slug,
           price = excluded.price,
           list_price = excluded.list_price,
           discount_percent = excluded.discount_percent,
           flash_price = excluded.flash_price,
           is_available = excluded.is_available,
           sold_count = excluded.sold_count,
           sold_text = excluded.sold_text,
           total_rate = excluded.total_rate,
           rating = excluded.rating`,
      )
      .run(
        snapshot.crawlDate,
        snapshot.productCode,
        snapshot.categorySlug,
        snapshot.price,
        snapshot.listPrice,
        snapshot.discountPercent,
        snapshot.flashPrice,
        snapshot.isAvailable ? 1 : 0,
        snapshot.soldCount,
        snapshot.soldText,
        snapshot.totalRate,
        snapshot.rating,
      );
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
  };
}
