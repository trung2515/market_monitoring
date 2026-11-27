import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import { routeApi } from '../api/handlers';
import type { AppContext } from '../container';
import { isConfigured, login, logoutCookie, PUBLIC_PATHS, verifySession } from '../auth/session';
import { dmxDiagnostics } from './diag';

/** Web server cho bản chạy trên Node. API dùng chung với bản Cloudflare (src/api/handlers.ts). */
export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Không cần đăng nhập: health check & trang kiểm tra kết nối ĐMX
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/diag/dmx', dmxDiagnostics(ctx.env.DMX_PROVINCE_ID, ctx.logger.child('diag')));

  // ----- Đăng nhập (màn hình /login, phiên hết hạn lúc 0h mỗi ngày) -----
  const auth = { user: ctx.env.AUTH_USER, password: ctx.env.AUTH_PASSWORD, timeZone: ctx.env.TIMEZONE };
  const publicDir = path.resolve(__dirname, '../../public');
  if (isConfigured(auth)) {
    app.post('/api/login', express.json(), async (req, res) => {
      const body = (req.body ?? {}) as { user?: unknown; password?: unknown };
      const result = await login(auth, String(body.user ?? ''), String(body.password ?? ''), { secure: req.secure });
      if (!result.ok) return void res.status(result.status).json({ error: result.error });
      res.setHeader('Set-Cookie', result.setCookie);
      res.json({ ok: true, expiresAt: result.expiresAt });
    });
    app.post('/api/logout', (req, res) => {
      res.setHeader('Set-Cookie', logoutCookie(req.secure));
      res.json({ ok: true });
    });
    app.use(async (req, res, next) => {
      const loggedIn = await verifySession(auth, req.headers.cookie);
      if (PUBLIC_PATHS.has(req.path)) {
        if (loggedIn && req.path.startsWith('/login')) return res.redirect('/');
        if (req.path === '/login') return res.sendFile(path.join(publicDir, 'login.html'));
        return next();
      }
      if (loggedIn) return next();
      if (req.path.startsWith('/api/')) {
        return void res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.' });
      }
      res.redirect('/login');
    });
  } else {
    ctx.logger.warn('AUTH_USER/AUTH_PASSWORD chưa cấu hình – web KHÔNG yêu cầu đăng nhập');
    app.post('/api/logout', (_req, res) => void res.json({ ok: true }));
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
  app.use(express.static(publicDir));

  const errorHandler: ErrorRequestHandler = (err: Error, _req, res, _next) => {
    ctx.logger.error(err.stack ?? err.message);
    if (res.headersSent) return void res.end();
    res.status(500).json({ error: `Lỗi máy chủ: ${err.message}` });
  };
  app.use(errorHandler);

  return app;
}
