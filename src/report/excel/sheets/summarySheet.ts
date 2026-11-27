import type * as ExcelJS from 'exceljs';
import type { ReportData } from '../../analysis';
import { addTableSheet, thinBorder } from '../tableSheet';
import { THEME } from '../theme';

const ROLE_LABEL = { own: 'Công ty', competitor: 'Đối thủ', other: 'Khác' } as const;

/** Sheet "Tổng quan": thông tin kỳ báo cáo + bảng tổng hợp theo danh mục × hãng. */
export function addSummarySheet(wb: ExcelJS.Workbook, data: ReportData, generatedAt: Date): void {
  const ws = addTableSheet(wb, {
    name: 'Tổng quan',
    tabColor: THEME.tab.summary,
    title: `Báo cáo thị trường Điện Máy Xanh – ${data.period.title}`,
    subtitle: `Thương hiệu theo dõi: ${data.ownBrand} • Tạo lúc ${generatedAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    rows: data.brandSummary,
    highlight: (r) => r.role === 'own',
    emptyMessage: 'Chưa có dữ liệu – hãy chạy cào dữ liệu trước.',
    columns: [
      { header: 'Danh mục', width: 18, value: (r) => r.categoryName },
      { header: 'Hãng', width: 14, value: (r) => r.brand },
      { header: 'Vai trò', width: 11, value: (r) => ROLE_LABEL[r.role] },
      { header: 'Số SKU', width: 8, format: 'int', value: (r) => r.skuCount },
      { header: 'Giá TB', width: 13, format: 'money', value: (r) => r.avgPrice },
      { header: 'Giá thấp nhất', width: 13, format: 'money', value: (r) => r.minPrice },
      { header: 'Giá cao nhất', width: 13, format: 'money', value: (r) => r.maxPrice },
      { header: '% giảm TB', width: 9, format: 'percent', value: (r) => r.avgDiscount },
      { header: 'SKU có flash sale', width: 10, format: 'int', value: (r) => r.flashSkuCount },
      { header: 'SKU mới', width: 8, format: 'int', value: (r) => r.newCount },
      { header: 'SKU ngừng hiển thị', width: 10, format: 'int', value: (r) => r.goneCount },
      { header: 'Số SKU tăng giá', width: 9, format: 'int', value: (r) => r.priceUp },
      { header: 'Số SKU giảm giá', width: 9, format: 'int', value: (r) => r.priceDown },
      { header: 'Lượt bán tăng thêm', width: 12, format: 'int', value: (r) => r.soldDelta },
    ],
  });

  // Khối thông tin kỳ báo cáo bên phải bảng
  const infoCol = 17;
  const info: [string, string | number][] = [
    ['Kỳ báo cáo', `${data.period.from} → ${data.period.to}`],
    ['Ngày dữ liệu đầu kỳ (mốc so sánh)', data.baselineDate ?? '—'],
    ['Ngày dữ liệu cuối kỳ', data.endDate ?? '—'],
    ['Số ngày có dữ liệu trong kỳ', data.crawlDates.length],
    ['Tổng SKU cuối kỳ', data.current.length],
    ['SKU đổi giá', data.priceChanges.length],
    ['SKU mới', data.newProducts.length],
    ['SKU ngừng hiển thị', data.goneProducts.length],
  ];
  ws.getColumn(infoCol).width = 34;
  ws.getColumn(infoCol + 1).width = 26;
  const header = ws.getCell(3, infoCol);
  header.value = 'Thông tin kỳ báo cáo';
  header.font = { name: THEME.font, size: 12, bold: true, color: { argb: THEME.title } };
  info.forEach(([k, v], i) => {
    const keyCell = ws.getCell(4 + i, infoCol);
    keyCell.value = k;
    keyCell.font = { name: THEME.font, size: THEME.fontSize, color: { argb: THEME.muted } };
    keyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.zebraBg } };
    keyCell.border = thinBorder();
    const valueCell = ws.getCell(4 + i, infoCol + 1);
    valueCell.value = v;
    valueCell.font = { name: THEME.font, size: THEME.fontSize, bold: true, color: { argb: THEME.title } };
    valueCell.alignment = { horizontal: 'right' };
    valueCell.border = thinBorder();
  });
  data.notes.forEach((note, i) => {
    const cell = ws.getCell(5 + info.length + i, infoCol);
    cell.value = `⚠ ${note}`;
    cell.font = { name: THEME.font, size: THEME.fontSize, italic: true, color: { argb: THEME.up } };
  });
}
