import type * as ExcelJS from 'exceljs';
import type { ReportData } from '../../analysis';
import type {
  FlashCalendarRow,
  MarketShareRow,
  PriceBandRow,
  PriceHistoryRow,
  PromotionRow,
  TopSellerRow,
} from '../../market';
import { isoDayOfWeek } from '../../../utils/date';
import { normalizeBrand } from '../../../utils/text';
import { addTableSheet, type ColumnDef } from '../tableSheet';
import { THEME } from '../theme';

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
    tabColor: THEME.tab.market,
    name: 'Thị phần',
    title: `Thị phần theo hãng trong từng danh mục (dữ liệu ngày ${data.endDate ?? '—'})`,
    subtitle:
      'Lượt bán = bộ đếm "đã bán" cộng dồn ĐMX hiển thị công khai (từ trước tới nay), chỉ mang tính tham khảo. Xếp hạng theo lượt bán.',
    rows: data.market.shares,
    highlight: (r) => r.role === 'own',
    emptyMessage: 'Chưa có dữ liệu.',
    columns: [
      { header: 'Danh mục', width: 18, value: (r) => r.categoryName },
      { header: 'Hạng', width: 7, format: 'int', center: true, value: (r) => r.rank },
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
    tabColor: THEME.tab.market,
    name: 'Top bán chạy',
    title: `Sản phẩm bán chạy nhất mỗi danh mục (dữ liệu ngày ${data.endDate ?? '—'})`,
    subtitle: 'Xếp theo lượt bán cộng dồn ĐMX hiển thị. Dòng nền xanh lá nhạt là sản phẩm của công ty.',
    rows: data.market.topSellers,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Chưa có dữ liệu.',
    columns: [
      { header: 'Danh mục', width: 18, value: (r) => r.product.categoryName },
      { header: 'Hạng', width: 7, format: 'int', center: true, value: (r) => r.rank },
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
    tabColor: THEME.tab.market,
    name: 'Phân khúc giá',
    title: `Phân bố sản phẩm theo khoảng giá bán (dữ liệu ngày ${data.endDate ?? '—'})`,
    subtitle: `Cho biết ${data.ownBrand} đang có mặt ở khoảng giá nào và khoảng giá nào đối thủ chiếm ưu thế. Chỉnh mốc giá trong config/tracking.json → report.priceBands.`,
    rows: data.market.priceBands,
    highlight: (r) => (r.ownCount === 0 ? 'attention' : null),
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
    tabColor: THEME.tab.market,
    name: 'Khuyến mãi',
    title: `Tất cả chương trình khuyến mãi đang chạy (dữ liệu ngày ${data.endDate ?? '—'})`,
    subtitle:
      'Gồm: giảm giá so với giá niêm yết, flash sale (giờ vàng), quà tặng, nhãn khuyến mãi, trả góp và ưu đãi thanh toán. ' +
      '"Sắp hết" = chương trình giá sắp kết thúc (số ngày chỉnh ở report.promoEndingSoonDays). Sắp theo mức giảm sâu nhất trong từng danh mục.',
    rows: data.market.promotions,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Không có sản phẩm nào đang khuyến mãi.',
    columns: [
      { group: 'Sản phẩm', header: 'Danh mục', width: 16, value: (r) => r.product.categoryName },
      { group: 'Sản phẩm', header: 'Hãng', width: 13, value: (r) => r.product.brand },
      { group: 'Sản phẩm', header: 'Mã model', width: 15, value: (r) => r.product.modelCode },
      { group: 'Sản phẩm', header: 'Tên sản phẩm', width: 45, value: (r) => r.product.name },
      {
        group: 'Giảm giá',
        header: 'Giá niêm yết',
        width: 13,
        format: 'money',
        value: (r) => r.snapshot.listPrice,
      },
      { group: 'Giảm giá', header: 'Giá bán hiện tại', width: 13, format: 'money', value: (r) => r.snapshot.price },
      { group: 'Giảm giá', header: '% giảm', width: 8, format: 'percent', value: (r) => r.snapshot.discountPercent },
      { group: 'Giảm giá', header: 'Áp dụng từ', width: 16, value: (r) => r.snapshot.promoStart ?? '' },
      { group: 'Giảm giá', header: 'Áp dụng đến', width: 16, value: (r) => r.snapshot.promoEnd ?? '' },
      { group: 'Giảm giá', header: 'Còn (ngày)', width: 8, format: 'int', value: (r) => r.daysLeft },
      { group: 'Giảm giá', header: 'Sắp hết', width: 8, center: true, value: (r) => (r.endingSoon ? 'Sắp hết' : '') },
      {
        group: 'Flash sale (giờ vàng)',
        header: 'Giá flash sale',
        width: 13,
        format: 'money',
        value: (r) => r.snapshot.flashPrice,
      },
      { group: 'Flash sale (giờ vàng)', header: 'Từ', width: 16, value: (r) => r.snapshot.flashStart ?? '' },
      { group: 'Flash sale (giờ vàng)', header: 'Đến', width: 16, value: (r) => r.snapshot.flashEnd ?? '' },
      {
        group: 'Flash sale (giờ vàng)',
        header: 'Thời lượng',
        width: 11,
        center: true,
        value: (r) => r.flashDuration ?? '',
      },
      {
        group: 'Flash sale (giờ vàng)',
        header: 'Khung giờ',
        width: 11,
        value: (r) => (r.snapshot.flashPrice == null ? '' : (r.snapshot.flashHours ?? 'Cả ngày')),
      },
      {
        group: 'Flash sale (giờ vàng)',
        header: 'Số suất',
        width: 8,
        format: 'int',
        value: (r) => r.snapshot.flashQuota,
      },
      { group: 'Khuyến mãi khác', header: 'Quà tặng', width: 40, value: (r) => r.snapshot.giftText ?? '' },
      {
        group: 'Khuyến mãi khác',
        header: 'Giá trị quà',
        width: 12,
        format: 'money',
        value: (r) => r.snapshot.giftValue,
      },
      { group: 'Khuyến mãi khác', header: 'Nhãn KM', width: 26, value: (r) => r.snapshot.promoLabels ?? '' },
      { group: 'Khuyến mãi khác', header: 'Trả góp', width: 14, value: (r) => r.snapshot.installment ?? '' },
      {
        group: 'Khuyến mãi khác',
        header: 'Ưu đãi thanh toán / mã giảm',
        width: 45,
        value: (r) => r.snapshot.otherPromos ?? '',
      },
      { header: 'Link', width: 8, format: 'link', linkText: () => 'Xem', value: (r) => r.product.url },
    ],
  });
}

