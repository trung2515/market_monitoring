import { z } from 'zod';
import { parseCategorySlug, withStoredCategories } from '../config/categories';
import type { TrackingConfig } from '../config/tracking';
import type { CrawlEngine } from '../crawler/crawlEngine';
import type { DmxClient } from '../crawler/dmx/client';
import type { ProductFilter } from '../db/rowMappers';
import type { SqlStore } from '../db/sqlStore';
import type { CrawlTrigger } from '../domain/types';
import { isDateString } from '../utils/date';

/**
 * Toàn bộ API của web, KHÔNG phụ thuộc framework: dùng chung cho Express (Node) và Cloudflare Worker.
 * Mỗi handler nhận query (URLSearchParams) và trả về object JSON; lỗi đầu vào ném HttpError.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiDeps {
  store: SqlStore;
  engine: CrawlEngine;
  /** Dùng để kiểm tra link danh mục khi thêm mới */
  client: DmxClient;
  tracking: TrackingConfig;
}

const dateParam = z.string().refine(isDateString, 'Ngày phải có dạng YYYY-MM-DD');
const csv = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );

const filterQuery = z.object({ categories: csv, brands: csv });
const productsQuery = filterQuery.extend({
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});
const rangeQuery = z.object({ from: dateParam, to: dateParam });
const dateQuery = z.object({ date: dateParam });
const slugQuery = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug không hợp lệ') });
const addCategoryQuery = z.object({ url: z.string().min(1, 'Hãy dán link danh mục').max(300) });
const updateCategoryQuery = slugQuery.extend({
  enabled: z.enum(['0', '1']).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

function parse<T extends z.ZodTypeAny>(schema: T, query: URLSearchParams): z.infer<T> {
  const result = schema.safeParse(Object.fromEntries(query));
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => i.message).join('; '));
  return result.data;
}

const toFilter = (q: { categories: string[]; brands: string[] }): ProductFilter => ({
  categories: q.categories,
  brands: q.brands,
});

/** Bỏ các trường null để giảm dung lượng JSON gửi về trình duyệt (phía client coi thiếu = null). */
function compact<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined) out[k] = v;
  return out as Partial<T>;
}

