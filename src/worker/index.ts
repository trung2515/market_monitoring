import trackingJson from '../../config/tracking.json';
import { createApi, routeApi } from '../api/handlers';
import { isConfigured, login, logoutCookie, PUBLIC_PATHS, verifySession } from '../auth/session';
import { parseTrackingConfig, type TrackingConfig } from '../config/tracking';
import { CrawlEngine } from '../crawler/crawlEngine';
import { DmxClient } from '../crawler/dmx/client';
import { SqlStore } from '../db/sqlStore';
import { todayInTimeZone } from '../utils/date';
import { createLogger, type LogLevel } from '../utils/logger';
import type { D1Database, ExecutionContext, Fetcher, ScheduledController } from './cfTypes';
import { D1Driver } from './d1Driver';

/**
 * Bản chạy trên Cloudflare Workers (miễn phí):
 *  - fetch:     web (file tĩnh trong public/) + API dùng chung src/api/handlers.ts, có màn hình đăng nhập (src/auth/session.ts)
 *  - scheduled: cron lấy dữ liệu theo từng bước (mỗi lần 1 trang, do giới hạn 10 ms CPU của gói free)
 *
 * Cấu hình: wrangler.jsonc. Mật khẩu: `npx wrangler secret put AUTH_USER` / `AUTH_PASSWORD`.
 */

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_USER?: string;
  AUTH_PASSWORD?: string;
  TIMEZONE?: string;
  DMX_PROVINCE_ID?: string;
  LOG_LEVEL?: string;
}

/**
 * Cron chạy mỗi phút từ 8:17 đến 8:59 sáng giờ VN (01:17–01:59 UTC): bắt đầu lượt cào hằng ngày + xử lý từng trang.
 * Đổi giờ: sửa cả hằng số này và "triggers.crons" trong wrangler.jsonc (2 chỗ phải giống hệt nhau).
 */
export const DAILY_CRON = '17-59 1 * * *';

let cachedTracking: TrackingConfig | null = null;
const tracking = () => (cachedTracking ??= parseTrackingConfig(trackingJson));

function createServices(env: Env) {
  const timeZone = env.TIMEZONE || 'Asia/Ho_Chi_Minh';
  const logger = createLogger((env.LOG_LEVEL as LogLevel) || 'info');
  const store = new SqlStore(new D1Driver(env.DB));
  const client = new DmxClient({
    provinceId: Number(env.DMX_PROVINCE_ID || 1027),
    pageSize: 50,
    delayMs: 0, // các bước đã cách nhau tự nhiên (mỗi phút / mỗi lần trình duyệt gọi)
    timeoutMs: 20000,
    maxRetries: 0, // thử lại do CrawlEngine đảm nhiệm (job lỗi được chạy lại ở bước sau)
    logger: logger.child('dmx'),
  });
  const engine = new CrawlEngine({ store, client, tracking: tracking(), timeZone, logger: logger.child('crawl') });
  return { store, engine, logger, timeZone, api: createApi({ store, engine, client, tracking: tracking() }) };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return Response.json({ ok: true });

    // ----- Đăng nhập (màn hình /login, phiên hết hạn lúc 0h mỗi ngày) -----
    const auth = { user: env.AUTH_USER, password: env.AUTH_PASSWORD, timeZone: env.TIMEZONE || 'Asia/Ho_Chi_Minh' };
    if (url.pathname === '/api/login' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { user?: unknown; password?: unknown };
      const result = await login(auth, String(body.user ?? ''), String(body.password ?? ''), { secure: true });
      return result.ok
        ? Response.json({ ok: true, expiresAt: result.expiresAt }, { headers: { 'Set-Cookie': result.setCookie } })
        : Response.json({ error: result.error }, { status: result.status });
    }
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      return Response.json({ ok: true }, { headers: { 'Set-Cookie': logoutCookie(true) } });
    }
    if (!isConfigured(auth)) {
      return new Response(
        'Chưa cấu hình tài khoản đăng nhập. Chạy: npx wrangler secret put AUTH_USER và npx wrangler secret put AUTH_PASSWORD',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      );
    }
    const loggedIn = await verifySession(auth, request.headers.get('Cookie'));
    if (PUBLIC_PATHS.has(url.pathname)) {
      if (loggedIn && url.pathname.startsWith('/login')) return Response.redirect(new URL('/', url).toString(), 302);
      return env.ASSETS.fetch(request);
    }
    if (!loggedIn) {
      if (url.pathname.startsWith('/api/')) {
        return Response.json({ error: 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.' }, { status: 401 });
      }
      return Response.redirect(new URL('/login', url).toString(), 302);
    }

    if (url.pathname.startsWith('/api/')) {
      const { api, logger } = createServices(env);
      try {
        const result = await routeApi(api, request.method, url.pathname, url.searchParams);
        if (result) return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
      } catch (err) {
        logger.error((err as Error).stack ?? String(err));
        return Response.json({ error: `Lỗi máy chủ: ${(err as Error).message}` }, { status: 500 });
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const { store, engine, logger, timeZone } = createServices(env);
    ctx.waitUntil(
      (async () => {
        if (controller.cron === DAILY_CRON) {
          // Bắt đầu lượt hằng ngày nếu hôm nay chưa có lượt nào thành công / đang chạy
          const today = todayInTimeZone(timeZone, new Date(controller.scheduledTime));
          const runs = await store.recentRuns(10);
          const hasToday = runs.some(
            (r) => r.crawlDate === today && (r.status === 'running' || r.status === 'success' || r.status === 'partial'),
          );
          if (!hasToday) await engine.start('schedule');
        }
        // Mỗi lần cron chạy xử lý 1 trang (nếu có lượt đang chạy)
        if (await store.runningRun()) await engine.step();
      })().catch((err) => logger.error(`Cron lỗi: ${(err as Error).message}`)),
    );
  },
};
