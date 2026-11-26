/**
 * Tiện ích ngày tháng làm việc với chuỗi 'YYYY-MM-DD' (ngày theo múi giờ VN).
 * Dùng chuỗi thay vì Date để tránh lỗi lệch múi giờ khi so sánh/lưu DB.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function assertDateString(value: string, field = 'date'): string {
  if (!isDateString(value)) throw new Error(`${field} không hợp lệ (cần dạng YYYY-MM-DD): ${value}`);
  return value;
}

/** Ngày hiện tại (YYYY-MM-DD) theo múi giờ cho trước. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  // en-CA cho ra dạng YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function toUtcDate(date: string): Date {
  return new Date(`${assertDateString(date)}T00:00:00Z`);
}

function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

/** 1 = Thứ Hai ... 7 = Chủ Nhật (chuẩn ISO). */
export function isoDayOfWeek(date: string): number {
  const day = toUtcDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfIsoWeek(date: string): string {
  return addDays(date, 1 - isoDayOfWeek(date));
}

/** Năm & số tuần theo chuẩn ISO-8601 (tuần bắt đầu Thứ Hai). */
export function isoWeek(date: string): { year: number; week: number } {
  const thursday = addDays(date, 4 - isoDayOfWeek(date));
  const year = Number(thursday.slice(0, 4));
  const jan1 = `${year}-01-01`;
  const diffDays = (toUtcDate(thursday).getTime() - toUtcDate(jan1).getTime()) / 86_400_000;
  return { year, week: Math.floor(diffDays / 7) + 1 };
}

export function startOfMonth(date: string): string {
  return `${assertDateString(date).slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const d = toUtcDate(startOfMonth(date));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromUtcDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

/**
 * Parse thời gian ĐMX trả về (vd '2026-11-26T00:00:00', không kèm múi giờ – là giờ VN).
 */
export function parseVnDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const d = new Date(hasOffset ? value : `${value}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
