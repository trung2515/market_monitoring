import type { StoredProduct, PriceSnapshot } from '../../domain/types';
import type { ColumnDef } from './tableSheet';

/**
 * Bộ cột dùng lại giữa các sheet. Mỗi hàm nhận "getter" lấy product/snapshot từ dòng dữ liệu,
 * nên cùng một định nghĩa cột dùng được cho nhiều kiểu dòng khác nhau.
 */

type Getter<T, R> = (row: T) => R;

export function productColumns<T>(get: Getter<T, StoredProduct>, prefix = ''): ColumnDef<T>[] {
  return [
    { header: `${prefix}Danh mục`, width: 16, value: (r) => get(r).categoryName },
    { header: `${prefix}Hãng`, width: 13, value: (r) => get(r).brand },
    { header: `${prefix}Mã model`, width: 16, value: (r) => get(r).modelCode },
    { header: `${prefix}Tên sản phẩm`, width: 55, value: (r) => get(r).name },
  ];
}

export function priceColumns<T>(get: Getter<T, PriceSnapshot>, prefix = ''): ColumnDef<T>[] {
  return [
    { header: `${prefix}Giá niêm yết`, width: 14, format: 'money', value: (r) => get(r).listPrice },
    { header: `${prefix}Giá bán`, width: 14, format: 'money', value: (r) => get(r).price },
    { header: `${prefix}% giảm`, width: 9, format: 'percent', value: (r) => get(r).discountPercent },
    { header: `${prefix}Giá flash sale`, width: 14, format: 'money', value: (r) => get(r).flashPrice },
  ];
}

export function detailColumns<T>(getP: Getter<T, StoredProduct>, getS: Getter<T, PriceSnapshot>): ColumnDef<T>[] {
  return [
    { header: 'Kích thước', width: 11, value: (r) => getP(r).sizeKey ?? '' },
    { header: 'Thông số nổi bật', width: 45, value: (r) => getP(r).specs.join('; ') },
    { header: 'Đã bán', width: 12, value: (r) => getS(r).soldText?.replace(/^Đã bán\s*/i, '') ?? '' },
    { header: 'Rating', width: 8, format: 'decimal', value: (r) => getS(r).rating },
    { header: 'Còn hàng', width: 9, value: (r) => getS(r).isAvailable },
    { header: 'Online only', width: 10, value: (r) => getP(r).isOnlineOnly },
    { header: 'Mã SP ĐMX', width: 15, value: (r) => getP(r).productCode },
    { header: 'Link', width: 12, format: 'link', linkText: () => 'Xem', value: (r) => getP(r).url },
  ];
}
