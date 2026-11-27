import { withStoredCategories } from '../config/categories';
import type { TrackingConfig } from '../config/tracking';
import type { SqlStore } from '../db/sqlStore';
import type { CrawlRun, CrawlStatus, CrawlTrigger } from '../domain/types';
import { jitter, sleep } from '../utils/async';
import { todayInTimeZone } from '../utils/date';
import type { Logger } from '../utils/logger';
import type { DmxClient } from './dmx/client';
import { normalizeDmxProduct } from './dmx/normalize';

/**
 * Cào dữ liệu theo TỪNG BƯỚC: mỗi bước xử lý đúng 1 trang (≤ 50 SP) của 1 danh mục.
 *
 * Lý do: Cloudflare Workers (gói free) chỉ cho ~10 ms CPU mỗi lần chạy, nên không thể cào cả 9 danh mục
 * trong 1 lần. Tiến độ được lưu trong bảng crawl_jobs, nên các bước có thể chạy rải rác
 * (cron mỗi phút, trình duyệt gọi liên tục, hoặc vòng lặp trên Node) và tiếp tục được nếu bị gián đoạn.
 */

export interface CrawlProgress {
  runId: number;
  crawlDate: string;
  status: CrawlStatus;
  totalJobs: number;
  doneJobs: number;
  productCount: number;
}

export interface StepResult {
  /** Đã xử lý 1 trang ở bước này */
  worked: boolean;
  /** Lượt cào đã kết thúc (sau bước này) */
  finished: boolean;
  progress: CrawlProgress | null;
}

interface CrawlEngineDeps {
  store: SqlStore;
  client: DmxClient;
  tracking: TrackingConfig;
  timeZone: string;
  logger: Logger;
  /** Số lần thử lại mỗi trang khi lỗi */
  maxAttempts?: number;
  /** Job "running" quá thời gian này coi như bị bỏ dở và được nhận lại */
  staleJobMs?: number;
  /** Lượt cào chạy quá thời gian này coi như hỏng */
  staleRunMs?: number;
}

/** Nếu số SP của 1 danh mục giảm quá mức này so với lần trước → cảnh báo (có thể ĐMX đổi web/API). */
const DROP_WARNING_RATIO = 0.5;

export class CrawlEngine {
  private readonly maxAttempts: number;
  private readonly staleJobMs: number;
  private readonly staleRunMs: number;

  constructor(private readonly deps: CrawlEngineDeps) {
    this.maxAttempts = deps.maxAttempts ?? 3;
    this.staleJobMs = deps.staleJobMs ?? 2 * 60_000;
    this.staleRunMs = deps.staleRunMs ?? 6 * 3600_000;
  }

  /**
   * Bắt đầu lượt cào mới (tạo job trang đầu cho mỗi danh mục).
   * Nếu đang có lượt chạy dở thì trả về lượt đó thay vì tạo mới.
   */
  async start(trigger: CrawlTrigger): Promise<{ run: CrawlRun; created: boolean }> {
    const { store, tracking, timeZone, logger } = this.deps;
    await store.failStaleRuns(new Date(Date.now() - this.staleRunMs).toISOString(), 'Bị gián đoạn, không chạy xong');

    const running = await store.runningRun();
    if (running) return { run: running, created: false };

    const categories = (await withStoredCategories(store, tracking)).categories.filter((c) => c.enabled);
    if (categories.length === 0) throw new Error('Chưa có danh mục nào được theo dõi. Hãy thêm danh mục trên web.');
    const crawlDate = todayInTimeZone(timeZone);
    const runId = await store.createRun(crawlDate, trigger);
    await store.addJobs(
      runId,
      categories.map((c) => ({ categorySlug: c.slug, categoryName: c.name, pageIndex: 0 })),
    );
    logger.info(`Bắt đầu lượt cào #${runId} (${crawlDate}, ${trigger}): ${categories.length} danh mục`);
    const run = await store.getRun(runId);
    if (!run) throw new Error('Không đọc được lượt cào vừa tạo');
    return { run, created: true };
  }

