/**
 * Các hàm trích xuất thông tin từ tên/thông số sản phẩm.
 * Tách riêng & thuần (pure) để dễ viết test và chỉnh khi ĐMX đổi cách đặt tên.
 */

/** "Đã bán 43,2k" → 43200, "Đã bán 838" → 838, "Đã bán 1,2tr" → 1200000 */
export function parseSoldText(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(k|tr|triệu|m)?/i);
  if (!m || !m[1]) return null;
  const num = Number(m[1].replace(',', '.'));
  if (Number.isNaN(num)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  const multiplier = unit === 'k' ? 1_000 : unit === 'tr' || unit === 'triệu' || unit === 'm' ? 1_000_000 : 1;
  return Math.round(num * multiplier);
}

const SIZE_TOKEN = /^\d+([.,]\d+)?(cm|mm|ml|l|lít|lit|kg|g|w)$/i;

/**
 * Lấy mã model của hãng từ tên sản phẩm (thường là token cuối).
 *  "Chảo nhôm ... 30 cm Elmich EDA0904GO30"     → "EDA0904GO30"
 *  "Bộ 3 nồi inox ... Elmich Trimax XR EL-3843"  → "EL-3843"
 *  "Bình giữ nhiệt ... LocknLock LHC4282KKI_C"   → "LHC4282KKI_C"
 * Nếu tên không có mã (vd "Nồi lẩu ... Elmich Daily Milan") và biết hãng → lấy tên dòng sau tên hãng: "DAILY MILAN".
 */
export function extractModelCode(name: string, brand?: string): string {
  const tokens = name.trim().split(/\s+/).map((t) => t.replace(/[(),]/g, ''));
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i] ?? '';
    if (token.length < 4 || SIZE_TOKEN.test(token)) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(token) || !/\d/.test(token)) continue;
    // mã chữ + số (EL-3843) hoặc mã toàn số đủ dài (2353733)
    if (/[A-Za-z]/.test(token) || /^\d{5,}$/.test(token)) return token.toUpperCase();
  }
  if (brand) {
    const idx = name.toLowerCase().lastIndexOf(brand.toLowerCase());
    const after = idx >= 0 ? name.slice(idx + brand.length).trim() : '';
    if (after) return after.toUpperCase();
  }
  return '';
}

export interface SizeInfo {
  /** Khóa chuẩn hoá dùng để ghép phân khúc, vd "28cm", "500ml" */
  key: string;
  unit: 'cm' | 'ml';
  value: number;
}

/**
 * Lấy kích thước chính của sản phẩm: đường kính (cm) cho nồi/chảo, dung tích (ml) cho bình/ly/hộp.
 * Ưu tiên thông số (specs) rồi mới tới tên.
 */
export function extractSize(name: string, specs: string[] = []): SizeInfo | null {
  const sources = [...specs, name];
  for (const src of sources) {
    const cm = src.match(/(\d+(?:[.,]\d+)?)\s*cm(?=$|[\s,;.)])/i);
    if (cm?.[1]) {
      const value = Number(cm[1].replace(',', '.'));
      return { key: `${value}cm`, unit: 'cm', value };
    }
  }
  for (const src of sources) {
    // Không dùng \b vì JS coi chữ có dấu (vd 'lớp') là ký tự ngăn cách → '3 lớp' bị hiểu nhầm thành 3 lít
    const vol = src.match(/(\d+(?:[.,]\d+)?)\s*(ml|lít|lit|l)(?=$|[\s,;.)])/i);
    if (vol?.[1]) {
      const raw = Number(vol[1].replace(',', '.'));
      const value = (vol[2] ?? '').toLowerCase() === 'ml' ? raw : Math.round(raw * 1000);
      return { key: `${value}ml`, unit: 'ml', value };
    }
  }
  return null;
}

/** Bộ sản phẩm (bộ nồi, bộ chảo, combo...) – không nên so với sản phẩm lẻ. */
export function isProductSet(name: string): boolean {
  return /^(bộ|combo|set)(?=\s|$)/i.test(name.trim());
}

export function normalizeBrand(brand: string): string {
  return brand.trim().toLowerCase();
}
