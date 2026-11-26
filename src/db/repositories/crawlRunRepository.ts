import type { CrawlRun, CrawlStatus, CrawlTrigger } from '../../domain/types';
import type { Database } from '../database';
import { jsonArray, num, str, strOrNull } from '../rowMappers';

export class CrawlRunRepository {
  constructor(private readonly db: Database) {}

  start(crawlDate: string, trigger: CrawlTrigger): number {
    const res = this.db
      .prepare(`INSERT INTO crawl_runs (crawl_date, trigger, status, started_at) VALUES (?, ?, 'running', ?)`)
      .run(crawlDate, trigger, new Date().toISOString());
    return Number(res.lastInsertRowid);
  }

  finish(
    id: number,
    result: { status: Exclude<CrawlStatus, 'running'>; productCount: number; warnings: string[]; error?: string },
  ): void {
    this.db
      .prepare(
        `UPDATE crawl_runs SET status = ?, finished_at = ?, product_count = ?, warnings = ?, error = ? WHERE id = ?`,
      )
      .run(
        result.status,
        new Date().toISOString(),
        result.productCount,
        JSON.stringify(result.warnings),
        result.error ?? null,
        id,
      );
  }

  /** Đánh dấu các lần chạy bị treo (vd server tắt giữa chừng) là thất bại. */
  failStaleRuns(): number {
    const res = this.db
      .prepare(
        `UPDATE crawl_runs SET status = 'failed', finished_at = ?, error = 'Bị gián đoạn (server khởi động lại)'
         WHERE status = 'running'`,
      )
      .run(new Date().toISOString());
    return Number(res.changes);
  }

  recent(limit = 10): CrawlRun[] {
    return this.db.prepare('SELECT * FROM crawl_runs ORDER BY id DESC LIMIT ?').all(limit).map(mapRun);
  }
}

function mapRun(r: Record<string, unknown>): CrawlRun {
  return {
    id: num(r.id),
    crawlDate: str(r.crawl_date),
    trigger: str(r.trigger) as CrawlTrigger,
    status: str(r.status) as CrawlStatus,
    startedAt: str(r.started_at),
    finishedAt: strOrNull(r.finished_at),
    productCount: num(r.product_count),
    warnings: jsonArray(r.warnings),
    error: strOrNull(r.error),
  };
}
