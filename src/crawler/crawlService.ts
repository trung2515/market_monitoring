import type { TrackingConfig } from '../config/tracking';
import { transaction, type Database } from '../db/database';
import type { CrawlRunRepository } from '../db/repositories/crawlRunRepository';
import type { ProductRepository } from '../db/repositories/productRepository';
import type { SnapshotRepository } from '../db/repositories/snapshotRepository';
import type { CrawlStatus, CrawlTrigger } from '../domain/types';
import { jitter, sleep } from '../utils/async';
import { todayInTimeZone } from '../utils/date';
import type { Logger } from '../utils/logger';
import type { DmxClient } from './dmx/client';
import { normalizeDmxProduct } from './dmx/normalize';

export interface CategoryCrawlResult {
  slug: string;
  name: string;
  productCount: number;
  error?: string;
}

export interface CrawlSummary {
  runId: number;
  crawlDate: string;
  status: Exclude<CrawlStatus, 'running'>;
  productCount: number;
  categories: CategoryCrawlResult[];
  warnings: string[];
}

interface CrawlServiceDeps {
  db: Database;
  client: DmxClient;
  products: ProductRepository;
  snapshots: SnapshotRepository;
  runs: CrawlRunRepository;
  tracking: TrackingConfig;
  timeZone: string;
  delayMs: number;
  logger: Logger;
}

/** Nếu số SP của 1 danh mục giảm quá mức này so với lần trước → cảnh báo (có thể ĐMX đổi web/API). */
const DROP_WARNING_RATIO = 0.5;

export class CrawlAlreadyRunningError extends Error {
  constructor() {
    super('Đang có một lượt cào dữ liệu chạy, vui lòng đợi xong.');
  }
}

/** Điều phối 1 lượt cào: lặp qua các danh mục, chuẩn hoá & lưu DB, ghi nhật ký lượt chạy. */
export class CrawlService {
  private running = false;

  constructor(private readonly deps: CrawlServiceDeps) {}

  get isRunning(): boolean {
    return this.running;
  }

  async run(trigger: CrawlTrigger): Promise<CrawlSummary> {
    if (this.running) throw new CrawlAlreadyRunningError();
    this.running = true;

    const { client, runs, snapshots, tracking, timeZone, logger } = this.deps;
    const crawlDate = todayInTimeZone(timeZone);
    const runId = runs.start(crawlDate, trigger);
    const categories = tracking.categories.filter((c) => c.enabled);
    const previousDate = snapshots.latestDateBefore(crawlDate);
    const previousCounts = previousDate ? snapshots.countByDate(previousDate) : new Map<string, number>();

    const results: CategoryCrawlResult[] = [];
    const warnings: string[] = [];
    logger.info(`Bắt đầu cào ${categories.length} danh mục (ngày ${crawlDate}, trigger=${trigger})`);

    try {
      for (const [i, category] of categories.entries()) {
        if (i > 0) await sleep(jitter(this.deps.delayMs));
        try {
          const fetched = await client.fetchCategory(category.slug);
          const now = new Date();
          const items = fetched.products.map((p) => normalizeDmxProduct(p, category, now));
          this.save(crawlDate, items);

          results.push({ slug: category.slug, name: category.name, productCount: items.length });
          logger.info(`✓ ${category.name}: ${items.length} sản phẩm`);

          if (fetched.invalidCount > 0) {
            warnings.push(`${category.name}: bỏ qua ${fetched.invalidCount} sản phẩm sai cấu trúc JSON`);
          }
          const prev = previousCounts.get(category.slug);
          if (prev && items.length < prev * DROP_WARNING_RATIO) {
            warnings.push(
              `${category.name}: chỉ lấy được ${items.length} SP, giảm mạnh so với ${prev} SP ngày ${previousDate} – nên kiểm tra lại`,
            );
          }
        } catch (err) {
          const message = (err as Error).message;
          logger.error(`✗ ${category.name}: ${message}`);
          results.push({ slug: category.slug, name: category.name, productCount: 0, error: message });
        }
      }

      const failed = results.filter((r) => r.error);
      const productCount = results.reduce((s, r) => s + r.productCount, 0);
      const status: CrawlSummary['status'] =
        failed.length === 0 ? 'success' : failed.length === results.length ? 'failed' : 'partial';
      const error = failed.length ? failed.map((f) => `${f.name}: ${f.error}`).join('\n') : undefined;

      runs.finish(runId, { status, productCount, warnings, error });
      warnings.forEach((w) => logger.warn(w));
      logger.info(`Kết thúc cào: ${status}, ${productCount} sản phẩm`);

      return { runId, crawlDate, status, productCount, categories: results, warnings };
    } catch (err) {
      runs.finish(runId, { status: 'failed', productCount: 0, warnings, error: (err as Error).message });
      throw err;
    } finally {
      this.running = false;
    }
  }

  private save(crawlDate: string, items: ReturnType<typeof normalizeDmxProduct>[]): void {
    const { db, products, snapshots } = this.deps;
    transaction(db, () => {
      for (const item of items) {
        products.upsert(item.product, crawlDate);
        snapshots.upsert({ ...item.snapshot, crawlDate });
      }
    });
  }
}
