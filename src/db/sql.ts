/**
 * Lớp trừu tượng tối thiểu cho SQLite, để CÙNG MỘT bộ câu SQL (SqlStore) chạy được trên:
 *  - Node (`node:sqlite`, file data/market.db)  → NodeSqliteDriver (file này)
 *  - Cloudflare D1                              → D1Driver (src/worker/d1Driver.ts)
 */

export type SqlValue = string | number | null;
export type Row = Record<string, unknown>;

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}

export interface SqlDriver {
  all(sql: string, params?: SqlValue[]): Promise<Row[]>;
  first(sql: string, params?: SqlValue[]): Promise<Row | null>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number; lastRowId: number | null }>;
  /** Chạy nhiều câu lệnh trong 1 transaction (tất cả thành công hoặc không câu nào). */
  batch(statements: SqlStatement[]): Promise<void>;
}

/** Driver cho `node:sqlite` (đồng bộ) – bọc lại thành Promise để dùng chung interface. */
export class NodeSqliteDriver implements SqlDriver {
  constructor(private readonly db: import('node:sqlite').DatabaseSync) {}

  async all(sql: string, params: SqlValue[] = []): Promise<Row[]> {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  async first(sql: string, params: SqlValue[] = []): Promise<Row | null> {
    return (this.db.prepare(sql).get(...params) as Row | undefined) ?? null;
  }

  async run(sql: string, params: SqlValue[] = []) {
    const res = this.db.prepare(sql).run(...params);
    return { changes: Number(res.changes), lastRowId: res.lastInsertRowid == null ? null : Number(res.lastInsertRowid) };
  }

  async batch(statements: SqlStatement[]): Promise<void> {
    this.db.exec('BEGIN');
    try {
      for (const s of statements) this.db.prepare(s.sql).run(...(s.params ?? []));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
