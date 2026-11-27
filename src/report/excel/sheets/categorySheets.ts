import type * as ExcelJS from 'exceljs';
import type { CategoryReport, OwnProductRow, ProductView, ReportData } from '../../analysis';
import { normalizeBrand } from '../../../utils/text';
import { setColumnWidths, sheetName, writeSheetTitle, writeTable, type ColumnDef } from '../tableSheet';

/**
 * Mỗi danh mục (Bình đun siêu tốc, Chảo, Nồi...) = 1 sheet, gồm 2 bảng:
 *  [1] Từng sản phẩm của công ty (Elmich) + các đối thủ cùng tầm giá, xếp ngang
 *  [2] Toàn bộ sản phẩm trong danh mục (mọi hãng), sắp theo giá
 *
 * Hai bảng được xếp cột sao cho các cột cùng vị trí có độ rộng tương đương
 * (vd cột 11 = "Tên đối thủ 1" ở bảng 1 và "Thông số" ở bảng 2).
 */
export function addCategorySheets(wb: ExcelJS.Workbook, data: ReportData): void {
  const usedNames = new Set(wb.worksheets.map((w) => w.name));
  for (const category of data.categories) {
    addCategorySheet(wb, data, category, uniqueName(category.name, usedNames));
  }
}

const sold = (v: ProductView) => v.snapshot.soldText?.replace(/^Đã bán\s*/i, '') ?? '';

function ownColumns(data: ReportData): ColumnDef<OwnProductRow>[] {
  const own = data.ownBrand;
  const cols: ColumnDef<OwnProductRow>[] = [
    { group: own, header: `Mã ${own}`, width: 15, value: (r) => r.own.product.modelCode },
    { group: own, header: 'Tên sản phẩm', width: 48, value: (r) => r.own.product.name },
    { group: own, header: 'Kích thước', width: 10, value: (r) => r.own.product.sizeKey ?? '' },
    { group: own, header: 'Giá gốc (niêm yết)', width: 13, format: 'money', value: (r) => r.own.snapshot.listPrice },
    { group: own, header: 'Giá bán hiện tại', width: 13, format: 'money', value: (r) => r.own.snapshot.price },
    { group: own, header: '% giảm', width: 8, format: 'percent', value: (r) => r.own.snapshot.discountPercent },
    { group: own, header: 'Giá flash sale', width: 13, format: 'money', value: (r) => r.own.snapshot.flashPrice },
    { group: own, header: 'Đã bán', width: 10, value: (r) => sold(r.own) },
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
      {
        group,
        header: `Chênh so với ${own}`,
        width: 11,
        format: 'percent',
        signColor: true,
        value: (r) => m(r)?.priceDiffPercent,
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
    { header: 'Giá gốc (niêm yết)', width: 13, format: 'money', value: (r) => r.snapshot.listPrice },
    { header: 'Giá bán hiện tại', width: 13, format: 'money', value: (r) => r.snapshot.price },
    { header: '% giảm', width: 8, format: 'percent', value: (r) => r.snapshot.discountPercent },
    { header: 'Giá flash sale', width: 13, format: 'money', value: (r) => r.snapshot.flashPrice },
    { header: 'Đã bán', width: 10, value: sold },
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
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 2, ySplit: 0 }] });
  const own = normalizeBrand(data.ownBrand);
  const ownCols = ownColumns(data);
  const allCols = allColumns(data);
  setColumnWidths(ws, ownCols as ColumnDef<never>[], allCols as ColumnDef<never>[]);

  let row = writeSheetTitle(
    ws,
    `${category.name} – ${data.period.title} (dữ liệu ngày ${data.endDate ?? '—'})`,
    `${category.products.length} sản phẩm, trong đó ${category.ownRows.length} của ${data.ownBrand}. ` +
      `Đối thủ cùng tầm giá: giá bán chênh trong ±${data.priceTolerancePercent}%, ưu tiên cùng kích thước rồi giá gần nhất. ` +
      `Chênh % = (giá đối thủ − giá ${data.ownBrand}) / giá ${data.ownBrand}.`,
  );

  row = writeTable(ws, row, {
    caption: `[1] ${data.ownBrand} so với đối thủ cùng tầm giá`,
    columns: ownCols,
    rows: category.ownRows,
    highlight: (r) => r.competitors.length === 0,
    emptyMessage: `Danh mục này chưa có sản phẩm ${data.ownBrand}.`,
  });

  writeTable(ws, row, {
    caption: '[2] Toàn bộ sản phẩm trong danh mục (sắp theo giá bán)',
    columns: allCols,
    rows: category.products,
    highlight: (r) => normalizeBrand(r.product.brand) === own,
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