export function addFlashCalendarSheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwnBrand(data);
  const { dates, rows } = data.market.flashCalendar;
  addTableSheet<FlashCalendarRow>(wb, {
    tabColor: THEME.tab.market,
    name: 'Lịch flash sale',
    title: `Lịch flash sale (giờ vàng) theo ngày – ${data.period.title}`,
    subtitle:
      'Mỗi cột là 1 ngày có dữ liệu; ô có số = hôm đó SP có flash sale với giá đó, ô trống = không có flash sale hoặc không có dữ liệu. Giúp thấy hãng nào chạy flash sale dày, vào ngày nào.',
    rows,
    highlight: (r) => own(r.product.brand),
    emptyMessage: 'Chưa ghi nhận flash sale nào trong kỳ.',
    columns: [
      { header: 'Danh mục', width: 16, value: (r) => r.product.categoryName },
      { header: 'Hãng', width: 13, value: (r) => r.product.brand },
      { header: 'Mã model', width: 15, value: (r) => r.product.modelCode },
      { header: 'Tên sản phẩm', width: 45, value: (r) => r.product.name },
      { header: 'Giá bán thường', width: 13, format: 'money', value: (r) => r.regularPrice },
      ...dates.map(
        (d, i): ColumnDef<FlashCalendarRow> => ({
          header: dayHeader(d),
          width: 11,
          format: 'money',
          value: (r) => r.flash[i],
        }),
      ),
      { header: 'Số ngày có flash', width: 9, format: 'int', value: (r) => r.flashDays },
      { header: 'Giá flash thấp nhất', width: 13, format: 'money', value: (r) => r.minFlash },
    ],
  });
}

const WEEKDAY = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const dayHeader = (d: string) => `${WEEKDAY[isoDayOfWeek(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function addPriceHistorySheet(wb: ExcelJS.Workbook, data: ReportData): void {
  const own = isOwnBrand(data);
  const dates = data.market.history.dates;
  const dateColumns: ColumnDef<PriceHistoryRow>[] = dates.map((d, i) => ({
    header: dayHeader(d),
    width: 11,
    format: 'money',
    value: (r) => r.prices[i],
  }));

  addTableSheet<PriceHistoryRow>(wb, {
    tabColor: THEME.tab.market,
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
