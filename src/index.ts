import { createContext } from './container';
import { startScheduler } from './jobs/scheduler';
import { createApp } from './web/app';

/** Điểm khởi động server: web + lịch cào tự động. */
function main(): void {
  const ctx = createContext();
  const { env, logger } = ctx;

  const stale = ctx.repos.runs.failStaleRuns();
  if (stale > 0) logger.warn(`Đánh dấu ${stale} lượt cào bị gián đoạn trước đó là thất bại`);

  const scheduler = startScheduler(ctx);
  const server = createApp(ctx).listen(env.PORT, () => {
    logger.info(`Web đang chạy tại http://localhost:${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`Nhận ${signal}, đang tắt...`);
    scheduler.stop();
    server.close(() => {
      ctx.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
