import type * as ExcelJS from 'exceljs';
import type { ReportData } from '../../analysis';
import type { MarketShareRow, PriceBandRow, PriceHistoryRow, PromotionRow, TopSellerRow } from '../../market';
import { isoDayOfWeek } from '../../../utils/date';
import { normalizeBrand } from '../../../utils/text';
import { addTableSheet, type ColumnDef } from '../tableSheet';

/**
 * Các sheet phân tích thị trường bổ trợ. Dùng được ngay từ ngày dữ liệu đầu tiên
 * (trừ "Lịch sử giá" – càng nhiều ngày càng có ý nghĩa).
 */

const ROLE_LABEL = { own: 'Công ty', competitor: 'Đối thủ', other: 'Khác' } as const;
const isOwnBrand = (data: ReportData) => {
  const own = normalizeBrand(data.ownBrand);
  return (brand: string) => normalizeBrand(brand) === own;
};

export function addMarketShareSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  addTableSheet<MarketShareRow>(wb, {
    name: 'Thị phần',
    title: `Thị phần theo hãng trong từng danh mục (dữ liệu ngày ${data.endDate ?? '—'})`,
    subtitle:
      'Lượt bán = bộ đếm "đã bán" cộng dồn ĐMX hiển thị công khai (từ trước tới nay), chỉ mang tính tham khảo. Xếp hạng theo lượt bán.',
    rows: data.market.shares,
    highlight: (r) => r.role === 'own',
    emptyMessage: 'Chưa có dữ liệu.',
    columns: [
      { header: 'Danh mục', width: 18, value: (r) => r.categoryName },
      { header: 'Hạng', width: 7, format: 'int', value: (r) => r.rank },
      { header: 'Hãng', width: 15, value: (r) => r.brand },
      { header: 'Vai trò', width: 10, value: (r) => ROLE_LABEL[r.role] },
      { header: 'Số SKU', width: 8, format: 'int', value: (r) => r.skuCount },
      { header: '% SKU trong danh mục', width: 11, format: 'percent', value: (r) => r.skuShare },
      { header: 'Lượt bán cộng dồn', width: 13, format: 'int', value: (r) => r.sold },
      { header: '% lượt bán (thị phần)', width: 12, format: 'percent', value: (r) => r.soldShare },
      { header: 'Giá bán TB', width: 13, format: 'money', value: (r) => r.avgPrice },
      { header: '% giảm TB', width: 9, format: 'percent', value: (r) => r.avgDiscount },
    ],
  });
}

export function addTopSellersSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwnBrand(data);
  addTableSheet<TopSellerRow>(wb, {
    name: 'Top bán chạy',
    title: `Sản phẩm bán chạy nhất mỗi danh mục (dữ liệu ngày ${data.endDate ?? '—'})`,
    subtitle: 'Xếp theo lượt bán cộng dồn ĐMX hiển thị. Dòng tô vàng là sản phẩm của công ty.',
    rows: data.market.topSellers,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Chưa có dữ liệu.',
    columns: [
      { header: 'Danh mục', width: 18, value: (r) => r.product.categoryName },
      { header: 'Hạng', width: 7, format: 'int', value: (r) => r.rank },
      { header: 'Hãng', width: 14, value: (r) => r.product.brand },
      { header: 'Mã model', width: 15, value: (r) => r.product.modelCode },
      { header: 'Tên sản phẩm', width: 50, value: (r) => r.product.name },
      { header: 'Kích thước', width: 10, value: (r) => r.product.sizeKey ?? '' },
      { header: 'Giá bán hiện tại', width: 13, format: 'money', value: (r) => r.snapshot.price },
      { header: '% giảm', width: 8, format: 'percent', value: (r) => r.snapshot.discountPercent },
      { header: 'Giá flash sale', width: 13, format: 'money', value: (r) => r.snapshot.flashPrice },
      { header: 'Lượt bán cộng dồn', width: 13, format: 'int', value: (r) => r.sold },
      { header: '% lượt bán danh mục', width: 11, format: 'percent', value: (r) => r.shareInCategory },
      { header: 'Rating', width: 8, format: 'decimal', value: (r) => r.snapshot.rating },
      { header: 'Link', width: 9, format: 'link', linkText: () => 'Xem', value: (r) => r.product.url },
    ],
  });
}