export function createApi({ store, engine, client, tracking: baseTracking }: ApiDeps) {
  const tracking = () => withStoredCategories(store, baseTracking);
  return {
    /** Trạng thái: lần cào gần nhất, tiến độ lượt đang chạy, số liệu tổng quát. */
    async status() {
      const [running, recentRuns, firstCrawlDate, lastCrawlDate, crawlDates, productCount] = await Promise.all([
        store.runningRun(),
        store.recentRuns(5),
        store.firstCrawlDate(),
        store.lastCrawlDate(),
        store.crawlDates(),
        store.productCount(),
      ]);
      return {
        running: Boolean(running),
        progress: running ? await engine.progress(running) : null,
        recentRuns,
        firstCrawlDate,
        lastCrawlDate,
        crawlDayCount: crawlDates.length,
        productCount,
      };
    },

    /** Dữ liệu cho bộ lọc + cấu hình báo cáo (trình duyệt cần để tự tạo file Excel). */
    async options() {
      const [config, brands] = await Promise.all([tracking(), store.brands()]);
      return {
        ownBrand: config.ownBrand,
        competitorBrands: config.competitorBrands,
        categories: config.categories.map((c) => ({ slug: c.slug, name: c.name, enabled: c.enabled })),
        brands,
        tracking: config,
      };
    },

    // ----- Danh mục theo dõi -----

    async categories() {
      const [{ categories: list }, stats] = await Promise.all([tracking(), store.categoryStats()]);
      return {
        categories: list.map((c) => ({
          ...c,
          productCount: stats.get(c.slug)?.productCount ?? 0,
          lastDate: stats.get(c.slug)?.lastDate ?? null,
        })),
      };
    },

    /** Thêm danh mục từ link ĐMX: gọi thử ĐMX để chắc link đúng và lấy tên danh mục. */
    async addCategory(query: URLSearchParams) {
      await tracking(); // nạp danh sách ban đầu nếu chưa có
      const { url } = parse(addCategoryQuery, query);
      const slug = parseCategorySlug(url);
      if (!slug) throw new HttpError(400, 'Link không đúng. Hãy dán link danh mục dạng https://www.dienmayxanh.com/noi-com-dien');
      let page;
      try {
        page = await client.fetchPage(slug, 0);
      } catch (err) {
        throw new HttpError(400, `Không tìm thấy danh mục "${slug}" trên Điện Máy Xanh (${(err as Error).message})`);
      }
      if (page.rawCount === 0) throw new HttpError(400, `Danh mục "${slug}" không có sản phẩm nào trên Điện Máy Xanh`);
      const name = page.categoryName || slug;
      await store.addCategory(slug, name);
      return { slug, name, totalProducts: page.totalReported };
    },

    /** Ngừng / theo dõi lại (enabled=0|1) hoặc đổi tên hiển thị. */
    async updateCategory(query: URLSearchParams) {
      const q = parse(updateCategoryQuery, query);
      const ok = await store.updateCategory(q.slug, {
        enabled: q.enabled === undefined ? undefined : q.enabled === '1',
        name: q.name,
      });
      if (!ok) throw new HttpError(404, 'Không tìm thấy danh mục');
      return { ok: true };
    },

    /** Chỉ xoá được danh mục CHƯA có dữ liệu (thêm nhầm). Đã có dữ liệu thì dùng "Ngừng theo dõi". */
    async deleteCategory(query: URLSearchParams) {
      const { slug } = parse(slugQuery, query);
      const stats = await store.categoryStats();
      if ((stats.get(slug)?.productCount ?? 0) > 0) {
        throw new HttpError(409, 'Danh mục đã có dữ liệu nên không xoá được. Hãy bấm "Ngừng theo dõi" để giữ lại lịch sử.');
      }
      if (!(await store.deleteCategory(slug))) throw new HttpError(404, 'Không tìm thấy danh mục');
      return { ok: true };
    },

    /** Bảng giá mới nhất (bảng xem nhanh trên web). */
    async products(query: URLSearchParams) {
      const q = parse(productsQuery, query);
      return store.latestPrices({ filter: toFilter(q), keyword: q.q?.trim() || undefined, limit: q.limit });
    },

    // ----- Dữ liệu thô cho báo cáo (trình duyệt tự phân tích & tạo Excel) -----

    async reportDates(query: URLSearchParams) {
      const { from, to } = parse(rangeQuery, query);
      const [dates, baselineDate, firstCrawlDate] = await Promise.all([
        store.crawlDates(from, to),
        store.latestDateBefore(from),
        store.firstCrawlDate(),
      ]);
      return { dates, baselineDate, firstCrawlDate };
    },

    async reportProducts() {
      return { products: (await store.products()).map(compact) };
    },

    /** Snapshot của đúng 1 ngày – chia nhỏ để mỗi lần gọi Worker không vượt giới hạn CPU. */
    async reportSnapshots(query: URLSearchParams) {
      const { date } = parse(dateQuery, query);
      return { date, snapshots: (await store.snapshotsBetween(date, date)).map(compact) };
    },

    // ----- Lấy dữ liệu -----

    async crawlStart(trigger: CrawlTrigger) {
      const { run, created } = await engine.start(trigger);
      return {
        message: created ? 'Đã bắt đầu lấy dữ liệu.' : 'Đang có một lượt lấy dữ liệu chạy dở, tiếp tục lượt đó.',
        progress: await engine.progress(run),
      };
    },

    /** Xử lý 1 trang. Trình duyệt gọi lặp lại cho tới khi finished = true. */
    async crawlStep() {
      return engine.step();
    },
  };
}

export type Api = ReturnType<typeof createApi>;

/**
 * Định tuyến dùng chung: method + đường dẫn → handler.
 * Trả về null nếu không khớp route nào (để framework xử lý tiếp, vd trả file tĩnh).
 */
export async function routeApi(
  api: Api,
  method: string,
  pathname: string,
  query: URLSearchParams,
): Promise<{ status: number; body: unknown } | null> {
  const key = `${method.toUpperCase()} ${pathname.replace(/\/+$/, '')}`;
  const routes: Record<string, () => Promise<unknown>> = {
    'GET /api/status': () => api.status(),
    'GET /api/options': () => api.options(),
    'GET /api/products': () => api.products(query),
    'GET /api/report/dates': () => api.reportDates(query),
    'GET /api/report/products': () => api.reportProducts(),
    'GET /api/report/snapshots': () => api.reportSnapshots(query),
    'GET /api/categories': () => api.categories(),
    'POST /api/categories': () => api.addCategory(query),
    'POST /api/categories/update': () => api.updateCategory(query),
    'POST /api/categories/delete': () => api.deleteCategory(query),
    'POST /api/crawl': () => api.crawlStart('manual'),
    'POST /api/crawl/step': () => api.crawlStep(),
  };
  const handler = routes[key];
  if (!handler) {
    return pathname.startsWith('/api/') ? { status: 404, body: { error: 'Không tìm thấy API' } } : null;
  }
  try {
    return { status: 200, body: await handler() };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}
