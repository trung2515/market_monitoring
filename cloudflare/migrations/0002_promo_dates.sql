-- Sinh tự động từ src/db/migrations.ts (migration 2). Không sửa tay.
ALTER TABLE price_snapshots ADD COLUMN promo_start TEXT;
ALTER TABLE price_snapshots ADD COLUMN promo_end TEXT;
ALTER TABLE price_snapshots ADD COLUMN flash_end TEXT;
