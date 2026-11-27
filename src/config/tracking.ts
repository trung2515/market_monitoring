import { z } from 'zod';

/**
 * Cấu hình nghiệp vụ: theo dõi danh mục nào, thương hiệu nào là của công ty mình (ownBrand), ai là đối thủ.
 * Chỉnh trong config/tracking.json – không cần sửa code.
 */
const trackingSchema = z.object({
  ownBrand: z.string().min(1),
  /** Đối thủ cần tập trung. Để rỗng = coi mọi hãng khác là đối thủ. */
  competitorBrands: z.array(z.string().min(1)).default([]),
  /**
   * Gộp tên hãng ĐMX ghi không thống nhất: { "tên trong dữ liệu": "tên dùng trong báo cáo" }.
   * Vd { "LocknLock": "Lock&Lock" }. Không phân biệt hoa thường. Dữ liệu gốc không bị sửa, chỉ gộp khi hiển thị/báo cáo.
   */
  brandAliases: z.record(z.string().min(1)).default({}),
  categories: z
    .array(
      z.object({
        /** Phần đường dẫn trên dienmayxanh.com, vd "chao-chong-dinh" */
        slug: z.string().regex(/^[a-z0-9-]+$/, 'slug chỉ gồm chữ thường, số và dấu -'),
        name: z.string().min(1),
        enabled: z.boolean().default(true),
      }),
    )
    .min(1),
  segment: z
    .object({
      /** Giá đối thủ nằm trong ±x% giá Elmich thì coi là cùng tầm giá */
      priceTolerancePercent: z.number().min(0).max(100).default(20),
      /** Số đối thủ hiển thị cạnh mỗi sản phẩm của công ty */
      maxCompetitorsPerProduct: z.number().int().min(1).max(10).default(3),
      /** true = chỉ so với các hãng trong competitorBrands; false = so với mọi hãng khác */
      onlyListedCompetitors: z.boolean().default(false),
      /** Ghép tay theo mã model: luôn đưa vào báo cáo, bất kể quy tắc tự động */
      manualPairs: z
        .array(z.object({ own: z.string(), competitor: z.string(), note: z.string().optional() }))
        .default([]),
    })
    .default({}),
  /** Tuỳ chọn cho các sheet phân tích thị trường */
  report: z
    .object({
      /** Số SP bán chạy nhất lấy cho mỗi danh mục (sheet "Top bán chạy") */
      topSellersPerCategory: z.number().int().min(1).max(100).default(10),
      /** Các mốc chia khoảng giá (VNĐ) cho sheet "Phân khúc giá" */
      priceBands: z.array(z.number().positive()).min(1).default([200_000, 400_000, 700_000, 1_000_000, 2_000_000]),
      /** Khuyến mãi kết thúc trong vòng N ngày được đánh dấu "Sắp hết" */
      promoEndingSoonDays: z.number().int().min(0).default(7),
    })
    .default({}),
});

export type TrackingConfig = z.infer<typeof trackingSchema>;
export type TrackedCategory = TrackingConfig['categories'][number];

export function parseTrackingConfig(raw: unknown): TrackingConfig {
  const parsed = trackingSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`config tracking không hợp lệ:\n${issues}`);
  }
  return parsed.data;
}

/** Tên hãng dùng trong báo cáo (đã gộp theo brandAliases). */
export function canonicalBrand(tracking: Pick<TrackingConfig, 'brandAliases'>, brand: string): string {
  const key = brand.trim().toLowerCase();
  for (const [from, to] of Object.entries(tracking.brandAliases ?? {})) {
    if (from.trim().toLowerCase() === key) return to;
  }
  return brand;
}

/** Mở rộng danh sách hãng để lọc dữ liệu gốc: "Lock&Lock" → ["Lock&Lock", "LocknLock", "Lock Lock"]. */
export function expandBrands(tracking: Pick<TrackingConfig, 'brandAliases'>, brands: string[]): string[] {
  const wanted = new Set(brands.map((b) => canonicalBrand(tracking, b).toLowerCase()));
  const extra = Object.entries(tracking.brandAliases ?? {})
    .filter(([, to]) => wanted.has(to.toLowerCase()))
    .map(([from]) => from);
  return [...new Set([...brands, ...extra])];
}
