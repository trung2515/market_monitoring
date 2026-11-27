import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTrackingConfig } from '../src/config/tracking';
import { openDatabase } from '../src/db/database';
import { ProductRepository } from '../src/db/repositories/productRepository';
import { SnapshotRepository } from '../src/db/repositories/snapshotRepository';
import type { PriceSnapshot, Product } from '../src/domain/types';
import { ReportService } from '../src/report/reportService';

const makeTracking = (segment: Record<string, unknown> = {}) =>
  parseTrackingConfig({
    ownBrand: 'Elmich',
    competitorBrands: ['Sunhouse'],
    categories: [{ slug: 'chao-chong-dinh', name: 'Chảo' }],
    segment: { priceTolerancePercent: 30, ...segment },
  });

function product(code: string, brand: string, name: string, sizeKey = '28cm'): Product {
  return {
    productCode: code,
    modelCode: name.split(' ').at(-1) ?? '',
    name,
    brand,
    categorySlug: 'chao-chong-dinh',
    categoryName: 'Chảo',
    url: `https://www.dienmayxanh.com/chao-chong-dinh/${code}`,
    imageUrl: '',
    specs: [`Đường kính ${sizeKey}`],
    sizeKey,
    isSet: false,
    isOnlineOnly: false,
  };
}

function snap(date: string, code: string, price: number, totalRate: number): PriceSnapshot {
  return {
    crawlDate: date,
    productCode: code,
    categorySlug: 'chao-chong-dinh',
    price,
    listPrice: price * 2,
    discountPercent: 50,
    flashPrice: null,
    isAvailable: true,
    soldCount: totalRate,
    soldText: `Đã bán ${totalRate}`,
    totalRate,
    rating: 5,
  };
}

