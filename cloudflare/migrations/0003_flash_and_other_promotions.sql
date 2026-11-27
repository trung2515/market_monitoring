-- Sinh tự động từ src/db/migrations.ts (migration 3). Không sửa tay.
ALTER TABLE price_snapshots ADD COLUMN flash_start TEXT;
ALTER TABLE price_snapshots ADD COLUMN flash_hours TEXT;
ALTER TABLE price_snapshots ADD COLUMN flash_quota INTEGER;
ALTER TABLE price_snapshots ADD COLUMN gift_text TEXT;
ALTER TABLE price_snapshots ADD COLUMN gift_value INTEGER;
ALTER TABLE price_snapshots ADD COLUMN promo_labels TEXT;
ALTER TABLE price_snapshots ADD COLUMN installment TEXT;
ALTER TABLE price_snapshots ADD COLUMN other_promos TEXT;
