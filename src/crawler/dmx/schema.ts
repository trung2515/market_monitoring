import { z } from 'zod';

/**
 * Schema (chỉ các trường đang dùng) của API danh mục ĐMX:
 *   POST https://api.dienmayxanh.com/gw/bus-dmx-tmdt/api/Cate/GetproductCateV2
 *
 * Validate bằng zod để khi ĐMX đổi cấu trúc JSON, crawler báo lỗi rõ ràng
 * thay vì lặng lẽ ghi dữ liệu sai vào DB. Các trường khác bị bỏ qua (passthrough không cần).
 */

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
