import type * as ExcelJS from 'exceljs';
import { HIGHLIGHT_BG, THEME, type HighlightKind } from './theme';

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
  /** Căn giữa (cột ngắn như %, hạng, có/không) */
  center?: boolean;
}

export interface TableOptions<T> {
  /** Tiêu đề nhỏ của bảng, in ngay trên header */
  caption?: string;
  columns: ColumnDef<T>[];
  rows: T[];
  /**
   * Tô nền dòng: 'own' = dòng của công ty (xanh nhạt), 'attention' = cần chú ý (cam nhạt).
   * Trả về true tương đương 'own'.
   */
  highlight?: (row: T) => HighlightKind | boolean | null | undefined;
  /** Nhóm cột nào là của công ty → dùng màu nhóm riêng */
  ownGroup?: string;
  emptyMessage?: string;
  autoFilter?: boolean;
}

export interface TableSheetOptions<T> extends TableOptions<T> {
  name: string;
  title: string;
  subtitle?: string;
  tabColor?: string;
}

const NUM_FORMATS: Partial<Record<CellFormat, string>> = {
  money: '#,##0" ₫";-#,##0" ₫"',
  int: '#,##0',
  percent: '0.0"%"',
  decimal: '0.0',
};

const baseFont = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
  name: THEME.font,
  size: THEME.fontSize,
  color: { argb: THEME.text },
  ...extra,
});

/** Tạo sheet với giao diện chuẩn: ẩn lưới, màu tab, cố định dòng/cột nếu cần. */
export function createSheet(
  wb: ExcelJS.Workbook,
  name: string,
  opts: { tabColor?: string; freezeRows?: number; freezeCols?: number } = {},
): ExcelJS.Worksheet {
  const frozen = (opts.freezeRows ?? 0) > 0 || (opts.freezeCols ?? 0) > 0;
  return wb.addWorksheet(sheetName(name), {
    properties: opts.tabColor ? { tabColor: { argb: opts.tabColor } } : {},
    views: [
      frozen
        ? { state: 'frozen', xSplit: opts.freezeCols ?? 0, ySplit: opts.freezeRows ?? 0, showGridLines: false }
        : { showGridLines: false },
    ],
  });
}

/** Ghi tiêu đề + phụ đề vào đầu sheet; trả về dòng trống tiếp theo. */
export function writeSheetTitle(ws: ExcelJS.Worksheet, title: string, subtitle?: string): number {
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = baseFont({ bold: true, size: 16, color: { argb: THEME.title } });
  ws.getRow(1).height = 26;
  if (subtitle) {
    const s = ws.getCell(2, 1);
    s.value = subtitle;
    s.font = baseFont({ italic: true, color: { argb: THEME.muted } });
  }
  return 4;
}

/**
 * Ghi 1 bảng bắt đầu từ `startRow` (có thể nhiều bảng trên 1 sheet).
 * Trả về số dòng trống kế tiếp sau bảng.
 */
