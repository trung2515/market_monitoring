import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDatabase } from '../src/db/database';
import { NodeSqliteDriver } from '../src/db/sql';
import { SqlStore } from '../src/db/sqlStore';
import type { PriceSnapshot, Product } from '../src/domain/types';
import worker from '../src/worker/index';
import { createFakeD1 } from './fakeD1';

const product: Product = {
  productCode: 'P1',
  modelCode: 'EL-1',
  name: 'Chảo Elmich EL-1',
  brand: 'Elmich',
  categorySlug: 'chao-chong-dinh',
  categoryName: 'Chảo',
  url: 'https://x',
  imageUrl: '',
  specs: [],
  sizeKey: null,
  otherPromos: null,
} as unknown as Product;
const snap = (price: number, flash: Partial<PriceSnapshot> = {}) =>
  ({
    productCode: 'P1',
    categorySlug: 'chao-chong-dinh',
    price,
    listPrice: 500000,
    isAvailable: true,
    flashPrice: null,
    flashStart: null,
    flashEnd: null,
    flashHours: null,
    flashQuota: null,
    ...flash,
  }) as unknown as Omit<PriceSnapshot, 'crawlDate'>;

describe('Lấy dữ liệu nhiều lần trong ngày', () => {
  it('lần sau không còn flash sale thì giữ flash sale đã ghi nhận, giá thường lấy mới nhất', async () => {
    const store = new SqlStore(new NodeSqliteDriver(openDatabase(':memory:')));
    const flash = { flashPrice: 199000, flashStart: '2026-11-27 12:00', flashEnd: '2026-11-27 20:00', flashQuota: 50 };
    await store.saveCrawledPage('2026-11-27', [{ product, snapshot: snap(300000, flash) }]);
    await store.saveCrawledPage('2026-11-27', [{ product, snapshot: snap(280000) }]);
    const [s] = await store.snapshotsBetween('2026-11-27', '2026-11-27');
    assert.equal(s?.price, 280000);
    assert.equal(s?.flashPrice, 199000);
    assert.equal(s?.flashStart, '2026-11-27 12:00');
    assert.equal(s?.flashQuota, 50);

    // Flash sale mới trong ngày → thay bằng cái mới
    await store.saveCrawledPage('2026-11-27', [
      { product, snapshot: snap(280000, { flashPrice: 179000, flashStart: '2026-11-27 21:00', flashEnd: '2026-11-27 23:00' }) },
    ]);
    const [s2] = await store.snapshotsBetween('2026-11-27', '2026-11-27');
    assert.equal(s2?.flashPrice, 179000);
    assert.equal(s2?.flashQuota, null);
  });

  it('Worker tự bắt đầu lượt 7:25 mỗi sáng, không tạo lượt trùng', async () => {
    const w = ((worker as unknown as { default?: typeof worker }).default ?? worker) as typeof worker;
    const db = createFakeD1();
    const env = { DB: db, ASSETS: { fetch: async () => new Response('') } } as never;
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
    const fire = async (cron: string, at: string) => {
      await w.scheduled({ cron, scheduledTime: Date.parse(at) } as never, env, ctx as never);
      await Promise.all(waits.splice(0));
    };
    const runCount = () => (db.raw.prepare('SELECT COUNT(*) AS n FROM crawl_runs').get() as { n: number }).n;
    // Chốt các lượt đang chạy, đặt giờ bắt đầu = giờ cron (không phụ thuộc giờ thật lúc chạy test)
    const finishAll = (startedAt: string) =>
      db.raw.exec(
        `UPDATE crawl_runs SET status = 'success', started_at = '${startedAt}' WHERE status = 'running'; DELETE FROM crawl_jobs`,
      );

    // 7:25 sáng (00:25 UTC) – không có mạng tới ĐMX nên bước lấy trang sẽ lỗi, nhưng lượt vẫn được tạo
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('{}', { status: 500 })) as typeof fetch;
    try {
      await fire('25-59 0 * * *', '2026-11-27T00:25:00Z');
      assert.equal(runCount(), 1);
      finishAll('2026-11-27T00:25:00.000Z');
      // Phút sau trong cùng khung: không tạo lượt mới
      await fire('25-59 0 * * *', '2026-11-27T00:26:00Z');
      await fire('* 1 * * *', '2026-11-27T01:00:00Z');
      // Cron "làm tiếp" trong ngày không tự tạo lượt
      await fire('*/10 2-23 * * *', '2026-11-27T15:00:00Z');
      assert.equal(runCount(), 1);
      // Sáng hôm sau: lượt mới
      await fire('25-59 0 * * *', '2026-11-28T00:25:00Z');
      assert.equal(runCount(), 2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
