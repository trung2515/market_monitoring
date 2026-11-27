import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import { routeApi } from '../api/handlers';
import type { AppContext } from '../container';
import { basicAuth } from './auth';
import { dmxDiagnostics } from './diag';

/** Web server cho bản chạy trên Node. API dùng chung với bản Cloudflare (src/api/handlers.ts). */
export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Không cần đăng nhập: health check & trang kiểm tra kết nối ĐMX
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/diag/dmx', dmxDiagnostics(ctx.env.DMX_PROVINCE_ID, ctx.logger.child('diag')));

  if (ctx.env.AUTH_USER && ctx.env.AUTH_PASSWORD) {
    app.use(basicAuth(ctx.env.AUTH_USER, ctx.env.AUTH_PASSWORD));
  } else {
    ctx.logger.warn('AUTH_USER/AUTH_PASSWORD chưa cấu hình – web KHÔNG yêu cầu đăng nhập');
  }

  app.use('/api', async (req, res, next) => {
    try {
      const url = new URL(req.originalUrl, 'http://localhost');
      const result = await routeApi(ctx.api, req.method, url.pathname, url.searchParams);
      if (!result) return next();
      res.status(result.status).json(result.body);
    } catch (err) {
      next(err);
    }
  });
  app.use(express.static(path.resolve(__dirname, '../../public')));

  const errorHandler: ErrorRequestHandler = (err: Error, _req, res, _next) => {
    ctx.logger.error(err.stack ?? err.message);
    if (res.headersSent) return void res.end();
    res.status(500).json({ error: `Lỗi máy chủ: ${err.message}` });
  };
  app.use(errorHandler);

  return app;
}
