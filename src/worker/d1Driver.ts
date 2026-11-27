import type { Row, SqlDriver, SqlStatement, SqlValue } from '../db/sql';
import type { D1Database } from './cfTypes';

/** Driver cho Cloudflare D1 – cùng interface với NodeSqliteDriver, nên SqlStore chạy y hệt trên Node. */
export class D1Driver implements SqlDriver {
  constructor(private readonly d1: D1Database) {}

  async all(sql: string, params: SqlValue[] = []): Promise<Row[]> {
    return (await this.d1.prepare(sql).bind(...params).all<Row>()).results;
  }

  async first(sql: string, params: SqlValue[] = []): Promise<Row | null> {
    return this.d1.prepare(sql).bind(...params).first<Row>();
  }

  async run(sql: string, params: SqlValue[] = []) {
    const res = await this.d1.prepare(sql).bind(...params).run();
    return { changes: Number(res.meta.changes ?? 0), lastRowId: res.meta.last_row_id ?? null };
  }

  /** D1 chạy batch trong 1 transaction. */
  async batch(statements: SqlStatement[]): Promise<void> {
    if (statements.length === 0) return;
    await this.d1.batch(statements.map((s) => this.d1.prepare(s.sql).bind(...(s.params ?? []))));
  }
}
