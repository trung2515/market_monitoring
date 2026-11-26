import { randomUUID } from 'node:crypto';
import { jitter, sleep } from '../../utils/async';
import type { Logger } from '../../utils/logger';
import { dmxCategoryResponseSchema, dmxProductSchema, type DmxProduct } from './schema';

export const DMX_CATEGORY_API = 'https://api.dienmayxanh.com/gw/bus-dmx-tmdt/api/Cate/GetproductCateV2';

export interface DmxClientOptions {
  provinceId: number;
  pageSize: number;
  delayMs: number;
  timeoutMs: number;
  maxRetries: number;
  logger: Logger;
  /** Cho phép thay fetch khi test */
  fetchImpl?: typeof fetch;
}

export interface DmxCategoryResult {
  slug: string;
  categoryName: string;
  totalReported: number;
  products: DmxProduct[];
  /** Số sản phẩm bị bỏ qua vì JSON không đúng schema */
  invalidCount: number;
}

/** Lỗi nghiệp vụ do API trả về (vd slug sai) – không retry. */
export class DmxApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = 'DmxApiError';
  }
}

class RetryableError extends Error {}

/** Giới hạn an toàn để không lặp vô hạn nếu API trả dữ liệu lạ. */
const MAX_PAGES = 200;

/**
 * Client gọi API danh mục của Điện Máy Xanh.
 * Chỉ đọc dữ liệu công khai (không đăng nhập), có nghỉ giữa các request và retry có backoff.
 */
export class DmxClient {
  private readonly deviceId = randomUUID();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: DmxClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Lấy toàn bộ sản phẩm của 1 danh mục (tự phân trang). */
  async fetchCategory(slug: string): Promise<DmxCategoryResult> {
    const log = this.opts.logger;
    const seen = new Map<string, DmxProduct>();
    let categoryName = '';
    let totalReported = 0;
    let invalidCount = 0;

    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
      if (pageIndex > 0) await sleep(jitter(this.opts.delayMs));

      const page = await this.fetchPage(slug, pageIndex);
      categoryName = page.categoryName || categoryName;
      totalReported = page.totalReported || totalReported;
      invalidCount += page.invalidCount;

      for (const p of page.products) {
        if (!seen.has(p.productCode)) seen.set(p.productCode, p);
      }
      log.debug(`${slug} trang ${pageIndex}: +${page.products.length} (đã có ${seen.size}/${totalReported})`);

      if (page.rawCount === 0 || page.remaining <= 0) break;
    }

    return { slug, categoryName, totalReported, products: [...seen.values()], invalidCount };
  }

  private async fetchPage(slug: string, pageIndex: number) {
    const body = {
      pageIndex,
      pageSize: this.opts.pageSize,
      provinceId: this.opts.provinceId,
      urlCate: slug,
      cateId: '',
      filters: [],
    };

    const json = await this.postWithRetry(body);
    const parsed = dmxCategoryResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`API ĐMX trả về cấu trúc lạ cho "${slug}" (có thể ĐMX đã đổi API): ${parsed.error.message}`);
    }

    const res = parsed.data;
    if (res.code !== 0) {
      throw new DmxApiError(
        `API ĐMX báo lỗi cho danh mục "${slug}": ${res.message || res.errormessage || 'không rõ'} (code ${res.code})`,
        res.code,
      );
    }

    const rawProducts = res.data?.products ?? [];
    const products: DmxProduct[] = [];
    let invalidCount = 0;
    for (const raw of rawProducts) {
      const p = dmxProductSchema.safeParse(raw);
      if (p.success) products.push(p.data);
      else invalidCount++;
    }
    if (invalidCount > 0) {
      this.opts.logger.warn(`${slug} trang ${pageIndex}: bỏ qua ${invalidCount} sản phẩm sai cấu trúc`);
    }

    return {
      products,
      rawCount: rawProducts.length,
      invalidCount,
      categoryName: res.data?.cateName ?? '',
      totalReported: res.data?.totalProduct ?? 0,
      remaining: res.data?.remainingQuantity ?? 0,
    };
  }

  private async postWithRetry(body: unknown): Promise<unknown> {
    const { maxRetries, delayMs, logger } = this.opts;
    let attempt = 0;

    for (;;) {
      try {
        return await this.post(body);
      } catch (err) {
        const retryable = err instanceof RetryableError || (err instanceof Error && err.name === 'TimeoutError');
        if (!retryable || attempt >= maxRetries) throw err;
        attempt++;
        const wait = Math.max(delayMs, 1000) * 2 ** attempt;
        logger.warn(`Request lỗi (${(err as Error).message}), thử lại lần ${attempt}/${maxRetries} sau ${wait}ms`);
        await sleep(wait);
      }
    }
  }

  private async post(body: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(DMX_CATEGORY_API, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (err) {
      // lỗi mạng / timeout → cho phép retry
      if (err instanceof Error && err.name === 'TimeoutError') throw err;
      throw new RetryableError(`lỗi kết nối: ${(err as Error).message}`);
    }

    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`HTTP ${res.status}`);
    }
    if (!res.ok) {
      throw new Error(`API ĐMX trả về HTTP ${res.status}`);
    }
    return res.json();
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      Origin: 'https://www.dienmayxanh.com',
      Referer: 'https://www.dienmayxanh.com/',
      os: 'WebDMX',
      platform: '1',
      siteid: '2',
      provinceid: String(this.opts.provinceId),
      deviceid: this.deviceId,
    };
  }
}
