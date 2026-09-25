/* GLUE Home pairing against the real API handler and SQLite (no network): the website makes a code,
   GLUE Home claims it, saves its credential, and signs in with it. */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { access, loadConfig, pair } from '../home/src/home.ts';
import { handle, type Env } from '../cloud/src/api';
import { signAccess } from '../cloud/src/crypto';
import { DatabaseSync } from 'node:sqlite';

function env(): Env {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of ['0001_init.sql', '0002_sync.sql', '0003_tiers_passwords.sql']) db.exec(readFileSync(new URL('../cloud/migrations/' + m, import.meta.url), 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): ReturnType<Env['DB']['prepare']> => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T,>() => (db.prepare(sql).get(...(args as never[])) as T) ?? null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
  });
  return { DB: { prepare: s => stmt(s), batch: async s => Promise.all(s.map(x => x.run())) }, SESSION_KEY: 'k'.repeat(32), GOOGLE_CLIENT_ID: 'x', ALLOWED_ORIGINS: '' };
}

describe('GLUE Home pairing', () => {
  it('claims a code, keeps a private credential and signs in with it', async () => {
    const e = env(), now = Date.now();
    // A signed-in browser (made directly: Google sign-in has its own tests).
    await e.DB.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind('u1', 'dj@example.com', 'DJ', now).run();
    await e.DB.prepare("INSERT INTO devices (id, user_id, kind, name, created_at) VALUES ('b1', 'u1', 'browser', 'Edge', ?)").bind(now).run();
    const browser = await signAccess({ sub: 'u1', dev: 'b1' }, e.SESSION_KEY, now);
    const f = ((url: string, init?: RequestInit) => handle(new Request(url, init), e, { now: () => Date.now(), googleKeys: async () => ({ keys: [] }) })) as typeof fetch;
    const code = (await (await f('https://api/v1/pairing', { method: 'POST', headers: { Authorization: 'Bearer ' + browser } })).json() as { code: string }).code;

    const path = join(mkdtempSync(join(tmpdir(), 'glue-home-')), 'config.json');
    const c = await pair(code, { name: 'Studio PC', api: 'https://api', fetch: f, path });
    expect(c).toMatchObject({ name: 'Studio PC', user: { email: 'dj@example.com' } });
    expect(loadConfig(path)?.deviceId).toBe(c.deviceId);
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o077).toBe(0);   // readable by you only
    expect(await access(c, f)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    await expect(pair(code, { api: 'https://api', fetch: f, path })).rejects.toThrow(/isn’t valid|just used/);
  });
});
