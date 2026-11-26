import type * as ExcelJS from 'exceljs';

export type CellFormat = 'text' | 'money' | 'int' | 'percent' | 'decimal' | 'link';

export interface ColumnDef<T> {
  header: string;
  width?: number;
  format?: CellFormat;
  value: (row: T) => string | number | boolean | null | undefined;
  /** Với format 'link': chữ hiển thị (mặc định = URL) */
  linkText?: (row: T) => string;
}

export interface TableSheetOptions<T> {
  name: string;
  title: string;
  subtitle?: string;
  columns: ColumnDef<T>[];
  rows: T[];
  /** Tô nền dòng (vd dòng sản phẩm Elmich) */
  highlight?: (row: T) => boolean;
  /** Tô màu chữ cho ô giá trị âm/dương (cột chênh lệch) */
  signColorColumns?: string[];
  emptyMessage?: string;
}

export const COLORS = {
  headerBg: 'FF1F4E78',
  headerFg: 'FFFFFFFF',
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

const TITLE_ROWS = 3; // tiêu đề, phụ đề, dòng trống

/**
 * Tạo 1 sheet dạng bảng chuẩn: tiêu đề, header có màu, freeze, auto-filter, định dạng số.
 * Mọi sheet dạng danh sách dùng chung hàm này → thêm/bớt cột chỉ cần sửa mảng `columns`.
 */
export function addTableSheet<T>(wb: ExcelJS.Workbook, opts: TableSheetOptions<T>): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(opts.name, {
    views: [{ state: 'frozen', ySplit: TITLE_ROWS + 1, xSplit: 0 }],
  });

  ws.columns = opts.columns.map((c) => ({ width: c.width ?? 14 }));

  const title = ws.getCell(1, 1);
  title.value = opts.title;
  title.font = { bold: true, size: 14, color: { argb: COLORS.title } };
  if (opts.subtitle) {
    const sub = ws.getCell(2, 1);
    sub.value = opts.subtitle;
    sub.font = { italic: true, color: { argb: COLORS.muted } };
  }

  const headerRow = ws.getRow(TITLE_ROWS + 1);
  opts.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: COLORS.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  });
  headerRow.height = 32;

  if (opts.rows.length === 0) {
    const cell = ws.getCell(TITLE_ROWS + 2, 1);
    cell.value = opts.emptyMessage ?? 'Không có dữ liệu trong kỳ này.';
    cell.font = { italic: true, color: { argb: COLORS.muted } };
    return ws;
  }

  const signCols = new Set(opts.signColorColumns ?? []);
  opts.rows.forEach((row, r) => {
    const excelRow = ws.getRow(TITLE_ROWS + 2 + r);
    const highlighted = opts.highlight?.(row) ?? false;

    opts.columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const raw = col.value(row);
      const value = raw === undefined ? null : raw;

      if (col.format === 'link' && typeof value === 'string' && value) {
        cell.value = { text: col.linkText?.(row) ?? value, hyperlink: value };
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      } else {
        cell.value = typeof value === 'boolean' ? (value ? 'Có' : 'Không') : value;
      }

      const fmt = col.format ? NUM_FORMATS[col.format] : undefined;
      if (fmt) cell.numFmt = fmt;
      if (signCols.has(col.header) && typeof value === 'number' && value !== 0) {
        cell.font = { bold: true, color: { argb: value > 0 ? COLORS.up : COLORS.down } };
      }
      if (highlighted) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.highlightBg } };
      }
      cell.border = thinBorder();
    });
  });

  ws.autoFilter = {
    from: { row: TITLE_ROWS + 1, column: 1 },
    to: { row: TITLE_ROWS + 1 + opts.rows.length, column: opts.columns.length },
  };
  return ws;
}

export function thinBorder(): Partial<ExcelJS.Borders> {
  const side = { style: 'thin' as const, color: { argb: COLORS.border } };
  return { top: side, left: side, bottom: side, right: side };
}
