/**
 * Sinh file SQL migration cho Cloudflare D1 từ src/db/migrations.ts (nguồn duy nhất của schema).
 *   npm run cf:migrations   → ghi cloudflare/migrations/000N_<name>.sql
 * Sau đó: npm run cf:migrate  (wrangler áp dụng các file chưa chạy lên D1)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { migrations } from '../src/db/migrations';

const dir = path.resolve(__dirname, '../cloudflare/migrations');
mkdirSync(dir, { recursive: true });
for (const m of migrations) {
  const file = path.join(dir, `${String(m.id).padStart(4, '0')}_${m.name}.sql`);
  const body = m.sql
    .split('\n')
    .map((l) => l.replace(/^ {6}/, ''))
    .join('\n')
    .trim();
  writeFileSync(file, `-- Sinh tự động từ src/db/migrations.ts (migration ${m.id}). Không sửa tay.\n${body}\n`);
  console.log('✓', path.relative(process.cwd(), file));
}