  /** Xử lý 1 trang. Gọi lặp lại tới khi `finished`. */
  async step(): Promise<StepResult> {
    const { store, client, logger } = this.deps;
    const job = await store.claimNextJob(new Date(Date.now() - this.staleJobMs).toISOString());

    if (!job) {
      // Không còn job → nếu có lượt đang chạy thì chốt kết quả
      const running = await store.runningRun();
      if (!running) return { worked: false, finished: true, progress: null };
      const summary = await store.jobSummary(running.id);
      if (summary.pending + summary.running > 0) {
        return { worked: false, finished: false, progress: await this.progress(running) };
      }
      await this.finalize(running);
      return { worked: false, finished: true, progress: await this.progress(running.id) };
    }

    const run = await store.getRun(job.runId);
    if (!run) throw new Error(`Không tìm thấy lượt cào #${job.runId}`);
    const category = { slug: job.categorySlug, name: job.categoryName };

    try {
      const page = await client.fetchPage(job.categorySlug, job.pageIndex);
      const now = new Date();
      const items = page.products.map((p) => normalizeDmxProduct(p, category, now));
      await store.saveCrawledPage(run.crawlDate, items);
      if (page.rawCount > 0 && page.remaining > 0) {
        await store.addJobs(run.id, [
          { categorySlug: job.categorySlug, categoryName: job.categoryName, pageIndex: job.pageIndex + 1 },
        ]);
      }
      await store.completeJob(job.id, items.length, page.invalidCount);
      logger.info(`✓ ${job.categoryName} trang ${job.pageIndex + 1}: ${items.length} SP`);
    } catch (err) {
      const message = (err as Error).message;
      logger.warn(`✗ ${job.categoryName} trang ${job.pageIndex + 1} (lần ${job.attempts}): ${message}`);
      await store.failJob(job.id, message, this.maxAttempts);
    }

    const summary = await store.jobSummary(run.id);
    if (summary.pending + summary.running === 0) {
      await this.finalize(run);
      return { worked: true, finished: true, progress: await this.progress(run.id) };
    }
    return { worked: true, finished: false, progress: await this.progress(run) };
  }

  /** Chạy hết 1 lượt (dùng trên Node: dòng lệnh, lịch cron). */
  async runToCompletion(trigger: CrawlTrigger, delayMs: number): Promise<CrawlRun> {
    const { run } = await this.start(trigger);
    for (let i = 0; i < 1000; i++) {
      const res = await this.step();
      if (res.finished) break;
      if (res.worked) await sleep(jitter(delayMs));
      else await sleep(1000);
    }
    return (await this.deps.store.getRun(run.id)) ?? run;
  }

  async progress(runOrId: CrawlRun | number): Promise<CrawlProgress | null> {
    const run = typeof runOrId === 'number' ? await this.deps.store.getRun(runOrId) : runOrId;
    if (!run) return null;
    const summary = await this.deps.store.jobSummary(run.id);
    return {
      runId: run.id,
      crawlDate: run.crawlDate,
      status: run.status,
      totalJobs: summary.total,
      doneJobs: summary.done + summary.failed,
      productCount: run.status === 'running' ? summary.productCount : run.productCount,
    };
  }

  private async finalize(run: CrawlRun): Promise<void> {
    const { store, logger } = this.deps;
    const summary = await store.jobSummary(run.id);
    const warnings: string[] = summary.invalidByCategory.map(
      (c) => `${c.categoryName}: bỏ qua ${c.invalid} sản phẩm sai cấu trúc JSON`,
    );

    // So số SP từng danh mục với lần cào trước
    const previousDate = await store.latestDateBefore(run.crawlDate);
    if (previousDate) {
      const [prev, curr] = await Promise.all([store.categoryCounts(previousDate), store.categoryCounts(run.crawlDate)]);
      const { categories } = await withStoredCategories(store, this.deps.tracking);
      for (const c of categories.filter((x) => x.enabled)) {
        const before = prev.get(c.slug);
        const now = curr.get(c.slug) ?? 0;
        if (before && now < before * DROP_WARNING_RATIO) {
          warnings.push(`${c.name}: chỉ lấy được ${now} SP, giảm mạnh so với ${before} SP ngày ${previousDate} – nên kiểm tra lại`);
        }
      }
    }

    const failedCategories = new Set(summary.errors.map((e) => e.categoryName));
    const status: Exclude<CrawlStatus, 'running'> =
      summary.failed === 0 ? 'success' : summary.done === 0 ? 'failed' : 'partial';
    const error = summary.errors.length
      ? [...failedCategories]
          .map((name) => `${name}: ${summary.errors.find((e) => e.categoryName === name)?.error ?? ''}`)
          .join('\n')
      : undefined;

    await store.finishRun(run.id, { status, productCount: summary.productCount, warnings, error });
    warnings.forEach((w) => logger.warn(w));
    logger.info(`Kết thúc lượt cào #${run.id}: ${status}, ${summary.productCount} sản phẩm`);
  }
}
