import cron from 'node-cron';
import type { AppContext } from '../container';

/** Lên lịch cào tự động hằng ngày theo CRAWL_CRON (múi giờ TIMEZONE) – bản chạy trên Node. */
export function startScheduler(ctx: AppContext): { stop: () => void } {
  const { env, logger, engine } = ctx;

  if (!env.CRAWL_ON_SCHEDULE) {
    logger.info('Lịch cào tự động đang TẮT (CRAWL_ON_SCHEDULE=false)');
    return { stop: () => {} };
  }
  if (!cron.validate(env.CRAWL_CRON)) {
    throw new Error(`CRAWL_CRON không hợp lệ: "${env.CRAWL_CRON}"`);
  }

  const task = cron.schedule(
    env.CRAWL_CRON,
    async () => {
      try {
        await engine.runToCompletion('schedule', env.DMX_REQUEST_DELAY_MS);
      } catch (err) {
        logger.error(`Cào theo lịch thất bại: ${(err as Error).message}`);
      }
    },
    { timezone: env.TIMEZONE },
  );

  logger.info(`Đã lên lịch cào: "${env.CRAWL_CRON}" (${env.TIMEZONE})`);
  return { stop: () => void task.stop() };
}
