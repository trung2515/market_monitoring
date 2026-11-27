import type { PriceSnapshot, StoredProduct } from '../domain/types';
import { daysBetween } from '../utils/date';

/**
 * Các phân tích thị trường bổ trợ (thị phần, bán chạy, phân khúc giá, khuyến mãi, lịch sử giá).
 * Hàm thuần – nhận dữ liệu đã gom sẵn từ analysis.ts, không đụng DB/Excel.
 */

export type BrandRole = 'own' | 'competitor' | 'other';

interface View {
  product: StoredProduct;
  snapshot: PriceSnapshot;
}

export interface MarketConfig {
  /** Số SP bán chạy nhất lấy cho mỗi danh mục */
  topSellersPerCategory: number;
  /** Các mốc chia khoảng giá (VNĐ), tăng dần */
  priceBands: number[];
  /** Khuyến mãi kết thúc trong vòng N ngày được đánh dấu "sắp hết" */
  promoEndingSoonDays: number;
}

export interface MarketShareRow {
  categoryName: string;
  brand: string;
  role: BrandRole;
  /** Thứ hạng theo lượt bán cộng dồn trong danh mục */
  rank: number;
  skuCount: number;
  skuShare: number;
  sold: number;
  soldShare: number;
  avgPrice: number | null;
  avgDiscount: number | null;
}

export interface TopSellerRow extends View {
  rank: number;
  sold: number;
  /** % lượt bán của SP này trên tổng danh mục */
  shareInCategory: number;
}

export interface PriceBandRow {
  categoryName: string;
  band: string;
  skuCount: number;
  ownCount: number;
  ownSkuShare: number;
  sold: number;
  ownSoldShare: number;
  /** Các hãng nhiều SKU nhất trong khoảng giá, vd "Sunhouse (8), Lock&Lock (5)" */
  topBrands: string;
  avgDiscount: number | null;
}

export interface PromotionRow extends View {
  promoEndDate: string | null;
  daysLeft: number | null;
  endingSoon: boolean;
  /** Thời lượng flash sale, vd "1 ngày", "3 giờ" */
  flashDuration: string | null;
}

export interface FlashCalendarRow {
  product: StoredProduct;
  /** Giá flash sale theo từng ngày trong `dates`; null = ngày đó không có flash sale / không có dữ liệu */
  flash: (number | null)[];
  flashDays: number;
  minFlash: number | null;
  /** Giá bán thường ở ngày cuối cùng có dữ liệu */
  regularPrice: number | null;
}

export interface PriceHistoryRow {
  product: StoredProduct;
  /** Giá bán theo từng ngày trong `dates`; null = ngày đó không có dữ liệu */
  prices: (number | null)[];
  min: number | null;
  max: number | null;
  changeCount: number;
}

export interface MarketData {
  shares: MarketShareRow[];
  topSellers: TopSellerRow[];
  priceBands: PriceBandRow[];
  promotions: PromotionRow[];
  history: { dates: string[]; rows: PriceHistoryRow[] };
  flashCalendar: { dates: string[]; rows: FlashCalendarRow[] };
}

export interface MarketInput {
  current: View[];
  /** Snapshot trong kỳ theo từng sản phẩm, đã sắp theo ngày */
  seriesInPeriod: Map<string, PriceSnapshot[]>;
  products: Map<string, StoredProduct>;
  /** Các ngày có dữ liệu trong kỳ, tăng dần */
  crawlDates: string[];
  endDate: string;
  categoryOrder: string[];
  roleOf: (brand: string) => BrandRole;
  config: MarketConfig;
}

/** Lượt bán cộng dồn ĐMX hiển thị (bộ đếm chính xác nếu có, không thì số "đã bán" làm tròn). */
export const soldOf = (s: PriceSnapshot | undefined): number => s?.totalRate ?? s?.soldCount ?? 0;

