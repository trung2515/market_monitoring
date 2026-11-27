-- Sinh tự động từ src/db/migrations.ts (migration 4). Không sửa tay.
CREATE TABLE crawl_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        INTEGER NOT NULL REFERENCES crawl_runs(id),
  category_slug TEXT NOT NULL,
  category_name TEXT NOT NULL,
  page_index    INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  attempts      INTEGER NOT NULL DEFAULT 0,
  product_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  claimed_at    TEXT,
  UNIQUE (run_id, category_slug, page_index)
);
CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status, id);
