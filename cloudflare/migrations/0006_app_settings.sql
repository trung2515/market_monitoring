-- Sinh tự động từ src/db/migrations.ts (migration 6). Không sửa tay.
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