export function addPriceBandSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  addTableSheet<PriceBandRow>(wb, {
    name: 'Phân khúc giá',
    title: `Phân bố sản phẩm theo khoảng giá bán (dữ liệu ngày ${data.endDate ?? '—'})`,
    subtitle: `Cho biết ${data.ownBrand} đang có mặt ở khoảng giá nào và khoảng giá nào đối thủ chiếm ưu thế. Chỉnh mốc giá trong config/tracking.json → report.priceBands.`,
    rows: data.market.priceBands,
    highlight: (r) => r.ownCount === 0,
    emptyMessage: 'Chưa có dữ liệu.',
    columns: [
      { header: 'Danh mục', width: 18, value: (r) => r.categoryName },
      { header: 'Khoảng giá', width: 14, value: (r) => r.band },
      { header: 'Tổng SKU', width: 9, format: 'int', value: (r) => r.skuCount },
      { header: `SKU ${data.ownBrand}`, width: 9, format: 'int', value: (r) => r.ownCount },
      { header: `% SKU ${data.ownBrand}`, width: 10, format: 'percent', value: (r) => r.ownSkuShare },
      { header: 'Lượt bán cộng dồn', width: 13, format: 'int', value: (r) => r.sold },
      { header: `% lượt bán ${data.ownBrand}`, width: 11, format: 'percent', value: (r) => r.ownSoldShare },
      { header: '% giảm TB', width: 9, format: 'percent', value: (r) => r.avgDiscount },
      { header: 'Hãng nhiều SKU nhất (số SKU)', width: 50, value: (r) => r.topBrands },
    ],
  });
}

export function addPromotionSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwnBrand(data);
  addTableSheet<PromotionRow>(wb, {
    name: 'Khuyến mãi',
    title: `Sản phẩm đang giảm giá / flash sale (dữ liệu ngày ${data.endDate ?? '—'})`,
    subtitle:
      'Sắp theo mức giảm sâu nhất trong từng danh mục. "Sắp hết" = chương trình giá kết thúc trong vài ngày tới (chỉnh ở report.promoEndingSoonDays).',
    rows: data.market.promotions,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Không có sản phẩm nào đang khuyến mãi.',
    columns: [
      { header: 'Danh mục', width: 18, value: (r) => r.product.categoryName },
      { header: 'Hãng', width: 14, value: (r) => r.product.brand },
      { header: 'Mã model', width: 15, value: (r) => r.product.modelCode },
      { header: 'Tên sản phẩm', width: 50, value: (r) => r.product.name },
      { header: 'Giá gốc (niêm yết)', width: 13, format: 'money', value: (r) => r.snapshot.listPrice },
      { header: 'Giá bán hiện tại', width: 13, format: 'money', value: (r) => r.snapshot.price },
      { header: '% giảm', width: 8, format: 'percent', value: (r) => r.snapshot.discountPercent },
      { header: 'Giá flash sale', width: 13, format: 'money', value: (r) => r.snapshot.flashPrice },
      { header: 'Flash sale đến', width: 15, value: (r) => r.snapshot.flashEnd ?? '' },
      { header: 'KM từ', width: 15, value: (r) => r.snapshot.promoStart ?? '' },
      { header: 'KM đến', width: 15, value: (r) => r.snapshot.promoEnd ?? '' },
      { header: 'Còn (ngày)', width: 9, format: 'int', value: (r) => r.daysLeft },
      { header: 'Sắp hết', width: 8, value: (r) => (r.endingSoon ? 'Sắp hết' : '') },
      { header: 'Link', width: 9, format: 'link', linkText: () => 'Xem', value: (r) => r.product.url },
    ],
  });
}

const WEEKDAY = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function addPriceHistorySheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwnBrand(data);
  const dates = data.market.history.dates;
  const dateColumns: ColumnDef<PriceHistoryRow>[] = dates.map((d, i) => ({
    header: `${WEEKDAY[isoDayOfWeek(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}`,
    width: 11,
    format: 'money',
    value: (r) => r.prices[i],
  }));

  addTableSheet<PriceHistoryRow>(wb, {
    name: 'Lịch sử giá',
    title: `Giá bán theo từng ngày – ${data.period.title}`,
    subtitle:
      'Mỗi cột là 1 ngày có dữ liệu cào. Ô trống = ngày đó không lấy được dữ liệu hoặc sản phẩm không hiển thị. Lịch sử chỉ có từ ngày hệ thống bắt đầu chạy.',
    rows: data.market.history.rows,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Chưa có dữ liệu trong kỳ.',
    columns: [
      { header: 'Danh mục', width: 16, value: (r) => r.product.categoryName },
      { header: 'Hãng', width: 13, value: (r) => r.product.brand },
      { header: 'Mã model', width: 15, value: (r) => r.product.modelCode },
      { header: 'Tên sản phẩm', width: 45, value: (r) => r.product.name },
      ...dateColumns,
      { header: 'Thấp nhất', width: 12, format: 'money', value: (r) => r.min },
      { header: 'Cao nhất', width: 12, format: 'money', value: (r) => r.max },
      { header: 'Số lần đổi giá', width: 9, format: 'int', value: (r) => r.changeCount },
    ],
  });
}
