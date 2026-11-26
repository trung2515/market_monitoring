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

export function addPriceListSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwn(data);
  addTableSheet<ProductView>(wb, {
    name: 'Bảng giá',
    title: `Bảng giá cuối kỳ (${data.endDate ?? '—'})`,
    subtitle: 'Giá bán = giá thường ngày; Giá flash sale = giá chương trình đang chạy trong ngày cào (nếu có).',
    rows: data.current,
    highlight: (r) => own(r.product.brand),
    columns: [
      ...productColumns<ProductView>((r) => r.product),
      ...priceColumns<ProductView>((r) => r.snapshot),
      ...detailColumns<ProductView>(
        (r) => r.product,
        (r) => r.snapshot,
      ),
      { header: 'Xuất hiện lần đầu', width: 12, value: (r) => r.product.firstSeenDate },
    ],
  });
}

export function addPriceChangeSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwn(data);
  addTableSheet<PriceChange>(wb, {
    name: 'Biến động giá',
    title: 'Sản phẩm thay đổi giá bán trong kỳ',
    subtitle: `So sánh giá bán ngày ${data.baselineDate ?? '—'} với ngày ${data.endDate ?? '—'}. Sắp xếp: giảm giá mạnh nhất trước.`,
    rows: data.priceChanges,
    highlight: (r) => own(r.product.brand),
    signColorColumns: ['Chênh lệch', '% thay đổi'],
    emptyMessage: 'Không có sản phẩm nào đổi giá trong kỳ.',
    columns: [
      ...productColumns<PriceChange>((r) => r.product),
      { header: 'Giá đầu kỳ', width: 14, format: 'money', value: (r) => r.before.price },
      { header: 'Giá cuối kỳ', width: 14, format: 'money', value: (r) => r.snapshot.price },
      { header: 'Chênh lệch', width: 13, format: 'money', value: (r) => r.diff },
      { header: '% thay đổi', width: 10, format: 'percent', value: (r) => r.diffPercent },
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

export function addSegmentSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const SOURCE = { auto: 'Tự động', manual: 'Ghép tay', none: '—' } as const;
  addTableSheet(wb, {
    name: 'So sánh phân khúc',
    title: `${data.ownBrand} so với đối thủ cùng phân khúc`,
    subtitle:
      'Tự động ghép: cùng danh mục, cùng loại (bộ/lẻ), cùng kích thước, giá chênh trong ngưỡng cấu hình. Chênh lệch = giá đối thủ − giá ' +
      data.ownBrand,
    rows: data.segments,
    highlight: (r) => r.competitor === null,
    signColorColumns: ['Chênh lệch', '% chênh'],
    emptyMessage: `Không có sản phẩm ${data.ownBrand} trong dữ liệu đã lọc.`,
    columns: [
      { header: 'Danh mục', width: 16, value: (r) => r.own.product.categoryName },
      { header: 'Kích thước', width: 10, value: (r) => r.own.product.sizeKey ?? '' },
      { header: `Mã ${data.ownBrand}`, width: 16, value: (r) => r.own.product.modelCode },
      { header: `Sản phẩm ${data.ownBrand}`, width: 45, value: (r) => r.own.product.name },
      { header: `Giá ${data.ownBrand}`, width: 14, format: 'money', value: (r) => r.own.snapshot.price },
      { header: 'Hãng đối thủ', width: 13, value: (r) => r.competitor?.product.brand ?? 'Chưa có đối thủ phù hợp' },
      { header: 'Mã đối thủ', width: 16, value: (r) => r.competitor?.product.modelCode ?? '' },
      { header: 'Sản phẩm đối thủ', width: 45, value: (r) => r.competitor?.product.name ?? '' },
      { header: 'Giá đối thủ', width: 14, format: 'money', value: (r) => r.competitor?.snapshot.price },
      { header: 'Chênh lệch', width: 13, format: 'money', value: (r) => r.priceDiff },
      { header: '% chênh', width: 9, format: 'percent', value: (r) => r.priceDiffPercent },
      { header: `Đã bán (${data.ownBrand})`, width: 12, value: (r) => r.own.snapshot.soldText?.replace(/^Đã bán\s*/i, '') ?? '' },
      { header: 'Đã bán (đối thủ)', width: 12, value: (r) => r.competitor?.snapshot.soldText?.replace(/^Đã bán\s*/i, '') ?? '' },
      { header: 'Cách ghép', width: 10, value: (r) => SOURCE[r.source] },
      { header: 'Ghi chú', width: 25, value: (r) => r.note ?? '' },
      { header: 'Link đối thủ', width: 10, format: 'link', linkText: () => 'Xem', value: (r) => r.competitor?.product.url },
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