export function writeTable<T>(ws: ExcelJS.Worksheet, startRow: number, opts: TableOptions<T>): number {
  let row = startRow;
  const colCount = opts.columns.length;

  if (opts.caption) {
    const cell = ws.getCell(row, 1);
    cell.value = opts.caption;
    cell.font = baseFont({ bold: true, size: 12, color: { argb: THEME.title } });
    ws.getRow(row).height = 20;
    row++;
  }

  // Dòng nhóm cột (gộp ô), nếu có
  if (opts.columns.some((c) => c.group)) {
    let i = 0;
    let groupIndex = 0;
    while (i < colCount) {
      const group = opts.columns[i]?.group;
      let j = i;
      while (j + 1 < colCount && opts.columns[j + 1]?.group === group) j++;
      if (group) {
        if (j > i) ws.mergeCells(row, i + 1, row, j + 1);
        const bg = group === opts.ownGroup ? THEME.ownGroupBg : THEME.groupBg[groupIndex++ % THEME.groupBg.length];
        const cell = ws.getCell(row, i + 1);
        cell.value = group;
        cell.font = baseFont({ bold: true, color: { argb: THEME.headerFg } });
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder('FFFFFFFF');
      }
      i = j + 1;
    }
    ws.getRow(row).height = 20;
    row++;
  }

  const headerRowIndex = row;
  const headerRow = ws.getRow(row);
  opts.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = baseFont({ bold: true, color: { argb: THEME.headerFg } });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder('FF3B5280');
  });
  headerRow.height = 34;
  row++;

  if (opts.rows.length === 0) {
    const cell = ws.getCell(row, 1);
    cell.value = opts.emptyMessage ?? 'Không có dữ liệu trong kỳ này.';
    cell.font = baseFont({ italic: true, color: { argb: THEME.muted } });
    return row + 2;
  }

  opts.rows.forEach((item, index) => {
    const excelRow = ws.getRow(row);
    const hl = opts.highlight?.(item);
    const kind: HighlightKind | null = hl === true ? 'own' : hl ? hl : null;
    const bg = kind ? HIGHLIGHT_BG[kind] : index % 2 === 1 ? THEME.zebraBg : null;

    opts.columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const raw = col.value(item);
      const value = raw === undefined || raw === '' ? null : raw;

      if (col.format === 'link' && typeof value === 'string') {
        cell.value = { text: col.linkText?.(item) ?? value, hyperlink: value };
        cell.font = baseFont({ color: { argb: THEME.link }, underline: true });
      } else {
        cell.value = typeof value === 'boolean' ? (value ? 'Có' : 'Không') : value;
        const signed = col.signColor && typeof value === 'number' && value !== 0;
        cell.font = baseFont(
          signed ? { bold: true, color: { argb: (value as number) > 0 ? THEME.up : THEME.down } } : {},
        );
      }

      const fmt = col.format ? NUM_FORMATS[col.format] : undefined;
      if (fmt) cell.numFmt = fmt;
      cell.alignment = {
        vertical: 'middle',
        horizontal: col.center || col.format === 'link' ? 'center' : undefined,
      };
      if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder();
    });
    excelRow.height = 18;
    row++;
  });

  if (opts.autoFilter) {
    ws.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: row - 1, column: colCount },
    };
  }
  return row + 2;
}

/** Đặt độ rộng cột theo bảng rộng nhất trên sheet. */
export function setColumnWidths(ws: ExcelJS.Worksheet, ...tables: ColumnDef<never>[][]): void {
  const count = Math.max(...tables.map((t) => t.length));
  for (let i = 0; i < count; i++) {
    const width = Math.max(...tables.map((t) => t[i]?.width ?? 0), 8);
    ws.getColumn(i + 1).width = width;
  }
}

/**
 * Sheet chỉ có 1 bảng: tiêu đề, header có màu, freeze header + 2 cột đầu, auto-filter, định dạng số.
 * Thêm/bớt cột chỉ cần sửa mảng `columns`.
 */
export function addTableSheet<T>(wb: ExcelJS.Workbook, opts: TableSheetOptions<T>): ExcelJS.Worksheet {
  const hasGroup = opts.columns.some((c) => c.group);
  const headerRow = 4 + (opts.caption ? 1 : 0) + (hasGroup ? 1 : 0);
  const ws = createSheet(wb, opts.name, { tabColor: opts.tabColor, freezeRows: headerRow });
  setColumnWidths(ws, opts.columns as ColumnDef<never>[]);
  const start = writeSheetTitle(ws, opts.title, opts.subtitle);
  writeTable(ws, start, { autoFilter: true, ...opts });
  return ws;
}

/** Tên sheet Excel: tối đa 31 ký tự, không chứa : \ / ? * [ ] */
export function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
}

export function thinBorder(color: string = THEME.border): Partial<ExcelJS.Borders> {
  const side = { style: 'thin' as const, color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}