export function analyzeMarket(input: MarketInput): MarketData {
  const byCategory = groupBy(input.current, (v) => v.product.categorySlug);
  const categories = [...byCategory.entries()].sort(
    ([a, va], [b, vb]) =>
      orderOf(input.categoryOrder, a) - orderOf(input.categoryOrder, b) ||
      (va[0]?.product.categoryName ?? '').localeCompare(vb[0]?.product.categoryName ?? '', 'vi'),
  );

  const shares: MarketShareRow[] = [];
  const topSellers: TopSellerRow[] = [];
  const priceBands: PriceBandRow[] = [];

  for (const [, views] of categories) {
    const categoryName = views[0]?.product.categoryName ?? '';
    const totalSold = sum(views.map((v) => soldOf(v.snapshot)));

    // Thị phần theo hãng
    const brandRows = [...groupBy(views, (v) => v.product.brand).entries()].map(([brand, list]) => {
      const sold = sum(list.map((v) => soldOf(v.snapshot)));
      return {
        categoryName,
        brand,
        role: input.roleOf(brand),
        rank: 0,
        skuCount: list.length,
        skuShare: pct(list.length, views.length),
        sold,
        soldShare: pct(sold, totalSold),
        avgPrice: avgOrNull(list.map((v) => v.snapshot.price)),
        avgDiscount: round1OrNull(
          avgOrNull(
            list.map((v) => v.snapshot.discountPercent),
            false,
          ),
        ),
      };
    });
    brandRows.sort((a, b) => b.sold - a.sold || b.skuCount - a.skuCount);
    brandRows.forEach((r, i) => (r.rank = i + 1));
    shares.push(...brandRows);

    // Top bán chạy
    [...views]
      .sort((a, b) => soldOf(b.snapshot) - soldOf(a.snapshot))
      .slice(0, input.config.topSellersPerCategory)
      .forEach((v, i) => {
        const sold = soldOf(v.snapshot);
        topSellers.push({ ...v, rank: i + 1, sold, shareInCategory: pct(sold, totalSold) });
      });

    // Phân khúc giá
    for (const band of makeBands(input.config.priceBands)) {
      const inBand = views.filter(
        (v) => v.snapshot.price != null && v.snapshot.price >= band.from && v.snapshot.price < band.to,
      );
      if (inBand.length === 0) continue;
      const own = inBand.filter((v) => input.roleOf(v.product.brand) === 'own');
      const sold = sum(inBand.map((v) => soldOf(v.snapshot)));
      const topBrands = [...groupBy(inBand, (v) => v.product.brand).entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 4)
        .map(([brand, list]) => `${brand} (${list.length})`)
        .join(', ');
      priceBands.push({
        categoryName,
        band: band.label,
        skuCount: inBand.length,
        ownCount: own.length,
        ownSkuShare: pct(own.length, inBand.length),
        sold,
        ownSoldShare: pct(sum(own.map((v) => soldOf(v.snapshot))), sold),
        topBrands,
        avgDiscount: round1OrNull(
          avgOrNull(
            inBand.map((v) => v.snapshot.discountPercent),
            false,
          ),
        ),
      });
    }
  }

  // Khuyến mãi đang chạy: giảm so với giá gốc, flash sale, quà tặng hoặc nhãn khuyến mãi
  const promotions: PromotionRow[] = input.current
    .filter(
      (v) =>
        (v.snapshot.discountPercent ?? 0) > 0 ||
        v.snapshot.flashPrice != null ||
        v.snapshot.giftText != null ||
        v.snapshot.promoLabels != null,
    )
    .map((v) => {
      const promoEndDate = v.snapshot.promoEnd?.slice(0, 10) ?? null;
      const daysLeft = promoEndDate ? Math.max(0, daysBetween(input.endDate, promoEndDate)) : null;
      return {
        ...v,
        promoEndDate,
        daysLeft,
        endingSoon: daysLeft != null && daysLeft <= input.config.promoEndingSoonDays,
        flashDuration: duration(v.snapshot.flashStart, v.snapshot.flashEnd),
      };
    })
    .sort(
      (a, b) =>
        orderOf(input.categoryOrder, a.product.categorySlug) - orderOf(input.categoryOrder, b.product.categorySlug) ||
        (b.snapshot.discountPercent ?? 0) - (a.snapshot.discountPercent ?? 0),
    );

  // Lịch sử giá theo ngày (ô trống = ngày không có dữ liệu)
  const historyRows: PriceHistoryRow[] = [];
  for (const [code, list] of input.seriesInPeriod) {
    const product = input.products.get(code);
    if (!product || list.length === 0) continue;
    const byDate = new Map(list.map((s) => [s.crawlDate, s.price]));
    const prices = input.crawlDates.map((d) => byDate.get(d) ?? null);
    const known = prices.filter((p): p is number => p != null);
    let changeCount = 0;
    for (let i = 1; i < known.length; i++) if (known[i] !== known[i - 1]) changeCount++;
    historyRows.push({
      product,
      prices,
      min: known.length ? Math.min(...known) : null,
      max: known.length ? Math.max(...known) : null,
      changeCount,
    });
  }
  historyRows.sort(
    (a, b) =>
      orderOf(input.categoryOrder, a.product.categorySlug) - orderOf(input.categoryOrder, b.product.categorySlug) ||
      a.product.brand.localeCompare(b.product.brand, 'vi') ||
      a.product.name.localeCompare(b.product.name, 'vi'),
  );

  // Lịch flash sale: SP có flash sale ít nhất 1 ngày trong kỳ
  const flashRows: FlashCalendarRow[] = [];
  for (const [code, list] of input.seriesInPeriod) {
    const product = input.products.get(code);
    if (!product || !list.some((s) => s.flashPrice != null)) continue;
    const byDate = new Map(list.map((s) => [s.crawlDate, s.flashPrice]));
    const flash = input.crawlDates.map((d) => byDate.get(d) ?? null);
    const known = flash.filter((p): p is number => p != null);
    flashRows.push({
      product,
      flash,
      flashDays: known.length,
      minFlash: known.length ? Math.min(...known) : null,
      regularPrice: list.at(-1)?.price ?? null,
    });
  }
  flashRows.sort(
    (a, b) =>
      orderOf(input.categoryOrder, a.product.categorySlug) - orderOf(input.categoryOrder, b.product.categorySlug) ||
      b.flashDays - a.flashDays ||
      a.product.brand.localeCompare(b.product.brand, 'vi'),
  );

  return {
    shares,
    topSellers,
    priceBands,
    promotions,
    history: { dates: input.crawlDates, rows: historyRows },
    flashCalendar: { dates: input.crawlDates, rows: flashRows },
  };
}

