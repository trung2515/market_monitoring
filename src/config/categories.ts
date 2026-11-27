import type { SqlStore } from '../db/sqlStore';
import type { TrackingConfig } from './tracking';

/**
 * Danh sách danh mục theo dõi được QUẢN LÝ TRÊN WEB (bảng `categories`).
 * Danh mục mới thêm vào config/tracking.json được tự nạp vào bảng ở lần chạy kế tiếp (xem SqlStore.seedCategories).
 */

/** Đã nạp danh mục từ cấu hình nào cho store nào (tránh truy vấn lại ở mỗi lần gọi). */
const seeded = new WeakMap<SqlStore, TrackingConfig>();

/** Trả về cấu hình với danh mục lấy từ database (gồm cả danh mục đã ngừng theo dõi, enabled = false). */
export async function withStoredCategories(store: SqlStore, tracking: TrackingConfig): Promise<TrackingConfig> {
  if (seeded.get(store) !== tracking) {
    await store.seedCategories(tracking.categories);
    seeded.set(store, tracking);
  }
  // Sắp xếp theo tên A→Z (tiếng Việt) – thứ tự sheet trong Excel, bộ lọc và danh sách trên web
  const categories = (await store.categories()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return { ...tracking, categories: categories.map(({ slug, name, enabled }) => ({ slug, name, enabled })) };
}

/**
 * Lấy slug từ link danh mục ĐMX hoặc slug gõ tay.
 *   "https://www.dienmayxanh.com/noi-com-dien?sort=1"  → "noi-com-dien"
 *   "dienmayxanh.com/noi-com-dien/elmich"              → "noi-com-dien"
 *   "noi-com-dien"                                      → "noi-com-dien"
 */
export function parseCategorySlug(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;
  if (/^(https?:\/\/)?(www\.)?(dienmayxanh|thegioididong)\.com\b/.test(text)) {
    text = text.replace(/^(https?:\/\/)?[^/]+/, '');
  } else if (/^https?:\/\//.test(text)) {
    return null; // link của trang khác
  }
  const slug = text.split(/[?#]/)[0]!.split('/').filter(Boolean)[0] ?? '';
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : null;
}
