import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const booleanString = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  AUTH_USER: z.string().optional(),
  AUTH_PASSWORD: z.string().optional(),

  DB_PATH: z.string().default('data/market.db'),
  TRACKING_CONFIG: z.string().default('config/tracking.json'),
  TIMEZONE: z.string().default('Asia/Ho_Chi_Minh'),

  DMX_PROVINCE_ID: z.coerce.number().int().positive().default(1027),
  DMX_PAGE_SIZE: z.coerce.number().int().min(10).max(100).default(50),
  DMX_REQUEST_DELAY_MS: z.coerce.number().int().min(0).default(2000),
  DMX_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20000),
  DMX_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),

  CRAWL_CRON: z.string().default('25 7 * * *'),
  CRAWL_ON_SCHEDULE: booleanString.default('true'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Đọc .env (nếu có) + biến môi trường, validate & trả về cấu hình đã có kiểu. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const envFile = path.resolve(process.cwd(), '.env');
  if (source === process.env && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  // Biến rỗng ("AUTH_USER=") coi như không khai báo
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Cấu hình môi trường (.env) không hợp lệ:\n${issues}`);
  }
  return parsed.data;
}
