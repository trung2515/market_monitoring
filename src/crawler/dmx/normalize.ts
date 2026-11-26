import type { CrawledProduct } from '../../domain/types';
import { parseVnDateTime } from '../../utils/date';
import { extractModelCode, extractSize, isProductSet, parseSoldText } from '../../utils/text';
import type { DmxPrice, DmxProduct } from './schema';

const DMX_BASE_URL = 'https://www.dienmayxanh.com';

function isActive(price: DmxPrice, now: Date): boolean {
  const start = parseVnDateTime(price.startDate);
  const end = parseVnDateTime(price.endDate);
  return (!start || start <= now) && (!end || now <= end);
}

/**
 * Chọn giá:
 *  - Giá thường: mục có saleProgramTypeId = 0 (hoặc mục đầu tiên)
 *  - Giá flash sale: mục chương trình (saleProgramTypeId ≠ 0) đang hiệu lực tại thời điểm cào, lấy giá thấp nhất
 */
export function pickPrices(prices: DmxPrice[] | null | undefined, now: Date) {
  const list = prices ?? [];
  const regular = list.find((p) => (p.saleProgramTypeId ?? 0) === 0) ?? list[0];

  const flashCandidates = list
    .filter((p) => p !== regular && (p.saleProgramTypeId ?? 0) !== 0 && isActive(p, now))
    .map((p) => p.price)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const flashPrice = flashCandidates.length > 0 ? Math.min(...flashCandidates) : null;

  return {
    price: regular?.price ?? null,
    listPrice: regular?.sysPrice ?? null,
    discountPercent: regular?.discountPercent ?? null,
    flashPrice: flashPrice !== null && regular?.price != null && flashPrice >= regular.price ? null : flashPrice,
    isAvailable: Boolean(regular?.isCanBuy) && (regular?.inventoryStatusId ?? 1) === 1,
  };
}

/** Chuyển 1 sản phẩm JSON của ĐMX sang mô hình chung của hệ thống. */
export function normalizeDmxProduct(
  raw: DmxProduct,
  category: { slug: string; name: string },
  now: Date = new Date(),
): CrawledProduct {
  const specs = (raw.lstKeySellingPoint ?? [])
    .flatMap((k) => (k.label ?? '').split(';'))
    .map((s) => s.trim())
    .filter(Boolean);

  const name = (raw.name || raw.modelName || raw.productNameSKU || raw.productCode).trim();
  const brand = raw.brand?.brandName?.trim() || 'Không rõ';
  const size = extractSize(name, specs);
  const prices = pickPrices(raw.productPrices, now);
  const path = raw.url.replace(/^\/+/, '');

  return {
    product: {
      productCode: raw.productCode,
      modelCode: extractModelCode(name, brand),
      name,
      brand,
      categorySlug: category.slug,
      categoryName: category.name,
      url: raw.url.startsWith('http') ? raw.url : `${DMX_BASE_URL}/${path}`,
      imageUrl: raw.avatar ?? '',
      specs,
      sizeKey: size?.key ?? null,
      isSet: isProductSet(name),
      isOnlineOnly: Boolean(raw.isOnlineOnly),
    },
    snapshot: {
      productCode: raw.productCode,
      categorySlug: category.slug,
      ...prices,
      soldText: raw.totalSold ?? null,
      soldCount: parseSoldText(raw.totalSold),
      totalRate: raw.totalRate ?? null,
      rating: raw.rate ?? null,
    },
  };
}
