import { loadEnv, type Env } from './config/env';
import { loadTrackingConfig, type TrackingConfig } from './config/tracking';
import { CrawlService } from './crawler/crawlService';
import { DmxClient } from './crawler/dmx/client';
import { openDatabase, type Database } from './db/database';
import { CrawlRunRepository } from './db/repositories/crawlRunRepository';
import { ProductRepository } from './db/repositories/productRepository';
import { SnapshotRepository } from './db/repositories/snapshotRepository';
import { ReportService } from './report/reportService';
import { createLogger, type Logger } from './utils/logger';

/**
 * Composition root: nơi DUY NHẤT khởi tạo & nối các thành phần với nhau.
 * Các module khác chỉ nhận phụ thuộc qua constructor → dễ test, dễ thay thế.
 */
export interface AppContext {
  env: Env;
  tracking: TrackingConfig;
  logger: Logger;
  db: Database;
  repos: {
    products: ProductRepository;
    snapshots: SnapshotRepository;
    runs: CrawlRunRepository;
  };
  crawlService: CrawlService;
  reportService: ReportService;
  close(): void;
}

export function createContext(overrides: Partial<Pick<AppContext, 'env' | 'tracking'>> = {}): AppContext {
  const env = overrides.env ?? loadEnv();
  const tracking = overrides.tracking ?? loadTrackingConfig(env.TRACKING_CONFIG);
  const logger = createLogger(env.LOG_LEVEL);
  const db = openDatabase(env.DB_PATH);

  const repos = {
    products: new ProductRepository(db),
    snapshots: new SnapshotRepository(db),
    runs: new CrawlRunRepository(db),
  };

  const client = new DmxClient({
    provinceId: env.DMX_PROVINCE_ID,
    pageSize: env.DMX_PAGE_SIZE,
    delayMs: env.DMX_REQUEST_DELAY_MS,
    timeoutMs: env.DMX_REQUEST_TIMEOUT_MS,
    maxRetries: env.DMX_MAX_RETRIES,
    logger: logger.child('dmx'),
  });

  const crawlService = new CrawlService({
    db,
    client,
    ...repos,
    tracking,
    timeZone: env.TIMEZONE,
    delayMs: env.DMX_REQUEST_DELAY_MS,
    logger: logger.child('crawl'),
  });

  const reportService = new ReportService({
    products: repos.products,
    snapshots: repos.snapshots,
    tracking,
    timeZone: env.TIMEZONE,
  });

  return { env, tracking, logger, db, repos, crawlService, reportService, close: () => db.close() };
}
