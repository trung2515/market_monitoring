import type * as ExcelJS from 'exceljs';
import type { TrackingConfig } from '../config/tracking';
import type { ProductRepository } from '../db/repositories/productRepository';
import type { SnapshotRepository } from '../db/repositories/snapshotRepository';
import type { ProductFilter } from '../db/rowMappers';
import { todayInTimeZone } from '../utils/date';
import { analyze, type ReportData } from './analysis';
import { buildWorkbook } from './excel/workbook';
import { resolvePeriod, type PeriodType } from './period';

export interface ReportRequest {
  type: PeriodType;
  /** Ngày bất kỳ trong tuần/tháng cần xuất (mặc định hôm nay) */
  date?: string;
  from?: string;
  to?: string;
  filter?: ProductFilter;
}

interface ReportServiceDeps {
  products: ProductRepository;
  snapshots: SnapshotRepository;
  tracking: TrackingConfig;
  timeZone: string;
}

/** Lấy dữ liệu từ DB → phân tích → dựng file Excel. */
export class ReportService {
  constructor(private readonly deps: ReportServiceDeps) {}

  buildData(req: ReportRequest): ReportData {
    const { products, snapshots, tracking, timeZone } = this.deps;
    const period = resolvePeriod(req, todayInTimeZone(timeZone));

    const datesInPeriod = snapshots.crawlDates(period.from, period.to);
    const endDate = datesInPeriod.at(-1) ?? null;
    const baselineDate = snapshots.latestDateBefore(period.from);

    const snaps = endDate ? snapshots.findBetween(baselineDate ?? period.from, endDate, req.filter) : [];

    return analyze({
      period,
      products: products.findAll(req.filter),
      snapshots: snaps,
      baselineDate,
      endDate,
      firstEverCrawlDate: snapshots.firstCrawlDate(),
      ownBrand: tracking.ownBrand,
      competitorBrands: tracking.competitorBrands,
      segment: tracking.segment,
    });
  }

  buildExcel(req: ReportRequest): { workbook: ExcelJS.Workbook; fileName: string; data: ReportData } {
    const data = this.buildData(req);
    const workbook = buildWorkbook(data);
    const fileName = `DMX_BaoCao_${data.period.type === 'week' ? 'Tuan' : data.period.type === 'month' ? 'Thang' : 'TuyChon'}_${data.period.label}.xlsx`;
    return { workbook, fileName, data };
  }
}
