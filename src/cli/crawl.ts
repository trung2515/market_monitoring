import { createContext } from '../container';

/** Chạy 1 lượt cào ngay từ dòng lệnh: `npm run crawl` */
async function main(): Promise<void> {
  const ctx = createContext();
  try {
    const summary = await ctx.crawlService.run('cli');
    console.table(summary.categories.map((c) => ({ 'Danh mục': c.name, 'Số SP': c.productCount, Lỗi: c.error ?? '' })));
    summary.warnings.forEach((w) => console.warn(`⚠ ${w}`));
    process.exitCode = summary.status === 'failed' ? 1 : 0;
  } finally {
    ctx.close();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
