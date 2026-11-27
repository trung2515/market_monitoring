import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db/database';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/worker/cfTypes';

/** Giả lập Cloudflare D1 bằng node:sqlite – đủ để chạy thử Worker trên máy. */
export function createFakeD1(): D1Database & { raw: DatabaseSync } {
  const db = openDatabase(':memory:');
  const statement = (sql: string, params: unknown[] = []): D1PreparedStatement & { exec(): D1Result } => ({
    bind: (...values: unknown[]) => statement(sql, values),
    async all<T>() {
      return { results: db.prepare(sql).all(...(params as never[])) as T[], success: true, meta: {} };
    },
    async first<T>() {
      return (db.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
    },
    async run() {
      return this.exec();
    },
    exec() {
      const r = db.prepare(sql).run(...(params as never[]));
      return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    raw: db,
    prepare: (sql: string) => statement(sql),
    async batch(statements: D1PreparedStatement[]) {
      db.exec('BEGIN');
      try {
        const res = statements.map((s) => (s as ReturnType<typeof statement>).exec());
        db.exec('COMMIT');
        return res;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
