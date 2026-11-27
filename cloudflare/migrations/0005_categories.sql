-- Sinh tự động từ src/db/migrations.ts (migration 5). Không sửa tay.
CREATE TABLE categories (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
