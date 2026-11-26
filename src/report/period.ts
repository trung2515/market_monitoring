import {
  addDays,
  assertDateString,
  daysBetween,
  endOfMonth,
  isoWeek,
  startOfIsoWeek,
  startOfMonth,
} from '../utils/date';

export type PeriodType = 'week' | 'month' | 'custom';

export interface Period {
  type: PeriodType;
  /** Ngày bắt đầu (bao gồm) */
  from: string;
  /** Ngày kết thúc (bao gồm) */
  to: string;
  /** Nhãn hiển thị & đặt tên file, vd "2026-W48", "2026-11", "2026-11-01_2026-11-15" */
  label: string;
  title: string;
}

/** Tuần ISO (Thứ Hai → Chủ Nhật) chứa ngày refDate. */
export function weekPeriod(refDate: string): Period {
  const from = startOfIsoWeek(refDate);
  const to = addDays(from, 6);
  const { year, week } = isoWeek(refDate);
  const w = String(week).padStart(2, '0');
  return { type: 'week', from, to, label: `${year}-W${w}`, title: `Tuần ${w}/${year} (${from} → ${to})` };
}

/** Tháng chứa ngày refDate. */
export function monthPeriod(refDate: string): Period {
  const from = startOfMonth(refDate);
  const to = endOfMonth(refDate);
  const ym = from.slice(0, 7);
  return { type: 'month', from, to, label: ym, title: `Tháng ${ym.slice(5)}/${ym.slice(0, 4)}` };
}

export function customPeriod(from: string, to: string): Period {
  assertDateString(from, 'from');
  assertDateString(to, 'to');
  if (daysBetween(from, to) < 0) throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
  return { type: 'custom', from, to, label: `${from}_${to}`, title: `Từ ${from} đến ${to}` };
}

export function resolvePeriod(input: { type: PeriodType; date?: string; from?: string; to?: string }, today: string) {
  switch (input.type) {
    case 'week':
      return weekPeriod(assertDateString(input.date ?? today));
    case 'month':
      return monthPeriod(assertDateString(input.date ?? today));
    case 'custom':
      if (!input.from || !input.to) throw new Error('Kỳ tuỳ chọn cần đủ from và to');
      return customPeriod(input.from, input.to);
  }
}
