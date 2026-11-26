/**
 * Danh sách migration theo thứ tự. KHÔNG sửa migration đã chạy trên server –
 * muốn đổi schema thì thêm migration mới với id tăng dần.
 */
export const migrations: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'init',
    sql: `
      CREATE TABLE products (
        product_code     TEXT PRIMARY KEY,
        model_code       TEXT NOT NULL DEFAULT '',
        name             TEXT NOT NULL,
        brand            TEXT NOT NULL,
        category_slug    TEXT NOT NULL,
        category_name    TEXT NOT NULL,
        url              TEXT NOT NULL,
        image_url        TEXT NOT NULL DEFAULT '',
        specs            TEXT NOT NULL DEFAULT '[]',
        size_key         TEXT,
        is_set           INTEGER NOT NULL DEFAULT 0,
        is_online_only   INTEGER NOT NULL DEFAULT 0,
        first_seen_date  TEXT NOT NULL,
        last_seen_date   TEXT NOT NULL,
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_products_brand ON products(brand);
      CREATE INDEX idx_products_category ON products(category_slug);
      CREATE INDEX idx_products_first_seen ON products(first_seen_date);

      CREATE TABLE price_snapshots (
        crawl_date        TEXT NOT NULL,
        product_code      TEXT NOT NULL REFERENCES products(product_code),
        category_slug     TEXT NOT NULL,
        price             INTEGER,
        list_price        INTEGER,
        discount_percent  REAL,
        flash_price       INTEGER,
        is_available      INTEGER NOT NULL DEFAULT 1,
        sold_count        INTEGER,
        sold_text         TEXT,
        total_rate        INTEGER,
        rating            REAL,
        PRIMARY KEY (crawl_date, product_code)
      );
      CREATE INDEX idx_snapshots_product ON price_snapshots(product_code, crawl_date);

      CREATE TABLE crawl_runs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        crawl_date     TEXT NOT NULL,
        trigger        TEXT NOT NULL,
        status         TEXT NOT NULL,
        started_at     TEXT NOT NULL,
        finished_at    TEXT,
        product_count  INTEGER NOT NULL DEFAULT 0,
        warnings       TEXT NOT NULL DEFAULT '[]',
        error          TEXT
      );
      CREATE INDEX idx_crawl_runs_date ON crawl_runs(crawl_date);
    `,
  },
];
