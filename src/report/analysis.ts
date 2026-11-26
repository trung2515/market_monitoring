import type { TrackingConfig } from '../config/tracking';
import type { PriceSnapshot, StoredProduct } from '../domain/types';
import { normalizeBrand } from '../utils/text';
import type { Period } from './period';

/**
 * Toàn bộ logic phân tích là hàm thuần (không đụng DB/Excel) → dễ test, dễ đổi quy tắc.
 */

export interface ProductView {
  product: StoredProduct;
  snapshot: PriceSnapshot;
}

export interface PriceChange extends ProductView {
  before: PriceSnapshot;
  diff: number;
  diffPercent: number;
  minPrice: number | null;
  maxPrice: number | null;
  /** Số lần đổi giá trong kỳ */
  changeCount: number;
}

export interface SoldDelta extends ProductView {
  soldBefore: number;
  soldAfter: number;
  delta: number;
}

export interface GoneProduct {
  product: StoredProduct;
  lastSnapshot: PriceSnapshot;
}

export interface SegmentMatch {
  own: ProductView;
  competitor: ProductView | null;
  priceDiff: number | null;
  priceDiffPercent: number | null;
  source: 'auto' | 'manual' | 'none';
  note?: string;
}

export interface BrandSummaryRow {
  categoryName: string;
  brand: string;
  role: 'own' | 'competitor' | 'other';
  skuCount: number;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  avgDiscount: number | null;
  flashSkuCount: number;
  newCount: number;
  goneCount: number;
  priceUp: number;
  priceDown: number;
  soldDelta: number;
}

export interface ReportData {
  period: Period;
  baselineDate: string | null;
  endDate: string | null;
  crawlDates: string[];
  current: ProductView[];
  priceChanges: PriceChange[];
  newProducts: ProductView[];
  goneProducts: GoneProduct[];
  soldDeltas: SoldDelta[];
  segments: SegmentMatch[];
  brandSummary: BrandSummaryRow[];
  ownBrand: string;
  notes: string[];
}

export interface AnalysisInput {
  period: Period;
  products: StoredProduct[];
  /** Snapshot từ baselineDate (nếu có) đến endDate */
  snapshots: PriceSnapshot[];
  baselineDate: string | null;
  endDate: string | null;
  firstEverCrawlDate: string | null;
  ownBrand: string;
  competitorBrands: string[];
  segment: TrackingConfig['segment'];
}

