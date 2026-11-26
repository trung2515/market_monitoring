import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Basic Auth đơn giản – đủ cho công cụ nội bộ 1–vài người dùng.
 * Khi deploy ra Internet nhớ chạy sau HTTPS (Nginx/Caddy) để mật khẩu không bị lộ.
 */
export function basicAuth(user: string, password: string): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx >= 0 && safeEqual(decoded.slice(0, idx), user) && safeEqual(decoded.slice(idx + 1), password)) {
        return next();
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Market Monitoring", charset="UTF-8"');
    res.status(401).send('Cần đăng nhập');
  };
}
