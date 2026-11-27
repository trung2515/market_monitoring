import type * as ExcelJS from 'exceljs';
import type { CategoryReport, OwnProductRow, ProductView, ReportData } from '../../analysis';
import { normalizeBrand } from '../../../utils/text';
import { flashWindow } from '../../market';
import { soldNumber } from '../columns';
import type { SalesWindow } from '../../sales';
import { createSheet, setColumnWidths, sheetName, writeSheetTitle, writeTable, type ColumnDef } from '../tableSheet';
import { THEME } from '../theme';

/**
 * Mỗi danh mục (Bình đun siêu tốc, Chảo, Nồi...) = 1 sheet, gồm 2 bảng:
 *  [1] Từng sản phẩm của công ty (Elmich) + các đối thủ cùng tầm giá, xếp ngang
 *  [2] Toàn bộ sản phẩm trong danh mục (mọi hãng), sắp theo giá
 *
 * Hai bảng được xếp cột sao cho các cột cùng vị trí có độ rộng tương đương
 * (vd cột 13 = "Tên đối thủ 1" ở bảng 1 và "Thông số" ở bảng 2).
 */
export function addCategorySheets(wb: ExcelJS.Workbook, data: ReportData): void {
  const usedNames = new Set(wb.worksheets.map((w) => w.name));
  for (const category of data.categories) {
    addCategorySheet(wb, data, category, uniqueName(category.name, usedNames));
  }
}

/** Số lượng đã bán cộng dồn (số chính xác từ API; web ĐMX chỉ hiện làm tròn "25,2k"). */
const sold = (v: ProductView | undefined) => (v ? soldNumber(v.snapshot) : null);
/** Số bán trong ngày / tuần / tháng (tới ngày cuối kỳ) – trống nếu chưa có ngày trước để so. */
const salesOf = (data: ReportData, window: SalesWindow) => (v: ProductView | undefined) =>
  v ? (data.sales?.byCode.get(v.product.productCode)?.[window] ?? null) : null;
const salesNote = (data: ReportData) => {
  const b = data.sales?.baseDates;
  const base = (d: string | null | undefined) => d ?? 'chưa đủ dữ liệu';
  return (
    `Đã bán = tổng cộng dồn ĐMX công bố. Bán trong ngày / tuần / tháng = đã bán ngày ${data.endDate ?? '—'} trừ đã bán ngày ` +
    `${base(b?.day)} / ${base(b?.week)} / ${base(b?.month)} (ước tính, ĐMX không công bố số bán theo ngày).`
  );
};
const SALES_COLUMNS: [SalesWindow, string][] = [
  ['day', 'Bán trong ngày'],
  ['week', 'Bán trong tuần'],
  ['month', 'Bán trong tháng'],
];
const flashTime = (v: ProductView | undefined) => (v ? flashWindow(v.snapshot.flashStart, v.snapshot.flashEnd) : null);
const promoText = (v: ProductView) => [v.snapshot.promoLabels, v.snapshot.giftText].filter(Boolean).join('; ');

function ownColumns(data: ReportData): ColumnDef<OwnProductRow>[] {
  const own = data.ownBrand;
  const cols: ColumnDef<OwnProductRow>[] = [
    { group: own, header: `Mã ${own}`, width: 15, value: (r) => r.own.product.modelCode },
    { group: own, header: 'Tên sản phẩm', width: 48, value: (r) => r.own.product.name },
    { group: own, header: 'Kích thước', width: 10, value: (r) => r.own.product.sizeKey ?? '' },
    { group: own, header: 'Giá niêm yết', width: 13, format: 'money', value: (r) => r.own.snapshot.listPrice },
    { group: own, header: 'Giá bán hiện tại', width: 13, format: 'money', value: (r) => r.own.snapshot.price },
    { group: own, header: '% giảm', width: 8, format: 'percent', value: (r) => r.own.snapshot.discountPercent },
    { group: own, header: 'Giá flash sale', width: 13, format: 'money', value: (r) => r.own.snapshot.flashPrice },
    { group: own, header: 'Thời gian flash', width: 14, center: true, value: (r) => flashTime(r.own) },
    { group: own, header: 'Đã bán', width: 10, format: 'int', value: (r) => sold(r.own) },
    ...SALES_COLUMNS.map(
      ([w, header]): ColumnDef<OwnProductRow> => ({
        group: own,
        header,
        width: 10,
        format: 'int',
        value: (r) => salesOf(data, w)(r.own),
      }),
    ),
    { group: own, header: 'Quà / KM khác', width: 30, value: (r) => promoText(r.own) },
    { group: own, header: 'Link', width: 8, format: 'link', linkText: () => 'Xem', value: (r) => r.own.product.url },
  ];

  for (let i = 0; i < data.maxCompetitors; i++) {
    const group = `Đối thủ ${i + 1}`;
    const m = (r: OwnProductRow) => r.competitors[i];
    cols.push(
      {
        group,
        header: 'Hãng',
        width: 12,
        value: (r) => m(r)?.competitor.product.brand ?? (i === 0 ? 'Chưa có đối thủ cùng tầm giá' : ''),
      },
      { group, header: 'Mã', width: 14, value: (r) => m(r)?.competitor.product.modelCode },
      { group, header: 'Tên sản phẩm', width: 38, value: (r) => m(r)?.competitor.product.name },
      { group, header: 'Giá bán', width: 13, format: 'money', value: (r) => m(r)?.competitor.snapshot.price },
      { group, header: 'Flash sale', width: 13, format: 'money', value: (r) => m(r)?.competitor.snapshot.flashPrice },
      { group, header: 'Thời gian flash', width: 14, center: true, value: (r) => flashTime(m(r)?.competitor) },
      { group, header: 'Đã bán', width: 10, format: 'int', value: (r) => sold(m(r)?.competitor) },
      ...SALES_COLUMNS.map(
        ([w, header]): ColumnDef<OwnProductRow> => ({
          group,
          header,
          width: 10,
          format: 'int',
          value: (r) => salesOf(data, w)(m(r)?.competitor),
        }),
      ),
      {
        group,
        header: `Chênh so với ${own}`,
        width: 11,
        format: 'percent',
        signColor: true,
        value: (r) => m(r)?.priceDiffPercent,
      },
      {
        group,
        header: 'Link',
        width: 8,
        format: 'link',
        linkText: () => 'Xem',
        value: (r) => m(r)?.competitor.product.url,
      },
    );
  }
  return cols;
}