export function analyze(input: AnalysisInput): ReportData {
  const { period, baselineDate, endDate } = input;
  const productsByCode = new Map(input.products.map((p) => [p.productCode, p]));
  const own = normalizeBrand(input.ownBrand);
  const competitors = new Set(input.competitorBrands.map(normalizeBrand));
  const roleOf = (brand: string): BrandSummaryRow['role'] => {
    const b = normalizeBrand(brand);
    if (b === own) return 'own';
    return competitors.size === 0 || competitors.has(b) ? 'competitor' : 'other';
  };

  const notes: string[] = [];
  const empty: ReportData = {
    period,
    baselineDate,
    endDate,
    crawlDates: [],
    current: [],
    priceChanges: [],
    newProducts: [],
    goneProducts: [],
    soldDeltas: [],
    segments: [],
    brandSummary: [],
    ownBrand: input.ownBrand,
    notes,
  };
  if (!endDate) {
    notes.push('Không có dữ liệu cào nào trong kỳ này.');
    return empty;
  }

  // Gom snapshot theo sản phẩm, đã sắp xếp theo ngày
  const series = new Map<string, PriceSnapshot[]>();
  for (const s of [...input.snapshots].sort((a, b) => a.crawlDate.localeCompare(b.crawlDate))) {
    if (!productsByCode.has(s.productCode)) continue;
    const list = series.get(s.productCode) ?? [];
    list.push(s);
    series.set(s.productCode, list);
  }

  const crawlDates = [...new Set(input.snapshots.map((s) => s.crawlDate))]
    .filter((d) => d >= period.from && d <= endDate)
    .sort();
  const effectiveBaseline = baselineDate ?? crawlDates[0] ?? null;
  if (!baselineDate) {
    notes.push(
      `Chưa có dữ liệu trước ngày ${period.from} – các so sánh "đầu kỳ" dùng ngày cào đầu tiên trong kỳ (${effectiveBaseline}).`,
    );
  }
  if (crawlDates.length === 1) notes.push('Kỳ này mới có 1 ngày dữ liệu nên chưa thấy được biến động.');

  const at = (code: string, date: string | null) =>
    date ? series.get(code)?.find((s) => s.crawlDate === date) : undefined;
  const inPeriod = (code: string) => (series.get(code) ?? []).filter((s) => s.crawlDate >= period.from);

  // ---- Hiện trạng cuối kỳ ----
  const current: ProductView[] = [];
  for (const [code, list] of series) {
    const snapshot = list.find((s) => s.crawlDate === endDate);
    const product = productsByCode.get(code);
    if (snapshot && product) current.push({ product, snapshot });
  }
  current.sort(compareView);

  // ---- Biến động giá ----
  const priceChanges: PriceChange[] = [];
  for (const view of current) {
    const before = at(view.product.productCode, effectiveBaseline);
    if (!before || before.price == null || view.snapshot.price == null) continue;
    if (before.price === view.snapshot.price) continue;
    const prices = inPeriod(view.product.productCode)
      .map((s) => s.price)
      .filter((p): p is number => p != null);
    priceChanges.push({
      ...view,
      before,
      diff: view.snapshot.price - before.price,
      diffPercent: round1(((view.snapshot.price - before.price) / before.price) * 100),
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      changeCount: countChanges(series.get(view.product.productCode) ?? []),
    });
  }
  priceChanges.sort((a, b) => a.diffPercent - b.diffPercent);

  // ---- Sản phẩm mới ----
  const newCodes = new Set<string>();
  const newProducts: ProductView[] = [];
  for (const product of input.products) {
    const isNew =
      product.firstSeenDate >= period.from &&
      product.firstSeenDate <= period.to &&
      (!input.firstEverCrawlDate || product.firstSeenDate > input.firstEverCrawlDate);
    const latest = inPeriod(product.productCode).at(-1);
    if (isNew && latest) {
      newCodes.add(product.productCode);
      newProducts.push({ product, snapshot: latest });
    }
  }
  newProducts.sort(compareView);

  // ---- Ngừng hiển thị (có ở đầu kỳ, không còn ở cuối kỳ) ----
  const currentCodes = new Set(current.map((c) => c.product.productCode));
  const goneProducts: GoneProduct[] = [];
  if (effectiveBaseline && effectiveBaseline !== endDate) {
    for (const [code, list] of series) {
      if (currentCodes.has(code)) continue;
      const product = productsByCode.get(code);
      const base = list.find((s) => s.crawlDate === effectiveBaseline);
      if (product && base) goneProducts.push({ product, lastSnapshot: list.at(-1) ?? base });
    }
  }
  goneProducts.sort((a, b) => compareView({ product: a.product, snapshot: a.lastSnapshot }, { product: b.product, snapshot: b.lastSnapshot }));

  // ---- Lượt bán tăng thêm ----
  const soldDeltas: SoldDelta[] = [];
  for (const view of current) {
    const code = view.product.productCode;
    const before = at(code, effectiveBaseline) ?? inPeriod(code)[0];
    const soldBefore = soldValue(before);
    const soldAfter = soldValue(view.snapshot);
    if (!before || before === view.snapshot || soldBefore == null || soldAfter == null) continue;
    soldDeltas.push({ ...view, soldBefore, soldAfter, delta: Math.max(0, soldAfter - soldBefore) });
  }
  soldDeltas.sort((a, b) => b.delta - a.delta);

  // ---- So sánh phân khúc ----
  const segments = matchSegments(current, own, roleOf, input.segment);

  // ---- Tổng hợp theo hãng ----
  const changeByCode = new Map(priceChanges.map((c) => [c.product.productCode, c]));
  const soldByCode = new Map(soldDeltas.map((s) => [s.product.productCode, s.delta]));
  const goneByKey = new Map<string, number>();
  for (const g of goneProducts) {
    const key = `${g.product.categoryName}|${g.product.brand}`;
    goneByKey.set(key, (goneByKey.get(key) ?? 0) + 1);
  }

  const groups = new Map<string, ProductView[]>();
  for (const v of current) {
    const key = `${v.product.categoryName}|${v.product.brand}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  const brandSummary: BrandSummaryRow[] = [...groups.entries()].map(([key, views]) => {
    const [categoryName = '', brand = ''] = key.split('|');
    const prices = views.map((v) => v.snapshot.price).filter((p): p is number => p != null);
    const discounts = views.map((v) => v.snapshot.discountPercent).filter((d): d is number => d != null);
    return {
      categoryName,
      brand,
      role: roleOf(brand),
      skuCount: views.length,
      avgPrice: prices.length ? Math.round(avg(prices)) : null,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      avgDiscount: discounts.length ? round1(avg(discounts)) : null,
      flashSkuCount: views.filter((v) => v.snapshot.flashPrice != null).length,
      newCount: views.filter((v) => newCodes.has(v.product.productCode)).length,
      goneCount: goneByKey.get(key) ?? 0,
      priceUp: views.filter((v) => (changeByCode.get(v.product.productCode)?.diff ?? 0) > 0).length,
      priceDown: views.filter((v) => (changeByCode.get(v.product.productCode)?.diff ?? 0) < 0).length,
      soldDelta: views.reduce((s, v) => s + (soldByCode.get(v.product.productCode) ?? 0), 0),
    };
  });
  const roleOrder = { own: 0, competitor: 1, other: 2 } as const;
  brandSummary.sort(
    (a, b) =>
      a.categoryName.localeCompare(b.categoryName, 'vi') ||
      roleOrder[a.role] - roleOrder[b.role] ||
      b.skuCount - a.skuCount,
  );

  return {
    ...empty,
    baselineDate: effectiveBaseline,
    crawlDates,
    current,
    priceChanges,
    newProducts,
    goneProducts,
    soldDeltas,
    segments,
    brandSummary,
  };
}

/**
 * Ghép sản phẩm của khách (own) với sản phẩm đối thủ cùng phân khúc:
 * cùng danh mục, cùng là "bộ"/"lẻ", cùng kích thước (nếu xác định được), giá chênh trong ±x%.
 */
export function matchSegments(
  current: ProductView[],
  ownBrand: string,
  roleOf: (brand: string) => BrandSummaryRow['role'],
  config: TrackingConfig['segment'],
): SegmentMatch[] {
  const ownViews = current.filter((v) => normalizeBrand(v.product.brand) === ownBrand);
  const rivals = current.filter((v) => roleOf(v.product.brand) === 'competitor');
  const byModel = new Map(current.map((v) => [v.product.modelCode.toUpperCase(), v]));
  const tolerance = config.priceTolerancePercent / 100;
  const result: SegmentMatch[] = [];

  for (const own of ownViews) {
    const ownPrice = own.snapshot.price;
    const rows: SegmentMatch[] = [];

    for (const pair of config.manualPairs) {
      if (pair.own.toUpperCase() !== own.product.modelCode.toUpperCase()) continue;
      const competitor = byModel.get(pair.competitor.toUpperCase());
      if (competitor) rows.push(makeMatch(own, competitor, 'manual', pair.note));
    }

    if (ownPrice != null) {
      const auto = rivals
        .filter(
          (r) =>
            r.product.categorySlug === own.product.categorySlug &&
            r.product.isSet === own.product.isSet &&
            (own.product.sizeKey == null || r.product.sizeKey === own.product.sizeKey) &&
            r.snapshot.price != null &&
            Math.abs(r.snapshot.price - ownPrice) <= ownPrice * tolerance &&
            !rows.some((m) => m.competitor?.product.productCode === r.product.productCode),
        )
        .sort((a, b) => Math.abs((a.snapshot.price ?? 0) - ownPrice) - Math.abs((b.snapshot.price ?? 0) - ownPrice))
        .slice(0, config.maxCompetitorsPerProduct);
      rows.push(...auto.map((r) => makeMatch(own, r, 'auto')));
    }

    result.push(...(rows.length ? rows : [{ own, competitor: null, priceDiff: null, priceDiffPercent: null, source: 'none' as const }]));
  }
  return result;
}

function makeMatch(own: ProductView, competitor: ProductView, source: 'auto' | 'manual', note?: string): SegmentMatch {
  const op = own.snapshot.price;
  const cp = competitor.snapshot.price;
  const diff = op != null && cp != null ? cp - op : null;
  return {
    own,
    competitor,
    priceDiff: diff,
    priceDiffPercent: diff != null && op ? round1((diff / op) * 100) : null,
    source,
    note,
  };
}

function countChanges(list: PriceSnapshot[]): number {
  let count = 0;
  let prev: number | null = null;
  for (const s of list) {
    if (s.price == null) continue;
    if (prev != null && s.price !== prev) count++;
    prev = s.price;
  }
  return count;
}

const soldValue = (s: PriceSnapshot | undefined) => s?.totalRate ?? s?.soldCount ?? null;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (n: number) => Math.round(n * 10) / 10;

function compareView(a: ProductView, b: ProductView): number {
  return (
    a.product.categoryName.localeCompare(b.product.categoryName, 'vi') ||
    a.product.brand.localeCompare(b.product.brand, 'vi') ||
    (a.snapshot.price ?? 0) - (b.snapshot.price ?? 0)
  );
}
