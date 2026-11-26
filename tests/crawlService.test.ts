import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseTrackingConfig } from '../src/config/tracking';
import { CrawlService } from '../src/crawler/crawlService';
import { DmxClient } from '../src/crawler/dmx/client';
import { openDatabase } from '../src/db/database';
import { CrawlRunRepository } from '../src/db/repositories/crawlRunRepository';
import { ProductRepository } from '../src/db/repositories/productRepository';
import { SnapshotRepository } from '../src/db/repositories/snapshotRepository';
import { silentLogger } from '../src/utils/logger';

const fixture = readFileSync(path.join(__dirname, 'fixtures/dmx-category-page.json'), 'utf8');

describe('CrawlService', () => {
  it('cào nhiều danh mục, lưu DB, ghi nhận danh mục lỗi', async () => {
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { urlCate: string };
      const json =
        body.urlCate === 'chao-chong-dinh'
          ? fixture
          : JSON.stringify({ code: 80000, message: 'Không tìm thấy CateCode từ Url khi gọi BE', data: null });
      return new Response(json, { status: 200 });
    }) as typeof fetch;

    const db = openDatabase(':memory:');
    const products = new ProductRepository(db);
    const snapshots = new SnapshotRepository(db);
    const runs = new CrawlRunRepository(db);
    const service = new CrawlService({
      db,
      client: new DmxClient({ provinceId: 1027, pageSize: 50, delayMs: 0, timeoutMs: 5000, maxRetries: 0, logger: silentLogger, fetchImpl }),
      products,
      snapshots,
      runs,
      tracking: parseTrackingConfig({
        ownBrand: 'Elmich',
        categories: [
          { slug: 'chao-chong-dinh', name: 'Chảo' },
          { slug: 'slug-sai', name: 'Danh mục sai' },
        ],
      }),
      timeZone: 'Asia/Ho_Chi_Minh',
      delayMs: 0,
      logger: silentLogger,
    });

    const summary = await service.run('cli');
    assert.equal(summary.status, 'partial');
    assert.equal(summary.productCount, 3);
    assert.match(summary.categories[1]?.error ?? '', /CateCode/);
    assert.ok(summary.warnings.some((w) => w.includes('sai cấu trúc')));

    assert.equal(products.count(), 3);
    assert.equal(snapshots.findBetween(summary.crawlDate, summary.crawlDate).length, 3);
    assert.equal(runs.recent(1)[0]?.status, 'partial');

    // Cào lại cùng ngày → ghi đè, không nhân đôi
    await service.run('manual');
    assert.equal(snapshots.findBetween(summary.crawlDate, summary.crawlDate).length, 3);
    assert.equal(service.isRunning, false);
  });
});
