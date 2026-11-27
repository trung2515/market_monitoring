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

const vnDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/** Chương trình bắt đầu muộn hơn trong CÙNG NGÀY (vd cào 8h, flash sale 12h–20h) – vẫn tính cho hôm nay. */
function startsLaterToday(price: DmxPrice, now: Date): boolean {
  const start = parseVnDateTime(price.startDate);
  return Boolean(start && start > now && vnDay(start) === vnDay(now));
}

/**
 * Chọn giá:
 *  - Giá thường: mục có saleProgramTypeId = 0 (hoặc mục đầu tiên)
 *  - Giá flash sale: mục chương trình (saleProgramTypeId ≠ 0) đang hiệu lực tại thời điểm cào HOẶC sẽ bắt đầu
 *    muộn hơn trong ngày (cào lúc 8h vẫn ghi nhận flash sale 12h–20h hôm đó); ưu tiên mục đang chạy, rồi giá thấp nhất
 */
export function pickPrices(prices: DmxPrice[] | null | undefined, now: Date) {
  const list = prices ?? [];
  const regular = list.find((p) => (p.saleProgramTypeId ?? 0) === 0) ?? list[0];

  const flash = list
    .filter(
      (p) =>
        p !== regular &&
        (p.saleProgramTypeId ?? 0) !== 0 &&
        (isActive(p, now) || startsLaterToday(p, now)) &&
        typeof p.price === 'number' &&
        p.price > 0 &&
        (regular?.price == null || p.price < regular.price),
    )
    .sort((a, b) => Number(isActive(b, now)) - Number(isActive(a, now)) || (a.price ?? 0) - (b.price ?? 0))[0];

  return {
    price: regular?.price ?? null,
    listPrice: regular?.sysPrice ?? null,
    discountPercent: regular?.discountPercent ?? null,
    flashPrice: flash?.price ?? null,
    isAvailable: Boolean(regular?.isCanBuy) && (regular?.inventoryStatusId ?? 1) === 1,
    promoStart: toVnMinute(regular?.startDate),
    promoEnd: toVnMinute(regular?.endDate),
    flashStart: toVnMinute(flash?.startDate),
    flashEnd: toVnMinute(flash?.endDate),
    flashHours: hourRange(flash?.applyHourRange),
    flashQuota: flash?.stockQuantity?.maxQuantity ?? null,
    ...otherPromotions(regular),
  };
}

/** "0" hoặc rỗng = áp dụng cả ngày → null */
function hourRange(value: string | number | null | undefined): string | null {
  const v = value == null ? '' : String(value).trim();
  return v === '' || v === '0' ? null : v;
}

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\(?\s*Xem chi tiết tại đây\s*\)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const joinOrNull = (items: string[], sep: string) => {
  const unique = [...new Set(items.map((x) => x.trim()).filter(Boolean))];
  return unique.length ? unique.join(sep) : null;
};

/** Quà tặng, nhãn khuyến mãi, trả góp, ưu đãi thanh toán... đi kèm giá thường. */
function otherPromotions(price: DmxPrice | undefined) {
  const promos = price?.promotions;
  const gifts = promos?.giftPromotions ?? [];
  const giftText = gifts.map((g) => {
    const items = (g.lstGift ?? []).map(
      (x) => `${x.name ?? ''}${x.quantity && x.quantity > 1 ? ` x${x.quantity}` : ''}`,
    );
    return `${g.title ?? 'Tặng'} ${items.join(', ')}`.trim();
  });
  const giftValue = gifts.reduce((sum, g) => sum + (g.toValue ?? 0), 0);

  const labels = (price?.specialLabel ?? []).map((l) => l.labelName ?? '');
  const installmentLabel = labels.find((l) => /^trả (chậm|góp)/i.test(l));

  const others = [...(promos?.discountPromotions ?? []), ...(promos?.normalPromotions ?? [])].map((p) =>
    stripHtml(p.content ?? p.title ?? ''),
  );

  return {
    giftText: joinOrNull(giftText, '; '),
    giftValue: giftValue > 0 ? giftValue : null,
    promoLabels: joinOrNull(
      labels.filter((l) => !/^trả (chậm|góp)/i.test(l)),
      '; ',
    ),
    installment: installmentLabel ?? price?.installment?.title ?? null,
    otherPromos: joinOrNull(others, ' | '),
  };
}

/** '2026-11-30T23:59:59' (giờ VN) → '2026-11-30 23:59' */
function toVnMinute(value: string | null | undefined): string | null {
  if (!value || !parseVnDateTime(value)) return null;
  return value.slice(0, 16).replace('T', ' ');
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
      giftText: joinOrNull([prices.giftText ?? '', raw.gift?.name ?? ''], '; '),
      soldText: raw.totalSold ?? null,
      soldCount: parseSoldText(raw.totalSold),
      totalRate: raw.totalRate ?? null,
      rating: raw.rate ?? null,
    },
  };
}
