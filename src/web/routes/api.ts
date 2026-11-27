import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../container';
import { CrawlAlreadyRunningError } from '../../crawler/crawlService';
import type { ProductFilter } from '../../db/rowMappers';
import { isDateString } from '../../utils/date';

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

const exportQuery = z.object({
  period: z.enum(['week', 'month', 'custom']).default('week'),
  date: dateParam.optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
  categories: csv,
  brands: csv,
});

const productsQuery = z.object({
  categories: csv,
  brands: csv,
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(300),
});

function toFilter(q: { categories: string[]; brands: string[] }): ProductFilter {
  return { categories: q.categories, brands: q.brands };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.query);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => i.message).join('; '));
  return result.data;
}

export function apiRouter(ctx: AppContext): Router {
  const router = Router();
  const { repos, crawlService, reportService, tracking, logger } = ctx;

  /** Trạng thái hệ thống: lần cào gần nhất, số liệu tổng quát. */
  router.get('/status', (_req, res) => {
    res.json({
      running: crawlService.isRunning,
      recentRuns: repos.runs.recent(5),
      firstCrawlDate: repos.snapshots.firstCrawlDate(),
      lastCrawlDate: repos.snapshots.lastCrawlDate(),
      crawlDayCount: repos.snapshots.crawlDates().length,
      productCount: repos.products.count(),
    });
  });

  /** Dữ liệu cho bộ lọc trên giao diện. */
  router.get('/options', (_req, res) => {
    res.json({
      ownBrand: tracking.ownBrand,
      competitorBrands: tracking.competitorBrands,
      categories: tracking.categories.filter((c) => c.enabled).map((c) => ({ slug: c.slug, name: c.name })),
      brands: repos.products.brands(),
    });
  });

  /** Bấm "Cào ngay": chạy nền, trả về ngay. */
  router.post('/crawl', (_req, res) => {
    if (crawlService.isRunning) throw new HttpError(409, new CrawlAlreadyRunningError().message);
    crawlService.run('manual').catch((err: Error) => logger.error(`Cào thủ công thất bại: ${err.message}`));
    res.status(202).json({ message: 'Đã bắt đầu cào dữ liệu. Có thể mất vài phút.' });
  });

  /** Xuất Excel. */
  router.get('/export', async (req, res) => {
    const q = parse(exportQuery, req);
    const { workbook, fileName } = reportService.buildExcel({
      type: q.period,
      date: q.date,
      from: q.from,
      to: q.to,
      filter: toFilter(q),
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    await workbook.xlsx.write(res);
    res.end();
  });

  /** Xem nhanh bảng giá mới nhất trên web (không cần tải Excel). */
  router.get('/products', (req, res) => {
    const q = parse(productsQuery, req);
    const date = repos.snapshots.lastCrawlDate();
    if (!date) return void res.json({ date: null, items: [] });

    const products = new Map(repos.products.findAll(toFilter(q)).map((p) => [p.productCode, p]));
    const keyword = q.q?.trim().toLowerCase();
    const items = repos.snapshots
      .findBetween(date, date, toFilter(q))
      .flatMap((s) => {
        const p = products.get(s.productCode);
        if (!p) return [];
        if (keyword && !`${p.name} ${p.modelCode}`.toLowerCase().includes(keyword)) return [];
        return [{ ...p, ...s }];
      })
      .sort(
        (a, b) =>
          a.categoryName.localeCompare(b.categoryName, 'vi') ||
          (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, q.limit);

    res.json({ date, items });
  });

  return router;
}

export { HttpError };
