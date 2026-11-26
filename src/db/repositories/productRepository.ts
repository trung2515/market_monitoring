import type { Product, StoredProduct } from '../../domain/types';
import type { Database } from '../database';
import { bool, buildProductFilter, jsonArray, num, str, strOrNull, type ProductFilter } from '../rowMappers';

export class ProductRepository {
  constructor(private readonly db: Database) {}

  /** Thêm mới hoặc cập nhật thông tin sản phẩm; giữ nguyên ngày xuất hiện lần đầu. */
  upsert(product: Product, crawlDate: string): void {
    this.db
      .prepare(
        `INSERT INTO products (
           product_code, model_code, name, brand, category_slug, category_name, url, image_url,
           specs, size_key, is_set, is_online_only, first_seen_date, last_seen_date, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(product_code) DO UPDATE SET
           model_code = excluded.model_code,
           name = excluded.name,
           brand = excluded.brand,
           category_slug = excluded.category_slug,
           category_name = excluded.category_name,
           url = excluded.url,
           image_url = excluded.image_url,
           specs = excluded.specs,
           size_key = excluded.size_key,
           is_set = excluded.is_set,
           is_online_only = excluded.is_online_only,
           first_seen_date = MIN(products.first_seen_date, excluded.first_seen_date),
           last_seen_date = MAX(products.last_seen_date, excluded.last_seen_date),
           updated_at = datetime('now')`,
      )
      .run(
        product.productCode,
        product.modelCode,
        product.name,
        product.brand,
        product.categorySlug,
        product.categoryName,
        product.url,
        product.imageUrl,
        JSON.stringify(product.specs),
        product.sizeKey,
        product.isSet ? 1 : 0,
        product.isOnlineOnly ? 1 : 0,
        crawlDate,
        crawlDate,
      );
  }

  findAll(filter?: ProductFilter): StoredProduct[] {
    const where = buildProductFilter(filter);
    return this.db
      .prepare(`SELECT * FROM products p WHERE ${where.sql} ORDER BY p.category_slug, p.brand, p.name`)
      .all(...where.params)
      .map(mapProduct);
  }

  brands(): { brand: string; productCount: number }[] {
    return this.db
      .prepare('SELECT brand, COUNT(*) AS c FROM products GROUP BY brand ORDER BY c DESC, brand')
      .all()
      .map((r) => ({ brand: str(r.brand), productCount: num(r.c) }));
  }

  count(): number {
    return num(this.db.prepare('SELECT COUNT(*) AS c FROM products').get()?.c);
  }
}

function mapProduct(r: Record<string, unknown>): StoredProduct {
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
