import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DmxApiError, DmxClient } from '../src/crawler/dmx/client';
import { normalizeDmxProduct, pickPrices } from '../src/crawler/dmx/normalize';
import { dmxProductSchema } from '../src/crawler/dmx/schema';
import { silentLogger } from '../src/utils/logger';

const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/dmx-category-page.json'), 'utf8'));

function fakeFetch(pages: unknown[]): { fetch: typeof fetch; bodies: unknown[] } {
  const bodies: unknown[] = [];
  let i = 0;
  const impl = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const body = pages[Math.min(i++, pages.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: impl, bodies };
}

const baseOpts = { provinceId: 1027, pageSize: 50, delayMs: 0, timeoutMs: 5000, maxRetries: 0, logger: silentLogger };

describe('DmxClient', () => {
  it('đọc 1 trang, bỏ qua sản phẩm sai cấu trúc', async () => {
    const { fetch, bodies } = fakeFetch([fixture]);
    const client = new DmxClient({ ...baseOpts, fetchImpl: fetch });
    const res = await client.fetchCategory('chao-chong-dinh');
    assert.equal(res.products.length, 3);
    assert.equal(res.invalidCount, 1);
    assert.equal(res.categoryName, 'Chảo');
    assert.deepEqual(bodies[0], {
      pageIndex: 0,
      pageSize: 50,
      provinceId: 1027,
      urlCate: 'chao-chong-dinh',
      cateId: '',
      filters: [],
    });
  });

  it('phân trang cho tới khi remainingQuantity = 0', async () => {
    const page1 = structuredClone(fixture);
    page1.data.products = page1.data.products.slice(0, 1);
    page1.data.remainingQuantity = 2;
    const page2 = structuredClone(fixture);
    page2.data.products = page2.data.products.slice(1, 3);
    page2.data.remainingQuantity = 0;
    const { fetch, bodies } = fakeFetch([page1, page2]);
    const res = await new DmxClient({ ...baseOpts, fetchImpl: fetch }).fetchCategory('chao-chong-dinh');
    assert.equal(res.products.length, 3);
    assert.equal(bodies.length, 2);
  });

  it('báo lỗi rõ ràng khi slug sai', async () => {
    const { fetch } = fakeFetch([{ code: 80000, message: 'Không tìm thấy CateCode từ Url khi gọi BE', data: null }]);
    await assert.rejects(new DmxClient({ ...baseOpts, fetchImpl: fetch }).fetchCategory('sai-slug'), DmxApiError);
  });
});

describe('normalizeDmxProduct', () => {
  const [elmich, sunhouse] = fixture.data.products;
  const category = { slug: 'chao-chong-dinh', name: 'Chảo' };

  it('tách giá thường & giá flash sale đang chạy', () => {
    const { product, snapshot } = normalizeDmxProduct(elmich, category, new Date('2026-11-26T10:00:00+07:00'));
    assert.equal(product.modelCode, 'EDA0904GO30');
    assert.equal(product.brand, 'Elmich');
    assert.equal(product.sizeKey, '30cm');
    assert.equal(
      product.url,
      'https://www.dienmayxanh.com/chao-chong-dinh/chao-nhom-sau-chong-dinh-day-tu-30-cm-elmich-eda0904go30',
    );
    assert.equal(snapshot.price, 320000);
    assert.equal(snapshot.listPrice, 639000);
    assert.equal(snapshot.flashPrice, 230000);
    assert.equal(snapshot.soldCount, 838);
    assert.equal(snapshot.totalRate, 839);
    assert.equal(snapshot.promoStart, '2026-11-01 00:00');
    assert.equal(snapshot.promoEnd, '2026-11-30 23:59');
    assert.equal(snapshot.flashEnd, '2026-11-26 23:59');
    assert.equal(snapshot.flashStart, '2026-11-26 00:00');
    assert.equal(snapshot.flashHours, null); // "0" = cả ngày
    assert.equal(snapshot.flashQuota, 20);
    assert.equal(snapshot.promoLabels, 'Quà 200.000₫');
    assert.equal(snapshot.installment, 'Trả chậm 0%');
    assert.equal(snapshot.otherPromos, 'Nhập mã VNPAY50 giảm tối đa 50,000đ khi thanh toán qua VNPAY-QR');
    assert.equal(snapshot.giftText, 'PMH Pin tiểu (đơn hàng từ 80.000đ trở lên) trị giá 20.000đ');
  });

  it('flash sale ngày khác không tính', () => {
    const { snapshot } = normalizeDmxProduct(elmich, category, new Date('2026-11-20T10:00:00+07:00'));
    assert.equal(snapshot.flashPrice, null);
  });

  it('dùng modelName khi name rỗng', () => {
    const raw = { ...sunhouse, name: '', modelName: 'Chảo nhôm chống dính đáy từ 28 cm Tefal G1430605' };
    const { product } = normalizeDmxProduct(raw, category);
    assert.equal(product.name, 'Chảo nhôm chống dính đáy từ 28 cm Tefal G1430605');
    assert.equal(product.modelCode, 'G1430605');
  });

  it('quà tặng; dữ liệu khuyến mãi sai cấu trúc không làm hỏng sản phẩm', () => {
    const parsed = dmxProductSchema.parse(sunhouse); // normalPromotions sai kiểu → bị bỏ qua nhờ .catch
    const { snapshot } = normalizeDmxProduct(parsed, category, new Date('2026-11-26T10:00:00+07:00'));
    assert.equal(snapshot.giftText, 'Mua 1 tặng: Bộ dao 3 món Gallery Lock&Lock CKK308S3');
    assert.equal(snapshot.giftValue, 453000);
    assert.equal(snapshot.otherPromos, null);
    assert.equal(snapshot.price, 450000);
  });

  it('sản phẩm không có flash sale', () => {
    const { snapshot, product } = normalizeDmxProduct(sunhouse, category, new Date('2026-11-26T10:00:00+07:00'));
    assert.equal(snapshot.price, 450000);
    assert.equal(snapshot.flashPrice, null);
    assert.equal(snapshot.soldCount, 25200);
    assert.equal(product.modelCode, 'IN26M11');
  });
});

describe('pickPrices – flash sale', () => {
  const regular = { saleProgramTypeId: 0, price: 500000, sysPrice: 800000, startDate: '2026-11-01T00:00:00', endDate: '2026-11-30T23:59:59' };
  const flash = (price: number, start: string, end: string) => ({ saleProgramTypeId: 1, price, startDate: start, endDate: end });
  // Cào lúc 8:17 sáng 27/11 giờ VN
  const now = new Date('2026-11-27T08:17:00+07:00');

  it('ghi nhận flash sale bắt đầu muộn hơn trong ngày (12h–20h)', () => {
    const p = pickPrices([regular, flash(299000, '2026-11-27T12:00:00', '2026-11-27T20:00:00')] as never, now);
    assert.equal(p.flashPrice, 299000);
    assert.equal(p.flashStart, '2026-11-27 12:00');
    assert.equal(p.flashEnd, '2026-11-27 20:00');
  });

  it('không lấy flash sale của ngày mai hoặc đã kết thúc', () => {
    const p = pickPrices(
      [regular, flash(299000, '2026-11-28T12:00:00', '2026-11-28T20:00:00'), flash(250000, '2026-11-26T12:00:00', '2026-11-26T20:00:00')] as never,
      now,
    );
    assert.equal(p.flashPrice, null);
  });

  it('ưu tiên flash sale đang chạy', () => {
    const p = pickPrices(
      [regular, flash(350000, '2026-11-27T00:00:00', '2026-11-27T10:00:00'), flash(299000, '2026-11-27T12:00:00', '2026-11-27T20:00:00')] as never,
      now,
    );
    assert.equal(p.flashPrice, 350000);
  });
});
