import type * as ExcelJS from 'exceljs';

export type CellFormat = 'text' | 'money' | 'int' | 'percent' | 'decimal' | 'link';

export interface ColumnDef<T> {
  header: string;
  width?: number;
  format?: CellFormat;
  value: (row: T) => string | number | boolean | null | undefined;
  /** Với format 'link': chữ hiển thị (mặc định = URL) */
  linkText?: (row: T) => string;
  /** Nhóm cột – in thành dòng tiêu đề gộp ô phía trên header (vd "Đối thủ 1") */
  group?: string;
  /** Tô màu chữ đỏ/xanh theo dấu của giá trị (cột chênh lệch) */
  signColor?: boolean;
}

export interface TableOptions<T> {
  /** Tiêu đề nhỏ của bảng, in ngay trên header */
  caption?: string;
  columns: ColumnDef<T>[];
  rows: T[];
  /** Tô nền dòng (vd dòng sản phẩm Elmich) */
  highlight?: (row: T) => boolean;
  emptyMessage?: string;
  autoFilter?: boolean;
}

export interface TableSheetOptions<T> extends TableOptions<T> {
  name: string;
  title: string;
  subtitle?: string;
}

export const COLORS = {
  headerBg: 'FF1F4E78',
  headerFg: 'FFFFFFFF',
  groupBg: 'FF2E75B6',
  captionFg: 'FF1F4E78',
  highlightBg: 'FFFFF2CC',
  border: 'FFD9D9D9',
  up: 'FFC00000',
  down: 'FF00B050',
  title: 'FF1F4E78',
  muted: 'FF7F7F7F',
} as const;

const NUM_FORMATS: Partial<Record<CellFormat, string>> = {
  money: '#,##0" ₫";-#,##0" ₫"',
  int: '#,##0',
  percent: '0.0"%"',
  decimal: '0.0',
};

/** Ghi tiêu đề + phụ đề vào 2 dòng đầu sheet; trả về dòng trống tiếp theo. */
export function writeSheetTitle(ws: ExcelJS.Worksheet, title: string, subtitle?: string): number {
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: COLORS.title } };
  if (subtitle) {
    const s = ws.getCell(2, 1);
    s.value = subtitle;
    s.font = { italic: true, color: { argb: COLORS.muted } };
  }
  return 4;
}

/**
 * Ghi 1 bảng bắt đầu từ `startRow` (có thể nhiều bảng trên 1 sheet).
 * Trả về số dòng trống kế tiếp sau bảng.
 */
export function writeTable<T>(ws: ExcelJS.Worksheet, startRow: number, opts: TableOptions<T>): number {
  let row = startRow;

  if (opts.caption) {
    const cell = ws.getCell(row, 1);
    cell.value = opts.caption;
    cell.font = { bold: true, size: 12, color: { argb: COLORS.captionFg } };
    row++;
  }

  // Dòng nhóm cột (gộp ô), nếu có
  if (opts.columns.some((c) => c.group)) {
    let i = 0;
    while (i < opts.columns.length) {
      const group = opts.columns[i]?.group;
      let j = i;
      while (j + 1 < opts.columns.length && opts.columns[j + 1]?.group === group) j++;
      if (group) {
        if (j > i) ws.mergeCells(row, i + 1, row, j + 1);
        const cell = ws.getCell(row, i + 1);
        cell.value = group;
        cell.font = { bold: true, color: { argb: COLORS.headerFg } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.groupBg } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder();
      }
      i = j + 1;
    }
    row++;
  }

  const headerRowIndex = row;
  const headerRow = ws.getRow(row);
  opts.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: COLORS.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  });
  headerRow.height = 32;
  row++;

  if (opts.rows.length === 0) {
    const cell = ws.getCell(row, 1);
    cell.value = opts.emptyMessage ?? 'Không có dữ liệu trong kỳ này.';
    cell.font = { italic: true, color: { argb: COLORS.muted } };
    return row + 2;
  }

  for (const item of opts.rows) {
    const excelRow = ws.getRow(row);
    const highlighted = opts.highlight?.(item) ?? false;

    opts.columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const raw = col.value(item);
      const value = raw === undefined ? null : raw;

      if (col.format === 'link' && typeof value === 'string' && value) {
        cell.value = { text: col.linkText?.(item) ?? value, hyperlink: value };
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      } else {
        cell.value = typeof value === 'boolean' ? (value ? 'Có' : 'Không') : value;
      }

      const fmt = col.format ? NUM_FORMATS[col.format] : undefined;
      if (fmt) cell.numFmt = fmt;
      if (col.signColor && typeof value === 'number' && value !== 0) {
        cell.font = { bold: true, color: { argb: value > 0 ? COLORS.up : COLORS.down } };
      }
      if (highlighted) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.highlightBg } };
      }
      cell.border = thinBorder();
    });
    row++;
  }

  if (opts.autoFilter) {
    ws.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: row - 1, column: opts.columns.length },
    };
  }
  return row + 2;
}

/** Đặt độ rộng cột theo bảng rộng nhất trên sheet. */
export function setColumnWidths(ws: ExcelJS.Worksheet, ...tables: ColumnDef<never>[][]): void {
  const count = Math.max(...tables.map((t) => t.length));
  for (let i = 0; i < count; i++) {
    const width = Math.max(...tables.map((t) => t[i]?.width ?? 0), 10);
    ws.getColumn(i + 1).width = width;
  }
}

/**
 * Sheet chỉ có 1 bảng: tiêu đề, header có màu, freeze header, auto-filter, định dạng số.
 * Thêm/bớt cột chỉ cần sửa mảng `columns`.
 */
export function addTableSheet<T>(wb: ExcelJS.Workbook, opts: TableSheetOptions<T>): ExcelJS.Worksheet {
  const hasGroup = opts.columns.some((c) => c.group);
  const headerRow = 4 + (opts.caption ? 1 : 0) + (hasGroup ? 1 : 0);
  const ws = wb.addWorksheet(sheetName(opts.name), {
    views: [{ state: 'frozen', ySplit: headerRow, xSplit: 0 }],
  });
  setColumnWidths(ws, opts.columns as ColumnDef<never>[]);
  const start = writeSheetTitle(ws, opts.title, opts.subtitle);
  writeTable(ws, start, { autoFilter: true, ...opts });
  return ws;
}

/** Tên sheet Excel: tối đa 31 ký tự, không chứa : \ / ? * [ ] */
export function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
}

export function thinBorder(): Partial<ExcelJS.Borders> {
  const side = { style: 'thin' as const, color: { argb: COLORS.border } };
  return { top: side, left: side, bottom: side, right: side };
}
