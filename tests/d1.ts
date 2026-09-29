/* The D1 API over node:sqlite, with GLUE Cloud's real migrations: for the cloud's tests, and for the
   end-to-end tests' stand-in of the shared collection (e2e/glueCloud.ts). */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { DB, Stmt } from '../cloud/src/api';

export function d1(): DB {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const dir = new URL('../cloud/migrations/', import.meta.url);
  for (const m of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(m, dir), 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): Stmt => ({
    bind: (...v) => stmt(sql, v),
    first: async <T,>() => (db.prepare(sql).get(...(args as never[])) as T) ?? null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
  });
  return { prepare: sql => stmt(sql), batch: async s => { db.exec('BEGIN'); try { const r = []; for (const x of s) r.push(await x.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
}
