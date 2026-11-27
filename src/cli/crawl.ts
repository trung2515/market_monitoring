import { createContext } from '../container';

/** Chạy 1 lượt cào ngay từ dòng lệnh: `npm run crawl` */
async function main(): Promise<void> {
  const ctx = createContext();
  try {
    const run = await ctx.engine.runToCompletion('cli', ctx.env.DMX_REQUEST_DELAY_MS);
    const results = await ctx.store.categoryResults(run.id);
    console.table(results.map((c) => ({ 'Danh mục': c.categoryName, 'Số SP': c.productCount, Lỗi: c.error ?? '' })));
    run.warnings.forEach((w) => console.warn(`⚠ ${w}`));
    console.log(`Kết quả: ${run.status}, ${run.productCount} sản phẩm (ngày ${run.crawlDate})`);
    process.exitCode = run.status === 'failed' ? 1 : 0;
  } finally {
    ctx.close();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
