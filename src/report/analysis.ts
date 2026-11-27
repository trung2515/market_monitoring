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

export interface CompetitorMatch {
  competitor: ProductView;
  /** Giá đối thủ − giá sản phẩm của công ty */
  priceDiff: number | null;
  priceDiffPercent: number | null;
  /** Cùng kích thước / dung tích với sản phẩm của công ty */
  sameSize: boolean;
  source: 'auto' | 'manual';
  note?: string;
}

/** 1 sản phẩm của công ty (Elmich) kèm các đối thủ cùng tầm giá. */
export interface OwnProductRow {
  own: ProductView;
  competitors: CompetitorMatch[];
}

/** Dữ liệu cho 1 sheet danh mục (vd "Bình đun siêu tốc"). */
export interface CategoryReport {
  slug: string;
  name: string;
  /** Sản phẩm của công ty, sắp theo giá tăng dần */
  ownRows: OwnProductRow[];
  /** Toàn bộ sản phẩm (mọi hãng) trong danh mục, sắp theo giá tăng dần */
  products: ProductView[];
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
  categories: CategoryReport[];
  brandSummary: BrandSummaryRow[];
  ownBrand: string;
  /** Ngưỡng ±% giá để coi là cùng tầm giá */
  priceTolerancePercent: number;
  /** Số đối thủ tối đa cạnh mỗi sản phẩm của công ty */
  maxCompetitors: number;
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
  /** Thứ tự danh mục (slug) như trong config – dùng để sắp các sheet */
  categoryOrder?: string[];
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
    categories: [],
    brandSummary: [],
    ownBrand: input.ownBrand,
    priceTolerancePercent: input.segment.priceTolerancePercent,
    maxCompetitors: input.segment.maxCompetitorsPerProduct,
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
  goneProducts.sort((a, b) =>
    compareView({ product: a.product, snapshot: a.lastSnapshot }, { product: b.product, snapshot: b.lastSnapshot }),
  );

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

  // ---- Từng danh mục: SP của công ty + đối thủ cùng tầm giá ----
  const categories = buildCategoryReports(current, own, roleOf, input.segment, input.categoryOrder ?? []);

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
    categories,
    brandSummary,
  };
}

/**
 * Chia sản phẩm cuối kỳ theo danh mục; với mỗi SP của công ty tìm đối thủ cùng tầm giá.
 */
export function buildCategoryReports(
  current: ProductView[],
  ownBrand: string,
  roleOf: (brand: string) => BrandSummaryRow['role'],
  config: TrackingConfig['segment'],
  categoryOrder: string[],
): CategoryReport[] {
  const groups = new Map<string, ProductView[]>();
  for (const v of current) {
    groups.set(v.product.categorySlug, [...(groups.get(v.product.categorySlug) ?? []), v]);
  }

  const byModel = new Map(current.map((v) => [v.product.modelCode.toUpperCase(), v]));
  const order = (slug: string) => {
    const i = categoryOrder.indexOf(slug);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };

  return [...groups.entries()]
    .map(([slug, views]) => {
      const sorted = [...views].sort(byPrice);
      const isOwn = (v: ProductView) => normalizeBrand(v.product.brand) === ownBrand;
      const rivals = sorted.filter(
        (v) => !isOwn(v) && (!config.onlyListedCompetitors || roleOf(v.product.brand) === 'competitor'),
      );
      const ownRows = sorted
        .filter(isOwn)
        .map((own) => ({ own, competitors: findCompetitors(own, rivals, byModel, config) }));
      return { slug, name: views[0]?.product.categoryName ?? slug, ownRows, products: sorted };
    })
    .sort((a, b) => order(a.slug) - order(b.slug) || a.name.localeCompare(b.name, 'vi'));
}

/**
 * Đối thủ cùng tầm giá của 1 sản phẩm:
 *  1. Cặp ghép tay trong config (luôn đứng đầu)
 *  2. Tự động: cùng loại bộ/lẻ, giá bán chênh trong ±x%; ưu tiên cùng kích thước, rồi giá gần nhất
 */
export function findCompetitors(
  own: ProductView,
  rivals: ProductView[],
  byModel: Map<string, ProductView>,
  config: TrackingConfig['segment'],
): CompetitorMatch[] {
  const result: CompetitorMatch[] = [];
  const ownModel = own.product.modelCode.toUpperCase();

  for (const pair of config.manualPairs) {
    if (!ownModel || pair.own.toUpperCase() !== ownModel) continue;
    const competitor = byModel.get(pair.competitor.toUpperCase());
    if (competitor) result.push(makeMatch(own, competitor, 'manual', pair.note));
  }

  const ownPrice = own.snapshot.price;
  if (ownPrice == null) return result.slice(0, config.maxCompetitorsPerProduct);

  const tolerance = (config.priceTolerancePercent / 100) * ownPrice;
  const taken = new Set(result.map((m) => m.competitor.product.productCode));
  const auto = rivals
    .filter(
      (r) =>
        !taken.has(r.product.productCode) &&
        r.product.isSet === own.product.isSet &&
        r.snapshot.price != null &&
        Math.abs(r.snapshot.price - ownPrice) <= tolerance,
    )
    .map((r) => makeMatch(own, r, 'auto'))
    .sort((a, b) => Number(b.sameSize) - Number(a.sameSize) || Math.abs(a.priceDiff ?? 0) - Math.abs(b.priceDiff ?? 0));

  return [...result, ...auto].slice(0, config.maxCompetitorsPerProduct);
}

function makeMatch(
  own: ProductView,
  competitor: ProductView,
  source: 'auto' | 'manual',
  note?: string,
): CompetitorMatch {
  const op = own.snapshot.price;
  const cp = competitor.snapshot.price;
  const diff = op != null && cp != null ? cp - op : null;
  return {
    competitor,
    priceDiff: diff,
    priceDiffPercent: diff != null && op ? round1((diff / op) * 100) : null,
    sameSize: own.product.sizeKey != null && own.product.sizeKey === competitor.product.sizeKey,
    source,
    note,
  };
}

function byPrice(a: ProductView, b: ProductView): number {
  return (
    (a.snapshot.price ?? Number.MAX_SAFE_INTEGER) - (b.snapshot.price ?? Number.MAX_SAFE_INTEGER) ||
    a.product.brand.localeCompare(b.product.brand, 'vi')
  );
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
