import type { PriceSnapshot } from '../domain/types';
import { startOfIsoWeek, startOfMonth } from '../utils/date';

/**
 * Số lượng bán trong ngày / tuần / tháng (tính tới ngày cuối của báo cáo).
 *
 * ĐMX chỉ công bố tổng "đã bán" cộng dồn, nên:
 *   bán trong khoảng = đã bán ngày cuối − đã bán ngày mốc
 * Ngày mốc:
 *   - Trong ngày:  lần cào gần nhất TRƯỚC ngày cuối
 *   - Trong tuần:  lần cào gần nhất trước thứ Hai của tuần (chưa có thì lấy lần cào đầu tiên trong tuần)
 *   - Trong tháng: lần cào gần nhất trước ngày 1 của tháng (chưa có thì lấy lần cào đầu tiên trong tháng)
 */

export type SalesWindow = 'day' | 'week' | 'month';

export interface SalesWindows {
  endDate: string;
  /** Ngày mốc dùng để trừ cho từng khoảng (null = chưa đủ dữ liệu) */
  baseDates: Record<SalesWindow, string | null>;
  /** productCode → số bán trong từng khoảng (null = không tính được) */
  byCode: Map<string, Record<SalesWindow, number | null>>;
}

export interface SalesSource {
  latestDateBefore(date: string): Promise<string | null>;
  crawlDates(from: string, to: string): Promise<string[]>;
}

/** Đã bán cộng dồn: `totalRate` là số chính xác, `soldCount` là số đổi từ chữ làm tròn ("25,2k"). */
export const soldTotal = (s: PriceSnapshot | undefined): number | null => s?.totalRate ?? s?.soldCount ?? null;

/** Tìm ngày mốc cho từng khoảng. */
export async function salesBaseDates(source: SalesSource, endDate: string): Promise<Record<SalesWindow, string | null>> {
  const baseFor = async (windowStart: string | null) => {
    if (windowStart === null) return source.latestDateBefore(endDate);
    const before = await source.latestDateBefore(windowStart);
    if (before) return before;
    const inside = (await source.crawlDates(windowStart, endDate)).filter((d) => d < endDate);
    return inside[0] ?? null;
  };
  const [day, week, month] = await Promise.all([
    baseFor(null),
    baseFor(startOfIsoWeek(endDate)),
    baseFor(startOfMonth(endDate)),
  ]);
  return { day, week, month };
}

/** Tính số bán từng khoảng từ snapshot ngày cuối và snapshot các ngày mốc. */
export function computeSales(
  endDate: string,
  baseDates: Record<SalesWindow, string | null>,
  snapshots: PriceSnapshot[],
): SalesWindows {
  const at = new Map<string, PriceSnapshot>();
  for (const s of snapshots) at.set(`${s.crawlDate}|${s.productCode}`, s);

  const byCode = new Map<string, Record<SalesWindow, number | null>>();
  for (const s of snapshots) {
    if (s.crawlDate !== endDate) continue;
    const now = soldTotal(s);
    const diff = (base: string | null) => {
      if (!base || now == null) return null;
      const before = soldTotal(at.get(`${base}|${s.productCode}`));
      return before == null ? null : Math.max(0, now - before);
    };
    byCode.set(s.productCode, { day: diff(baseDates.day), week: diff(baseDates.week), month: diff(baseDates.month) });
  }
  return { endDate, baseDates, byCode };
}
