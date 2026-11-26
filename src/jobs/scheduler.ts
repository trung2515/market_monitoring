import cron from 'node-cron';
import type { AppContext } from '../container';
import { CrawlAlreadyRunningError } from '../crawler/crawlService';

/** Lên lịch cào tự động hằng ngày theo CRAWL_CRON (múi giờ TIMEZONE). */
export function startScheduler(ctx: AppContext): { stop: () => void } {
  const { env, logger, crawlService } = ctx;

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
        await crawlService.run('schedule');
      } catch (err) {
        if (err instanceof CrawlAlreadyRunningError) logger.warn(err.message);
        else logger.error(`Cào theo lịch thất bại: ${(err as Error).message}`);
      }
    },
    { timezone: env.TIMEZONE },
  );

  logger.info(`Đã lên lịch cào: "${env.CRAWL_CRON}" (${env.TIMEZONE})`);
  return { stop: () => void task.stop() };
}
