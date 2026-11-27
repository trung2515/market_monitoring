import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { withStoredCategories } from '../config/categories';
import { createContext } from '../container';
import { buildWorkbook } from '../report/excel/workbook';
import type { PeriodType } from '../report/period';
import { buildReportData, reportFileName } from '../report/reportBuilder';
import { todayInTimeZone } from '../utils/date';

/**
 * Xuất Excel từ dòng lệnh, vd:
 *   npm run export -- --period week
 *   npm run export -- --period month --date 2026-11-01
 *   npm run export -- --period custom --from 2026-11-01 --to 2026-11-15 --brands Elmich,Sunhouse
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      period: { type: 'string', default: 'week' },
      date: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      categories: { type: 'string' },
      brands: { type: 'string' },
      out: { type: 'string', default: 'reports' },
    },
  });

  if (!['week', 'month', 'custom'].includes(values.period ?? '')) {
    throw new Error('--period phải là week | month | custom');
  }
  const list = (v?: string) =>
    v
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const ctx = createContext();
  try {
    const data = await buildReportData(
      ctx.store,
      await withStoredCategories(ctx.store, ctx.tracking),
      {
        type: values.period as PeriodType,
        date: values.date,
        from: values.from,
        to: values.to,
        filter: { categories: list(values.categories), brands: list(values.brands) },
      },
      todayInTimeZone(ctx.env.TIMEZONE),
    );
    const workbook = buildWorkbook(data);
    const fileName = reportFileName(data);
    const outDir = path.resolve(values.out ?? 'reports');
    mkdirSync(outDir, { recursive: true });
    const filePath = path.join(outDir, fileName);
    await workbook.xlsx.writeFile(filePath);
    console.log(`Đã xuất: ${filePath} (${data.current.length} SKU, ${data.priceChanges.length} đổi giá)`);
  } finally {
    ctx.close();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