function allColumns(data: ReportData): ColumnDef<ProductView>[] {
  const changeByCode = new Map(data.priceChanges.map((c) => [c.product.productCode, c.diff]));
  const newCodes = new Set(data.newProducts.map((p) => p.product.productCode));
  return [
    { header: 'Hãng', width: 15, value: (r) => r.product.brand },
    { header: 'Tên sản phẩm', width: 48, value: (r) => r.product.name },
    { header: 'Kích thước', width: 10, value: (r) => r.product.sizeKey ?? '' },
    { header: 'Giá niêm yết', width: 13, format: 'money', value: (r) => r.snapshot.listPrice },
    { header: 'Giá bán hiện tại', width: 13, format: 'money', value: (r) => r.snapshot.price },
    { header: '% giảm', width: 8, format: 'percent', value: (r) => r.snapshot.discountPercent },
    { header: 'Giá flash sale', width: 13, format: 'money', value: (r) => r.snapshot.flashPrice },
    { header: 'Thời gian flash', width: 14, center: true, value: (r) => flashTime(r) },
    { header: 'Đã bán', width: 10, format: 'int', value: sold },
    ...SALES_COLUMNS.map(
      ([w, header]): ColumnDef<ProductView> => ({ header, width: 10, format: 'int', value: salesOf(data, w) }),
    ),
    { header: 'Quà / KM khác', width: 30, value: promoText },
    { header: 'Mã model', width: 14, value: (r) => r.product.modelCode },
    { header: 'Rating', width: 8, format: 'decimal', value: (r) => r.snapshot.rating },
    { header: 'Thông số nổi bật', width: 38, value: (r) => r.product.specs.join('; ') },
    {
      header: 'Đổi giá trong kỳ',
      width: 13,
      format: 'money',
      signColor: true,
      value: (r) => changeByCode.get(r.product.productCode) ?? null,
    },
    { header: 'SP mới trong kỳ', width: 10, value: (r) => (newCodes.has(r.product.productCode) ? 'Mới' : '') },
    { header: 'Còn hàng', width: 9, value: (r) => r.snapshot.isAvailable },
    { header: 'Link', width: 9, format: 'link', linkText: () => 'Xem', value: (r) => r.product.url },
  ];
}

function addCategorySheet(wb: ExcelJS.Workbook, data: ReportData, category: CategoryReport, name: string): void {
  const ws = createSheet(wb, name, { tabColor: THEME.tab.category, freezeCols: 2 });
  const own = normalizeBrand(data.ownBrand);
  const ownCols = ownColumns(data);
  const allCols = allColumns(data);
  setColumnWidths(ws, ownCols as ColumnDef<never>[], allCols as ColumnDef<never>[]);

  let row = writeSheetTitle(
    ws,
    `${category.name} – ${data.period.title} (dữ liệu ngày ${data.endDate ?? '—'})`,
    `${category.products.length} sản phẩm, trong đó ${category.ownRows.length} của ${data.ownBrand}. ` +
      `Đối thủ cùng tầm giá: giá bán chênh trong ±${data.priceTolerancePercent}%, ưu tiên cùng kích thước rồi giá gần nhất. ` +
      `Chênh % = (giá đối thủ − giá ${data.ownBrand}) / giá ${data.ownBrand}. Nền xanh lá = sản phẩm ${data.ownBrand}; nền cam = chưa có đối thủ cùng tầm giá. ` +
      salesNote(data),
  );

  row = writeTable(ws, row, {
    caption: `[1] ${data.ownBrand} so với đối thủ cùng tầm giá`,
    columns: ownCols,
    rows: category.ownRows,
    highlight: (r) => (r.competitors.length === 0 ? 'attention' : null),
    ownGroup: data.ownBrand,
    emptyMessage: `Danh mục này chưa có sản phẩm ${data.ownBrand}.`,
  });

  writeTable(ws, row, {
    caption: '[2] Toàn bộ sản phẩm trong danh mục (sắp theo giá bán)',
    columns: allCols,
    rows: category.products,
    highlight: (r) => (normalizeBrand(r.product.brand) === own ? 'own' : null),
    autoFilter: true,
  });
}

function uniqueName(name: string, used: Set<string>): string {
  const base = sheetName(name);
  let candidate = base;
  for (let i = 2; used.has(candidate); i++) candidate = sheetName(`${base.slice(0, 27)} (${i})`);
  used.add(candidate);
  return candidate;
}
