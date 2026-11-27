import type * as ExcelJS from 'exceljs';
import type { GoneProduct, PriceChange, ProductView, ReportData, SoldDelta } from '../../analysis';
import { detailColumns, priceColumns, productColumns } from '../columns';
import { addTableSheet } from '../tableSheet';
import { normalizeBrand } from '../../../utils/text';

/**
 * Các sheet dạng danh sách. Muốn thêm/bớt/đổi thứ tự cột: sửa mảng `columns` tương ứng.
 */

const isOwn = (data: ReportData) => {
  const own = normalizeBrand(data.ownBrand);
  return (brand: string) => normalizeBrand(brand) === own;
};

export function addPriceChangeSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwn(data);
  addTableSheet<PriceChange>(wb, {
    name: 'Biến động giá',
    title: 'Sản phẩm thay đổi giá bán trong kỳ',
    subtitle: `So sánh giá bán ngày ${data.baselineDate ?? '—'} với ngày ${data.endDate ?? '—'}. Sắp xếp: giảm giá mạnh nhất trước.`,
    rows: data.priceChanges,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Không có sản phẩm nào đổi giá trong kỳ.',
    columns: [
      ...productColumns<PriceChange>((r) => r.product),
      { header: 'Giá đầu kỳ', width: 14, format: 'money', value: (r) => r.before.price },
      { header: 'Giá cuối kỳ', width: 14, format: 'money', value: (r) => r.snapshot.price },
      { header: 'Chênh lệch', width: 13, format: 'money', signColor: true, value: (r) => r.diff },
      { header: '% thay đổi', width: 10, format: 'percent', signColor: true, value: (r) => r.diffPercent },
      { header: 'Giá thấp nhất trong kỳ', width: 14, format: 'money', value: (r) => r.minPrice },
      { header: 'Giá cao nhất trong kỳ', width: 14, format: 'money', value: (r) => r.maxPrice },
      { header: 'Số lần đổi giá', width: 9, format: 'int', value: (r) => r.changeCount },
      { header: '% giảm hiện tại', width: 10, format: 'percent', value: (r) => r.snapshot.discountPercent },
      { header: 'Link', width: 10, format: 'link', linkText: () => 'Xem', value: (r) => r.product.url },
    ],
  });
}

export function addNewProductsSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwn(data);
  addTableSheet<ProductView>(wb, {
    name: 'SP mới',
    title: 'Sản phẩm mới xuất hiện trong kỳ',
    subtitle: 'Sản phẩm lần đầu được ghi nhận trên ĐMX trong kỳ này (không tính lần cào đầu tiên của hệ thống).',
    rows: data.newProducts,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Không có sản phẩm mới trong kỳ.',
    columns: [
      { header: 'Ngày xuất hiện', width: 12, value: (r) => r.product.firstSeenDate },
      ...productColumns<ProductView>((r) => r.product),
      ...priceColumns<ProductView>((r) => r.snapshot),
      ...detailColumns<ProductView>(
        (r) => r.product,
        (r) => r.snapshot,
      ),
    ],
  });
}

export function addGoneProductsSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwn(data);
  addTableSheet<GoneProduct>(wb, {
    name: 'Ngừng hiển thị',
    title: 'Sản phẩm có ở đầu kỳ nhưng không còn hiển thị ở cuối kỳ',
    subtitle: 'Có thể do hết hàng, ngừng kinh doanh hoặc bị ẩn khỏi danh mục.',
    rows: data.goneProducts,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Không có sản phẩm nào ngừng hiển thị.',
    columns: [
      ...productColumns<GoneProduct>((r) => r.product),
      { header: 'Thấy lần cuối', width: 12, value: (r) => r.product.lastSeenDate },
      ...priceColumns<GoneProduct>((r) => r.lastSnapshot, 'Lần cuối – '),
      { header: 'Link', width: 10, format: 'link', linkText: () => 'Xem', value: (r) => r.product.url },
    ],
  });
}

export function addSalesSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwn(data);
  addTableSheet<SoldDelta>(wb, {
    name: 'Lượt bán',
    title: 'Lượt bán tăng thêm trong kỳ (ước tính)',
    subtitle:
      'Tính từ bộ đếm "đã bán" ĐMX công khai trên web: hiệu số giữa đầu kỳ và cuối kỳ. Chỉ mang tính tham khảo xu hướng, không phải số bán thực tế.',
    rows: data.soldDeltas,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Chưa đủ dữ liệu để tính lượt bán (cần ít nhất 2 ngày cào).',
    columns: [
      ...productColumns<SoldDelta>((r) => r.product),
      { header: 'Giá bán', width: 14, format: 'money', value: (r) => r.snapshot.price },
      { header: 'Đã bán đầu kỳ', width: 13, format: 'int', value: (r) => r.soldBefore },
      { header: 'Đã bán cuối kỳ', width: 13, format: 'int', value: (r) => r.soldAfter },
      { header: 'Tăng thêm', width: 11, format: 'int', value: (r) => r.delta },
      {
        header: 'Doanh thu ước tính',
        width: 16,
        format: 'money',
        value: (r) => (r.snapshot.price != null ? r.delta * r.snapshot.price : null),
      },
      { header: 'Link', width: 10, format: 'link', linkText: () => 'Xem', value: (r) => r.product.url },
    ],
  });
}
