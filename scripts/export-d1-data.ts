/**
 * Xuất dữ liệu đã cào trên máy (data/market.db) thành file SQL để nạp lên Cloudflare D1.
 *   npm run cf:export-data   → data/d1-import.sql
 *   npm run cf:import-data   → nạp file lên D1 (cần đã đăng nhập wrangler)
 * Dùng INSERT OR REPLACE nên chạy lại nhiều lần không bị trùng.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadEnv } from '../src/config/env';

const env = loadEnv();
const db = new DatabaseSync(path.resolve(env.DB_PATH), { readOnly: true });

const literal = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const lines: string[] = ['-- Dữ liệu xuất từ ' + env.DB_PATH + ' lúc ' + new Date().toISOString()];
for (const table of ['products', 'price_snapshots']) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  for (const row of rows) {
    const cols = Object.keys(row);
    lines.push(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => literal(row[c])).join(', ')});`);
  }
  console.log(`✓ ${table}: ${rows.length} dòng`);
}
const out = path.resolve('data/d1-import.sql');
writeFileSync(out, lines.join('\n') + '\n');
console.log(`Đã ghi ${out}. Tiếp theo chạy: npm run cf:import-data`);
