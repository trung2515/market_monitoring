/// <reference lib="dom" />
/**
 * Tạo file Excel NGAY TRÊN TRÌNH DUYỆT (bundle bằng esbuild → public/report.bundle.js).
 *
 * Lý do: Cloudflare Workers gói free chỉ cho ~10 ms CPU mỗi lần chạy – không đủ để dựng file Excel.
 * Trình duyệt tải dữ liệu thô qua API (chia theo từng ngày), rồi dùng lại nguyên code phân tích
 * (src/report/analysis.ts) và code dựng Excel (src/report/excel) như bản chạy trên Node.
 */
import { parseTrackingConfig } from '../config/tracking';
import type { ProductFilter } from '../db/rowMappers';
import type { PriceSnapshot, StoredProduct } from '../domain/types';
import { buildWorkbook } from '../report/excel/workbook';
import type { PeriodType } from '../report/period';
import type { ReportData } from '../report/analysis';
import { buildReportData, reportFileName, type ReportSource } from '../report/reportBuilder';
import { todayInTimeZone } from '../utils/date';

export interface DownloadParams {
  period: PeriodType;
  date?: string;
  from?: string;
  to?: string;
  categories?: string[];
  brands?: string[];
}

type Progress = (message: string) => void;

const EMPTY_SNAPSHOT: Omit<PriceSnapshot, 'crawlDate' | 'productCode' | 'categorySlug'> = {
  price: null,
  listPrice: null,
  discountPercent: null,
  flashPrice: null,
  isAvailable: false,
  soldCount: null,
  soldText: null,
  totalRate: null,
  rating: null,
  promoStart: null,
  promoEnd: null,
  flashStart: null,
  flashEnd: null,
  flashHours: null,
  flashQuota: null,
  giftText: null,
  giftValue: null,
  promoLabels: null,
  installment: null,
  otherPromos: null,
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try {
      message = ((await res.json()) as { error?: string }).error || message;
    } catch {
      /* không phải JSON */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function matchesFilter(p: StoredProduct, filter?: ProductFilter): boolean {
  if (filter?.categories?.length && !filter.categories.includes(p.categorySlug)) return false;
  if (filter?.brands?.length && !filter.brands.some((b) => b.toLowerCase() === p.brand.toLowerCase())) return false;
  return true;
}

/** Nguồn dữ liệu báo cáo lấy qua API (thay cho đọc DB trực tiếp). */
class ApiReportSource implements ReportSource {
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(private readonly onProgress: Progress) {}

  private memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.cache.has(key)) this.cache.set(key, load());
    return this.cache.get(key) as Promise<T>;
  }

  private range(from: string, to: string) {
    return this.memo(`dates|${from}|${to}`, () =>
      getJson<{ dates: string[]; baselineDate: string | null; firstCrawlDate: string | null }>(
        `/api/report/dates?from=${from}&to=${to}`,
      ),
    );
  }

  async crawlDates(from: string, to: string) {
    return (await this.range(from, to)).dates;
  }
  async latestDateBefore(date: string) {
    return (await this.range(date, date)).baselineDate;
  }
  async firstCrawlDate() {
    return (await this.range('0000-01-01', '0000-01-01')).firstCrawlDate;
  }

  async products(filter?: ProductFilter): Promise<StoredProduct[]> {
    const { products } = await this.memo('products', () =>
      getJson<{ products: Partial<StoredProduct>[] }>('/api/report/products'),
    );
    return products
      .map(
        (p) =>
          ({
            specs: [],
            sizeKey: null,
            isSet: false,
            isOnlineOnly: false,
            modelCode: '',
            imageUrl: '',
            ...p,
          }) as StoredProduct,
      )
      .filter((p) => matchesFilter(p, filter));
  }

  async snapshotsBetween(from: string, to: string, filter?: ProductFilter): Promise<PriceSnapshot[]> {
    const [dates, allowed] = await Promise.all([
      this.crawlDates(from, to),
      this.products(filter).then((ps) => new Set(ps.map((p) => p.productCode))),
    ]);
    const result: PriceSnapshot[] = [];
    let done = 0;
    // Tải song song 4 ngày một lúc
    for (let i = 0; i < dates.length; i += 4) {
      const chunk = await Promise.all(
        dates.slice(i, i + 4).map((d) =>
          getJson<{ snapshots: Partial<PriceSnapshot>[] }>(`/api/report/snapshots?date=${d}`).then((r) => {
            this.onProgress(`Đang tải dữ liệu ${++done}/${dates.length} ngày…`);
            return r.snapshots;
          }),
        ),
      );
      for (const rows of chunk) {
        for (const s of rows) {
          if (s.productCode && allowed.has(s.productCode)) result.push({ ...EMPTY_SNAPSHOT, ...s } as PriceSnapshot);
        }
      }
    }
    return result;
  }
}

/** Tải dữ liệu qua API → phân tích (dùng cho cả file Excel và dashboard trên web). */
export async function data(params: DownloadParams, onProgress: Progress = () => {}): Promise<ReportData> {
  onProgress('Đang tải cấu hình…');
  const options = await getJson<{ tracking: unknown }>('/api/options');
  const tracking = parseTrackingConfig(options.tracking);
  return buildReportData(
    new ApiReportSource(onProgress),
    tracking,
    {
      type: params.period,
      date: params.date,
      from: params.from,
      to: params.to,
      filter: { categories: params.categories ?? [], brands: params.brands ?? [] },
    },
    todayInTimeZone('Asia/Ho_Chi_Minh'),
  );
}

/** Tải dữ liệu → phân tích → dựng Excel → tải file về máy. */
export async function download(params: DownloadParams, onProgress: Progress = () => {}): Promise<string> {
  const reportData = await data(params, onProgress);
  onProgress('Đang tạo file Excel…');
  const workbook = buildWorkbook(reportData);
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = reportFileName(reportData);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return fileName;
}

(globalThis as unknown as { MarketReport: unknown }).MarketReport = { download, data };
