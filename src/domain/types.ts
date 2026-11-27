/**
 * Mô hình dữ liệu dùng chung giữa crawler, DB và báo cáo.
 * Không phụ thuộc vào cấu trúc JSON của ĐMX – nếu đổi nguồn (Shopee, TGDĐ...) chỉ cần viết
 * thêm 1 bộ chuyển đổi ra đúng các kiểu này.
 */

/** Thông tin "tĩnh" của sản phẩm (ít thay đổi theo ngày). */
export interface Product {
  /** Mã sản phẩm nội bộ của ĐMX (ổn định, dùng làm khoá chính) */
  productCode: string;
  /** Mã model của hãng, trích từ tên, vd "EL-5753MN" */
  modelCode: string;
  name: string;
  brand: string;
  categorySlug: string;
  categoryName: string;
  url: string;
  imageUrl: string;
  /** Thông số nổi bật: ["Đường kính 28 cm", "Nhôm", ...] */
  specs: string[];
  /** Kích thước chuẩn hoá để ghép phân khúc, vd "28cm", "500ml" */
  sizeKey: string | null;
  isSet: boolean;
  isOnlineOnly: boolean;
}

/** Giá & chỉ số bán hàng tại 1 ngày cào. */
export interface PriceSnapshot {
  crawlDate: string;
  productCode: string;
  categorySlug: string;
  /** Giá bán thường ngày (chưa tính flash sale / giờ vàng) */
  price: number | null;
  /** Giá niêm yết (giá gạch) */
  listPrice: number | null;
  discountPercent: number | null;
  /** Giá flash sale / giờ vàng đang chạy trong ngày, nếu có */
  flashPrice: number | null;
  isAvailable: boolean;
  /** Số đã bán – parse từ chữ "Đã bán 43,2k" (làm tròn) */
  soldCount: number | null;
  soldText: string | null;
  /** Bộ đếm chính xác ĐMX trả về (bám rất sát số đã bán) – dùng tính chênh lệch giữa 2 kỳ */
  totalRate: number | null;
  rating: number | null;
  /** Thời gian chương trình giá đang áp dụng, dạng 'YYYY-MM-DD HH:mm' (giờ VN) */
  promoStart: string | null;
  promoEnd: string | null;
  /** Thời gian flash sale (giờ vàng) đang chạy, dạng 'YYYY-MM-DD HH:mm' */
  flashStart: string | null;
  flashEnd: string | null;
  /** Khung giờ trong ngày nếu flash sale chỉ chạy vài giờ (null = cả ngày) */
  flashHours: string | null;
  /** Số suất giới hạn của flash sale */
  flashQuota: number | null;
  /** Quà tặng kèm, vd "Mua 1 tặng: Bộ dao 3 món Lock&Lock CKK308S3" */
  giftText: string | null;
  /** Tổng giá trị quà tặng (VNĐ) nếu ĐMX công bố */
  giftValue: number | null;
  /** Nhãn khuyến mãi trên thẻ SP (trừ trả chậm), vd "Quà 900.000₫; Giảm thêm 300.000₫" */
  promoLabels: string | null;
  /** Hình thức trả góp, vd "Trả chậm 0%" */
  installment: string | null;
  /** Ưu đãi khác: mã giảm giá, ưu đãi thanh toán... */
  otherPromos: string | null;
}

/** Kết quả chuẩn hoá 1 sản phẩm từ 1 lần cào. */
export interface CrawledProduct {
  product: Product;
  snapshot: Omit<PriceSnapshot, 'crawlDate'>;
}

export type CrawlTrigger = 'schedule' | 'manual' | 'cli';
export type CrawlStatus = 'running' | 'success' | 'partial' | 'failed';

export interface CrawlRun {
  id: number;
  crawlDate: string;
  trigger: CrawlTrigger;
  status: CrawlStatus;
  startedAt: string;
  finishedAt: string | null;
  productCount: number;
  warnings: string[];
  error: string | null;
}

/** Sản phẩm kèm ngày xuất hiện lần đầu / lần cuối (đọc từ DB). */
export interface StoredProduct extends Product {
  firstSeenDate: string;
  lastSeenDate: string;
}
