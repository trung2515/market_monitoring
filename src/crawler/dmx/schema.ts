import { z } from 'zod';

/**
 * Schema (chỉ các trường đang dùng) của API danh mục ĐMX:
 *   POST https://api.dienmayxanh.com/gw/bus-dmx-tmdt/api/Cate/GetproductCateV2
 *
 * Validate bằng zod để khi ĐMX đổi cấu trúc JSON, crawler báo lỗi rõ ràng
 * thay vì lặng lẽ ghi dữ liệu sai vào DB. Các trường khác bị bỏ qua (passthrough không cần).
 */

/**
 * Khuyến mãi kèm theo giá. Các trường khuyến mãi dùng .catch(null): nếu ĐMX đổi cấu trúc phần này
 * thì chỉ mất thông tin khuyến mãi, không làm hỏng cả sản phẩm.
 */
const dmxGiftPromotionSchema = z.object({
  title: z.string().nullish(),
  toValue: z.number().nullish(),
  promotionEndDate: z.number().nullish(),
  lstGift: z
    .array(z.object({ name: z.string().nullish(), quantity: z.number().nullish(), toValue: z.number().nullish() }))
    .nullish(),
});
const dmxTextPromotionSchema = z.object({
  content: z.string().nullish(),
  title: z.string().nullish(),
  toValue: z.number().nullish(),
  promotionEndDate: z.number().nullish(),
});
const dmxPromotionsSchema = z.object({
  giftPromotions: z.array(dmxGiftPromotionSchema).nullish().catch(null),
  discountPromotions: z.array(dmxTextPromotionSchema).nullish().catch(null),
  normalPromotions: z.array(dmxTextPromotionSchema).nullish().catch(null),
});

export const dmxPriceSchema = z.object({
  id: z.string().nullish(),
  price: z.number().nullish(),
  sysPrice: z.number().nullish(),
  discountPercent: z.number().nullish(),
  isCanBuy: z.boolean().nullish(),
  inventoryStatusId: z.number().nullish(),
  /** 0 = giá thường; khác 0 = chương trình (flash sale, giờ vàng...) */
  saleProgramTypeId: z.number().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  /** Khung giờ áp dụng trong ngày của giờ vàng ("0"/rỗng = cả ngày) */
  applyHourRange: z.union([z.string(), z.number()]).nullish().catch(null),
  /** Số suất giới hạn của chương trình */
  stockQuantity: z.object({ maxQuantity: z.number().nullish() }).nullish().catch(null),
  /** Nhãn hiển thị trên thẻ SP: "Quà 900.000₫", "Trả chậm 0%"... */
  specialLabel: z
    .array(z.object({ labelName: z.string().nullish() }))
    .nullish()
    .catch(null),
  installment: z.object({ title: z.string().nullish() }).nullish().catch(null),
  promotions: dmxPromotionsSchema.nullish().catch(null),
});

export const dmxProductSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().nullish(),
  /** Một số SP có `name` rỗng, tên nằm ở modelName / productNameSKU */
  modelName: z.string().nullish(),
  productNameSKU: z.string().nullish(),
  productCode: z.string(),
  url: z.string(),
  avatar: z.string().nullish(),
  rate: z.number().nullish(),
  totalRate: z.number().nullish(),
  totalSold: z.string().nullish(),
  productPrices: z.array(dmxPriceSchema).nullish(),
  brand: z.object({ brandName: z.string().nullish() }).nullish(),
  cateName: z.string().nullish(),
  lstKeySellingPoint: z.array(z.object({ label: z.string().nullish() })).nullish(),
  isOnlineOnly: z.boolean().nullish(),
  /** Quà tặng kèm dạng phiếu mua hàng, vd "PMH Pin tiểu ... trị giá 20.000đ" */
  gift: z.object({ name: z.string().nullish() }).nullish().catch(null),
});

export const dmxCategoryResponseSchema = z.object({
  code: z.number(),
  message: z.string().nullish(),
  errormessage: z.string().nullish(),
  data: z
    .object({
      products: z.array(z.unknown()).default([]),
      cateName: z.string().nullish(),
      totalProduct: z.number().nullish(),
      remainingQuantity: z.number().nullish(),
    })
    .nullish(),
});

export type DmxPrice = z.infer<typeof dmxPriceSchema>;
export type DmxProduct = z.infer<typeof dmxProductSchema>;
export type DmxCategoryResponse = z.infer<typeof dmxCategoryResponseSchema>;
