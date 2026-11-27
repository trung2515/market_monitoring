import type { RequestHandler } from 'express';
import { DmxClient } from '../crawler/dmx/client';
import type { Logger } from '../utils/logger';

/**
 * Trang kiểm tra: máy chủ hiện tại có gọi được API Điện Máy Xanh không.
 * Dùng khi thử deploy lên một nhà cung cấp mới (ĐMX chặn một số IP nước ngoài).
 * Không trả về dữ liệu nhạy cảm nên không cần đăng nhập.
 */
export function dmxDiagnostics(provinceId: number, logger: Logger): RequestHandler {
  return async (_req, res) => {
    const started = Date.now();
    const serverIp = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(5000) })
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .then((j) => ({ ip: j.ip, city: j.city, country: j.country, org: j.org }))
      .catch(() => null);

    try {
      const client = new DmxClient({ provinceId, pageSize: 50, delayMs: 500, timeoutMs: 15000, maxRetries: 0, logger });
      const result = await client.fetchCategory('chao-chong-dinh');
      res.json({
        ok: true,
        message: `OK – lấy được ${result.products.length}/${result.totalReported} sản phẩm danh mục "${result.categoryName}"`,
        firstProduct: result.products[0]?.name ?? null,
        elapsedMs: Date.now() - started,
        server: serverIp,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        message: 'KHÔNG gọi được API ĐMX từ máy chủ này (có thể bị chặn IP)',
        error: (err as Error).message,
        elapsedMs: Date.now() - started,
        server: serverIp,
      });
    }
  };
}
