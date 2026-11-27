import { createApi, type Api } from './api/handlers';
import { loadEnv, type Env } from './config/env';
import type { TrackingConfig } from './config/tracking';
import { loadTrackingConfig } from './config/trackingLoader';
import { CrawlEngine } from './crawler/crawlEngine';
import { DmxClient } from './crawler/dmx/client';
import { openDatabase, type Database } from './db/database';
import { NodeSqliteDriver } from './db/sql';
import { SqlStore } from './db/sqlStore';
import { createLogger, type Logger } from './utils/logger';

/**
 * Composition root cho bản chạy trên Node (máy tính / VPS): nơi DUY NHẤT khởi tạo & nối các thành phần.
 * Bản Cloudflare có composition root riêng ở src/worker/index.ts, dùng chung các thành phần còn lại.
 */
export interface AppContext {
  env: Env;
  tracking: TrackingConfig;
  logger: Logger;
  db: Database;
  store: SqlStore;
  engine: CrawlEngine;
  api: Api;
  close(): void;
}

export function createContext(overrides: Partial<Pick<AppContext, 'env' | 'tracking'>> = {}): AppContext {
  const env = overrides.env ?? loadEnv();
  const tracking = overrides.tracking ?? loadTrackingConfig(env.TRACKING_CONFIG);
  const logger = createLogger(env.LOG_LEVEL);
  const db = openDatabase(env.DB_PATH);
  const store = new SqlStore(new NodeSqliteDriver(db));

  const client = new DmxClient({
    provinceId: env.DMX_PROVINCE_ID,
    pageSize: env.DMX_PAGE_SIZE,
    delayMs: env.DMX_REQUEST_DELAY_MS,
    timeoutMs: env.DMX_REQUEST_TIMEOUT_MS,
    maxRetries: env.DMX_MAX_RETRIES,
    logger: logger.child('dmx'),
  });

  const engine = new CrawlEngine({ store, client, tracking, timeZone: env.TIMEZONE, logger: logger.child('crawl') });
  const api = createApi({ store, engine, client, tracking });

  return { env, tracking, logger, db, store, engine, api, close: () => db.close() };
}
