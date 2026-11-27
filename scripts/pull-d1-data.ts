/**
 * Kéo dữ liệu đã cào trên Cloudflare D1 về máy, gộp vào data/market.db (dùng khi muốn chạy local có đủ các ngày).
 *   npm run cf:pull-data
 * - Chỉ lấy bảng products và price_snapshots (lịch sử giá). Nhật ký lượt cào trên Cloudflare không kéo về.
 * - Dùng INSERT OR REPLACE: ngày nào có ở cả 2 nơi thì lấy bản trên Cloudflare; dữ liệu chỉ có ở máy vẫn giữ nguyên.
 * Cần đã đăng nhập wrangler (`npx wrangler login`).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../src/config/env';
import { openDatabase } from '../src/db/database';

const env = loadEnv();
const exportFile = path.resolve('data/d1-export.sql');
mkdirSync(path.dirname(exportFile), { recursive: true });

// --file <đường dẫn>: dùng file export có sẵn, không tải lại (để thử)
const fileArg = process.argv.indexOf('--file');
const useExisting = fileArg > -1 ? path.resolve(process.argv[fileArg + 1] ?? '') : null;

if (!useExisting) download();

function download() {
  console.log('Đang tải dữ liệu từ Cloudflare D1…');
  const result = spawnSync(
  'npx',
  [
    'wrangler',
    'd1',
    'export',
    'elmich-monitor',
    '--remote',
    '--no-schema',
    '--table',
    'products',
    '--table',
    'price_snapshots',
    '--output',
    exportFile,
  ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) {
    console.error('✗ Không tải được dữ liệu từ D1 (đã chạy "npx wrangler login" chưa?)');
    process.exit(1);
  }
}

// File export dùng INSERT INTO → đổi sang INSERT OR REPLACE để gộp với dữ liệu sẵn có trên máy
const sql = readFileSync(useExisting ?? exportFile, 'utf8').replace(/^INSERT INTO /gm, 'INSERT OR REPLACE INTO ');
const db = openDatabase(env.DB_PATH);
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const before = { products: count('products'), snapshots: count('price_snapshots') };

db.exec('BEGIN');
try {
  // Giữ ngày thấy lần đầu / lần cuối rộng nhất giữa 2 nơi (không để bản Cloudflare ghi đè làm SP cũ thành "mới")
  db.exec('CREATE TEMP TABLE seen AS SELECT product_code, first_seen_date, last_seen_date FROM products');
  db.exec(sql);
  db.exec(`
    UPDATE products SET
      first_seen_date = MIN(first_seen_date, (SELECT s.first_seen_date FROM seen s WHERE s.product_code = products.product_code)),
      last_seen_date  = MAX(last_seen_date,  (SELECT s.last_seen_date  FROM seen s WHERE s.product_code = products.product_code))
    WHERE product_code IN (SELECT product_code FROM seen)`);
  db.exec('DROP TABLE seen');
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

const dates = db.prepare('SELECT COUNT(DISTINCT crawl_date) AS n FROM price_snapshots').get() as { n: number };
console.log(
  `✓ Đã gộp vào ${env.DB_PATH}: sản phẩm ${before.products} → ${count('products')}, ` +
    `giá theo ngày ${before.snapshots} → ${count('price_snapshots')} (${dates.n} ngày có dữ liệu)`,
);
db.close();
