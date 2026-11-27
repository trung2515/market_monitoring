import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createApi, routeApi } from '../src/api/handlers';
import { parseTrackingConfig } from '../src/config/tracking';
import { CrawlEngine } from '../src/crawler/crawlEngine';
import { DmxClient } from '../src/crawler/dmx/client';
import { openDatabase } from '../src/db/database';
import { NodeSqliteDriver, type SqlDriver } from '../src/db/sql';
import { SqlStore } from '../src/db/sqlStore';
import { silentLogger } from '../src/utils/logger';
import { D1Driver } from '../src/worker/d1Driver';
import { createFakeD1 } from './fakeD1';

const fixture = readFileSync(path.join(__dirname, 'fixtures/dmx-category-page.json'), 'utf8');

const tracking = parseTrackingConfig({
  ownBrand: 'Elmich',
  categories: [
    { slug: 'chao-chong-dinh', name: 'Chảo' },
    { slug: 'slug-sai', name: 'Danh mục sai' },
  ],
});

function setup(driver: SqlDriver) {
  let calls = 0;
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init?.body)) as { urlCate: string };
    const json =
      body.urlCate === 'chao-chong-dinh' || body.urlCate === 'noi-com-dien'
        ? fixture
        : JSON.stringify({ code: 80000, message: 'Không tìm thấy CateCode từ Url khi gọi BE', data: null });
    return new Response(json, { status: 200 });
  }) as typeof fetch;
  const store = new SqlStore(driver);
  const client = new DmxClient({
    provinceId: 1027,
    pageSize: 50,
    delayMs: 0,
    timeoutMs: 5000,
    maxRetries: 0,
    logger: silentLogger,
    fetchImpl,
  });
  const engine = new CrawlEngine({ store, client, tracking, timeZone: 'Asia/Ho_Chi_Minh', logger: silentLogger });
  return { store, engine, client, calls: () => calls };
}

for (const [label, makeDriver] of [
  ['node:sqlite', () => new NodeSqliteDriver(openDatabase(':memory:'))],
  ['D1 (giả lập)', () => new D1Driver(createFakeD1())],
] as const) {
  describe(`CrawlEngine trên ${label}`, () => {
    it('cào theo từng bước, lưu DB, thử lại danh mục lỗi rồi chốt "partial"', async () => {
      const { store, engine, calls } = setup(makeDriver());

      const { run, created } = await engine.start('manual');
      assert.equal(created, true);
      // Đang chạy thì bấm lại không tạo lượt mới
      assert.equal((await engine.start('manual')).created, false);

      let steps = 0;
      let last;
      do {
        last = await engine.step();
        steps++;
      } while (!last.finished && steps < 20);

      assert.equal(last.finished, true);
      // 1 trang chảo + 3 lần thử slug sai
      assert.equal(calls(), 4);
      const done = await store.getRun(run.id);
      assert.equal(done?.status, 'partial');
      assert.equal(done?.productCount, 3);
      assert.match(done?.error ?? '', /CateCode/);
      assert.ok(done?.warnings.some((w) => w.includes('sai cấu trúc')));
      assert.equal(await store.productCount(), 3);
      assert.equal((await store.snapshotsBetween(run.crawlDate, run.crawlDate)).length, 3);

      // Hết việc → step trả finished, không gọi thêm ĐMX
      assert.deepEqual(await engine.step(), { worked: false, finished: true, progress: null });

      // Cào lại cùng ngày → ghi đè, không nhân đôi
      await engine.runToCompletion('cli', 0);
      assert.equal((await store.snapshotsBetween(run.crawlDate, run.crawlDate)).length, 3);
    });

    it('API báo cáo trả dữ liệu theo ngày', async () => {
      const { store, engine, client } = setup(makeDriver());
      const run = await engine.runToCompletion('cli', 0);
      const api = createApi({ store, engine, client, tracking });
      const q = (s: string) => new URLSearchParams(s);

      const dates = await routeApi(api, 'GET', '/api/report/dates', q(`from=2000-01-01&to=2999-01-01`));
      assert.deepEqual((dates?.body as { dates: string[] }).dates, [run.crawlDate]);
      const snaps = await routeApi(api, 'GET', '/api/report/snapshots', q(`date=${run.crawlDate}`));
      assert.equal((snaps?.body as { snapshots: unknown[] }).snapshots.length, 3);
      const products = await routeApi(api, 'GET', '/api/report/products', q(''));
      assert.equal((products?.body as { products: unknown[] }).products.length, 3);
      assert.equal((await routeApi(api, 'GET', '/api/khong-co', q('')))?.status, 404);
    });

    it('quản lý danh mục theo dõi trên web', async () => {
      const { store, engine, client, calls } = setup(makeDriver());
      const api = createApi({ store, engine, client, tracking });
      const call = (method: string, path: string, query = '') => routeApi(api, method, path, new URLSearchParams(query));
      const list = async () =>
        ((await call('GET', '/api/categories'))?.body as { categories: { slug: string; enabled: boolean }[] })
          .categories;

      // Lần đầu: nạp từ config
      assert.deepEqual(
        (await list()).map((c) => c.slug),
        ['chao-chong-dinh', 'slug-sai'],
      );

      // Thêm bằng link ĐMX
      const added = await call('POST', '/api/categories', 'url=https://www.dienmayxanh.com/noi-com-dien?sort=1');
      assert.equal(added?.status, 200);
      assert.ok((await list()).some((c) => c.slug === 'noi-com-dien'));
      assert.equal((await call('POST', '/api/categories', 'url=https://google.com/abc'))?.status, 400);
      assert.equal((await call('POST', '/api/categories', 'url=khong-ton-tai'))?.status, 400);

      // Ngừng theo dõi → lượt cào chỉ lấy danh mục còn bật
      await call('POST', '/api/categories/update', 'slug=slug-sai&enabled=0');
      await call('POST', '/api/categories/update', 'slug=noi-com-dien&enabled=0');
      const before = calls();
      const run = await engine.runToCompletion('cli', 0);
      assert.equal(calls() - before, 1);
      assert.equal(run.status, 'success');

      // Có dữ liệu thì không xoá được; chưa có dữ liệu thì xoá được
      assert.equal((await call('POST', '/api/categories/delete', 'slug=chao-chong-dinh'))?.status, 409);
      assert.equal((await call('POST', '/api/categories/delete', 'slug=slug-sai'))?.status, 200);
      assert.deepEqual(
        (await list()).map((c) => [c.slug, c.enabled]).sort(),
        [
          ['chao-chong-dinh', true],
          ['noi-com-dien', false],
        ],
      );

      // Thêm danh mục mới vào file config → tự nạp; danh mục đã xoá trên web không bị nạp lại
      const api2 = createApi({
        store,
        engine,
        client,
        tracking: parseTrackingConfig({
          ownBrand: 'Elmich',
          categories: [
            { slug: 'chao-chong-dinh', name: 'Chảo' },
            { slug: 'slug-sai', name: 'Danh mục sai' },
            { slug: 'ban-ui', name: 'Bàn ủi' },
          ],
        }),
      });
      const names = ((await routeApi(api2, 'GET', '/api/categories', new URLSearchParams()))?.body as {
        categories: { slug: string; name: string }[];
      }).categories;
      assert.deepEqual(
        names.map((c) => c.slug),
        ['ban-ui', 'chao-chong-dinh', 'noi-com-dien'],
      );
    });
  });
}
