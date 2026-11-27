import type { TrackingConfig } from '../config/tracking';
import type { ProductFilter } from '../db/rowMappers';
import type { PriceSnapshot, StoredProduct } from '../domain/types';
import { analyze, type ReportData } from './analysis';
import { resolvePeriod, type PeriodType } from './period';

export interface ReportRequest {
  type: PeriodType;
  /** Ngày bất kỳ trong tuần/tháng cần xuất (mặc định hôm nay) */
  date?: string;
  from?: string;
  to?: string;
  filter?: ProductFilter;
}

/**
 * Nguồn dữ liệu cho báo cáo. Có 2 cách cài đặt:
 *  - SqlStore (đọc thẳng DB – dùng cho lệnh `npm run export` trên Node)
 *  - ApiReportSource (gọi API – dùng trên trình duyệt, src/client/report.ts)
 */
export interface ReportSource {
  crawlDates(from: string, to: string): Promise<string[]>;
  latestDateBefore(date: string): Promise<string | null>;
  firstCrawlDate(): Promise<string | null>;
  products(filter?: ProductFilter): Promise<StoredProduct[]>;
  snapshotsBetween(from: string, to: string, filter?: ProductFilter): Promise<PriceSnapshot[]>;
}

/** Lấy dữ liệu cần thiết rồi phân tích → ReportData (chưa đụng tới Excel). */
export async function buildReportData(
  source: ReportSource,
  tracking: TrackingConfig,
  req: ReportRequest,
  today: string,
): Promise<ReportData> {
  const period = resolvePeriod(req, today);
  const [datesInPeriod, baselineDate, firstEverCrawlDate, products] = await Promise.all([
    source.crawlDates(period.from, period.to),
    source.latestDateBefore(period.from),
    source.firstCrawlDate(),
    source.products(req.filter),
  ]);
  const endDate = datesInPeriod.at(-1) ?? null;
  const snapshots = endDate ? await source.snapshotsBetween(baselineDate ?? period.from, endDate, req.filter) : [];

  return analyze({
    period,
    products,
    snapshots,
    baselineDate,
    endDate,
    firstEverCrawlDate,
    ownBrand: tracking.ownBrand,
    competitorBrands: tracking.competitorBrands,
    segment: tracking.segment,
    categoryOrder: tracking.categories.map((c) => c.slug),
    market: tracking.report,
  });
}

export function reportFileName(data: ReportData): string {
  const kind = data.period.type === 'week' ? 'Tuan' : data.period.type === 'month' ? 'Thang' : 'TuyChon';
  return `DMX_BaoCao_${kind}_${data.period.label}.xlsx`;
}
