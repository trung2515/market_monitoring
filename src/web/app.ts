import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import type { AppContext } from '../container';
import { basicAuth } from './auth';
import { apiRouter, HttpError } from './routes/api';

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Health check không cần đăng nhập (cho uptime monitor / docker)
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  if (ctx.env.AUTH_USER && ctx.env.AUTH_PASSWORD) {
    app.use(basicAuth(ctx.env.AUTH_USER, ctx.env.AUTH_PASSWORD));
  } else {
    ctx.logger.warn('AUTH_USER/AUTH_PASSWORD chưa cấu hình – web KHÔNG yêu cầu đăng nhập');
  }

  app.use(express.json());
  app.use('/api', apiRouter(ctx));
  app.use(express.static(path.resolve(__dirname, '../../public')));

  const errorHandler: ErrorRequestHandler = (err: Error, _req, res, _next) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) ctx.logger.error(err.stack ?? err.message);
    if (res.headersSent) return void res.end();
    res.status(status).json({ error: status >= 500 ? `Lỗi máy chủ: ${err.message}` : err.message });
  };
  app.use(errorHandler);

  return app;
}