/**
 * Hiển thị gọn thời gian flash sale:
 *   cả ngày     → "Cả ngày 27/11"
 *   vài giờ     → "27/11 09:00–11:59"
 *   nhiều ngày  → "27/11 → 29/11" (kèm giờ nếu không tròn ngày)
 */
export function flashWindow(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const day = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;
  const time = (v: string) => v.slice(11, 16);
  const wholeDays = time(start) === '00:00' && time(end) === '23:59';
  if (start.slice(0, 10) === end.slice(0, 10)) {
    return wholeDays ? `Cả ngày ${day(start)}` : `${day(start)} ${time(start)}–${time(end)}`;
  }
  return wholeDays ? `${day(start)} → ${day(end)}` : `${day(start)} ${time(start)} → ${day(end)} ${time(end)}`;
}

/** '2026-11-26 00:00' → '2026-11-26 23:59' = "1 ngày"; 3 tiếng = "3 giờ" */
export function duration(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const ms =
    new Date(`${end.replace(' ', 'T')}:00+07:00`).getTime() - new Date(`${start.replace(' ', 'T')}:00+07:00`).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.round(ms / 60_000) + 1; // 00:00 → 23:59 tính là trọn 1 ngày
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [days ? `${days} ngày` : '', hours ? `${hours} giờ` : '', mins && !days ? `${mins} phút` : ''];
  return parts.filter(Boolean).join(' ') || null;
}

export const emptyMarket = (): MarketData => ({
  shares: [],
  topSellers: [],
  priceBands: [],
  promotions: [],
  history: { dates: [], rows: [] },
  flashCalendar: { dates: [], rows: [] },
});

/** [200k, 400k] → "Dưới 200k", "200k – 400k", "Từ 400k" */
export function makeBands(edges: number[]): { label: string; from: number; to: number }[] {
  const sorted = [...new Set(edges)].sort((a, b) => a - b);
  const bands: { label: string; from: number; to: number }[] = [];
  let from = 0;
  for (const edge of sorted) {
    bands.push({ label: from === 0 ? `Dưới ${money(edge)}` : `${money(from)} – ${money(edge)}`, from, to: edge });
    from = edge;
  }
  bands.push({ label: `Từ ${money(from)}`, from, to: Number.POSITIVE_INFINITY });
  return bands;
}

function money(v: number): string {
  if (v >= 1_000_000) return `${Number((v / 1_000_000).toFixed(1))}tr`;
  return `${Math.round(v / 1000)}k`;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function orderOf(order: string[], slug: string): number {
  const i = order.indexOf(slug);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
const round1OrNull = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

function avgOrNull(values: (number | null | undefined)[], round = true): number | null {
  const xs = values.filter((v): v is number => v != null);
  if (xs.length === 0) return null;
  const a = sum(xs) / xs.length;
  return round ? Math.round(a) : a;
}
