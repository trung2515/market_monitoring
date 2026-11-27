/**
 * Khai báo kiểu tối thiểu cho các API Cloudflare đang dùng (D1, static assets, cron).
 * Tự khai báo thay vì phụ thuộc @cloudflare/workers-types để cả dự án dùng chung 1 tsconfig.
 */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes?: number; last_row_id?: number; [key: string]: unknown };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