function setup(segment: Record<string, unknown> = {}) {
  const db = openDatabase(':memory:');
  const products = new ProductRepository(db);
  const snapshots = new SnapshotRepository(db);
  const save = (date: string, p: Product, price: number, sold: number) => {
    products.upsert(p, date);
    snapshots.upsert(snap(date, p.productCode, price, sold));
  };

  const elmich = product('E1', 'Elmich', 'Chảo Elmich EL-5753MN');
  const sun = product('S1', 'Sunhouse', 'Chảo Sunhouse SBDS28MT');
  const sunGone = product('S2', 'Sunhouse', 'Chảo Sunhouse cũ SH-OLD1', '24cm');
  const sunNew = product('S3', 'Sunhouse', 'Chảo Sunhouse mới SH-NEW1');
  const tefal = product('T1', 'Tefal', 'Chảo Tefal E2770674');

  // Tuần trước (mốc so sánh)
  save('2026-11-20', elmich, 300000, 100);
  save('2026-11-20', sun, 280000, 1000);
  save('2026-11-20', sunGone, 200000, 50);
  save('2026-11-20', tefal, 320000, 500);
  // Trong tuần 23–29/11
  save('2026-11-24', elmich, 300000, 120);
  save('2026-11-24', sun, 250000, 1100);
  save('2026-11-24', sunNew, 310000, 5);
  save('2026-11-24', tefal, 320000, 520);
  save('2026-11-26', elmich, 290000, 150);
  save('2026-11-26', sun, 260000, 1200);
  save('2026-11-26', sunNew, 310000, 20);
  save('2026-11-26', tefal, 320000, 540);

  const service = new ReportService({
    products,
    snapshots,
    tracking: makeTracking(segment),
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  return { db, service };
}

describe('ReportService', () => {
  it('phân tích đúng biến động trong tuần', () => {
    const { service } = setup();
    const data = service.buildData({ type: 'week', date: '2026-11-26' });

    assert.equal(data.baselineDate, '2026-11-20');
    assert.equal(data.endDate, '2026-11-26');
    assert.deepEqual(data.crawlDates, ['2026-11-24', '2026-11-26']);
    assert.equal(data.current.length, 4);

    // Đổi giá: Sunhouse 280k → 260k (2 lần đổi), Elmich 300k → 290k
    const changes = Object.fromEntries(data.priceChanges.map((c) => [c.product.productCode, c]));
    assert.equal(changes.S1?.diff, -20000);
    assert.equal(changes.S1?.changeCount, 2);
    assert.equal(changes.S1?.minPrice, 250000);
    assert.equal(changes.E1?.diff, -10000);
    assert.equal(changes.T1, undefined);

    assert.deepEqual(
      data.newProducts.map((p) => p.product.productCode),
      ['S3'],
    );
    assert.deepEqual(
      data.goneProducts.map((p) => p.product.productCode),
      ['S2'],
    );

    const sold = Object.fromEntries(data.soldDeltas.map((s) => [s.product.productCode, s.delta]));
    assert.equal(sold.S1, 200);
    assert.equal(sold.E1, 50);
    assert.equal(sold.S3, 15); // SP mới: tính từ ngày đầu tiên xuất hiện

    // Sheet danh mục: Elmich + đối thủ cùng tầm giá (±30%), ưu tiên cùng kích thước rồi giá gần nhất
    assert.equal(data.categories.length, 1);
    const chao = data.categories[0];
    assert.equal(chao?.name, 'Chảo');
    assert.equal(chao?.products.length, 4);
    assert.deepEqual(
      chao?.products.map((p) => p.product.productCode),
      ['S1', 'E1', 'S3', 'T1'],
    ); // theo giá
    assert.equal(chao?.ownRows.length, 1);
    assert.deepEqual(
      chao?.ownRows[0]?.competitors.map((c) => c.competitor.product.productCode),
      ['S3', 'S1', 'T1'],
    );
    assert.equal(chao?.ownRows[0]?.competitors[0]?.priceDiffPercent, 6.9); // (310 − 290) / 290
  });

  it('chỉ so với đối thủ trong danh sách khi bật onlyListedCompetitors', () => {
    const { service } = setup({ onlyListedCompetitors: true });
    const data = service.buildData({ type: 'week', date: '2026-11-26' });
    assert.deepEqual(
      data.categories[0]?.ownRows[0]?.competitors.map((c) => c.competitor.product.brand),
      ['Sunhouse', 'Sunhouse'],
    );
  });

  it('không lấy đối thủ ngoài tầm giá', () => {
    const { service } = setup({ priceTolerancePercent: 5 });
    const data = service.buildData({ type: 'week', date: '2026-11-26' });
    assert.deepEqual(
      data.categories[0]?.ownRows[0]?.competitors.map((c) => c.competitor.product.productCode),
      [],
    );
  });

  it('lọc theo thương hiệu', () => {
    const { service } = setup();
    const data = service.buildData({ type: 'week', date: '2026-11-26', filter: { brands: ['tefal'] } });
    assert.deepEqual(
      data.current.map((c) => c.product.brand),
      ['Tefal'],
    );
  });

  it('kỳ không có dữ liệu', () => {
    const { service } = setup();
    const data = service.buildData({ type: 'month', date: '2025-01-15' });
    assert.equal(data.endDate, null);
    assert.equal(data.current.length, 0);
    assert.ok(data.notes.length > 0);
  });

  it('lần cào đầu tiên của hệ thống không bị tính là SP mới', () => {
    const { service } = setup();
    const data = service.buildData({ type: 'custom', from: '2026-11-20', to: '2026-11-20' });
    assert.equal(data.newProducts.length, 0);
  });

  it('dựng được workbook đủ sheet', { skip: !hasExcelJs() && 'chưa cài exceljs' }, () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildWorkbook } = require('../src/report/excel/workbook') as typeof import('../src/report/excel/workbook');
    const { service } = setup();
    const wb = buildWorkbook(service.buildData({ type: 'week', date: '2026-11-26' }));
    assert.deepEqual(
      wb.worksheets.map((w) => w.name),
      ['Tổng quan', 'Chảo', 'Biến động giá', 'SP mới', 'Ngừng hiển thị', 'Lượt bán'],
    );
  });
});

function hasExcelJs(): boolean {
  try {
    require.resolve('exceljs');
    return true;
  } catch {
    return false;
  }
}
