/* GLUE Cloud's shared collections, the real code (cloud/src/shared.ts) on an in-memory database: for the
   sync engine's unit tests, and as the end-to-end tests' GLUE Cloud (answer(): its routes, as api.ts has
   them). One account; each device is who's asking. */
import { d1 } from './d1';
import * as shared from '../cloud/src/shared';
import * as profiles from '../cloud/src/profiles';
import { SyncError } from '../cloud/src/limits';
import type { Env } from '../cloud/src/api';
import type { Access } from '../cloud/src/crypto';
import { applyChange, packText, sha256, unpackText, type FileChange, type SharedCloud } from '../src/store/shared/engine';

export class SharedCloudServer {
  readonly env: Env;
  /** Told of each push (the signaling room's broadcast). */
  onPush: ((m: { type: 'shared'; collection: string; seq: number; from: string; gone?: boolean } | { type: 'profiles'; from: string }) => void) | null = null;
  constructor(readonly user = 'u1') {
    this.env = { DB: d1() } as unknown as Env;
  }
  private ready: Promise<void> | null = null;
  private init() {
    return this.ready ??= this.env.DB.prepare('INSERT INTO users (id, email, name, picture, created_at) VALUES (?, ?, ?, NULL, ?)').bind(this.user, 'dj@example.com', 'DJ', Date.now()).run().then(() => {});
  }
  private access(dev: string): Access { return { sub: this.user, dev, exp: 0, iat: 0 }; }
  private notify(cid: string, dev: string) { return async (seq: number) => { this.onPush?.({ type: 'shared', collection: cid, seq, from: dev }); }; }

  /** A collection that's there already, as files (a snapshot complete at revision `seq`; each file at `seq`,
      or at its own revision). */
  async seed(cid: string, name: string, files: Record<string, string | { text: string; rev: number }>, by = 'desk', seq = 1) {
    await this.init();
    await shared.create(this.env, this.access(by), { id: cid, name }, Date.now(), () => cid);
    for (const [path, f] of Object.entries(files)) {
      const text = typeof f === 'string' ? f : f.text, rev = typeof f === 'string' ? seq : f.rev;
      await this.env.DB.prepare('INSERT INTO shared_files (user_id, collection_id, path, rev, hash, size, data, deleted_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)')
        .bind(this.user, cid, path, rev, await sha256(text), text.length, await packText(text), by, Date.now()).run();
    }
    await this.env.DB.prepare('UPDATE shared_collections SET seq = ?, floor = ? WHERE user_id = ? AND id = ?').bind(seq, seq, this.user, cid).run();
  }

  /** The engine's view of it, as `dev` (made on first use, as a device's POST /v1/shared does). */
  cloudFor(cid: string, dev: string): SharedCloud {
    const a = this.access(dev), env = this.env, now = () => Date.now();
    let made: Promise<unknown> | null = null;
    const ready = async () => { await this.init(); await (made ??= shared.create(env, a, { id: cid }, now(), () => cid)); };
    return {
      changes: async since => { await ready(); return shared.changes(env, a, cid, since); },
      bundle: async paths => { await ready(); return shared.bundle(env, a, cid, { paths }); },
      log: async since => { await ready(); return shared.log(env, a, cid, since); },
      append: async (b, paths, data) => { await ready(); return shared.append(env, a, cid, b + '\t' + JSON.stringify(paths) + '\n' + data, now(), this.notify(cid, dev)); },
      touched: async to => { await ready(); return shared.touched(env, a, cid, to); },
      checkpoint: async (at, body, done) => { await ready(); return shared.checkpoint(env, a, cid, at, body, done, now()); },
    };
  }

  /** A request to GLUE Cloud's /v1/shared routes from `dev`: the answer, or null (not one of them). */
  async answer(method: string, url: URL, body: string | null, dev: string): Promise<{ status: number; body: string; type: string } | null> {
    const p = url.pathname, a = this.access(dev), env = this.env, now = Date.now();
    const json = (v: unknown, status = 200) => ({ status, body: JSON.stringify(v), type: 'application/json' });
    // The account's profiles, its artist aliases (ADR 0113), the real code too.
    if (p === '/v1/profiles' || p.startsWith('/v1/profiles/')) {
      await this.init();
      const told = (v: unknown) => { if (method !== 'GET') this.onPush?.({ type: 'profiles', from: dev }); return json(v); };
      const pm = /^\/v1\/profiles\/([\w-]+)$/.exec(p);
      try {
        if (method === 'GET' && p === '/v1/profiles') return json(await profiles.list(env, a));
        if (method === 'POST' && p === '/v1/profiles') return told(await profiles.create(env, a, JSON.parse(body || '{}'), now, () => crypto.randomUUID().slice(0, 16)));
        if (method === 'POST' && p === '/v1/profiles/seed') return told(await profiles.seed(env, a, JSON.parse(body || '{}'), now));
        if (method === 'PATCH' && pm) return told(await profiles.update(env, a, pm[1], JSON.parse(body || '{}'), now));
        if (method === 'DELETE' && pm) return told(await profiles.remove(env, a, pm[1], now));
        return json({ error: 'not found' }, 404);
      } catch (e) { if (e instanceof SyncError) return json({ error: e.message }, e.status); throw e; }
    }
    if (!p.startsWith('/v1/shared')) return null;
    await this.init();
    try {
      if (p === '/v1/shared' && method === 'GET') return json(await shared.list(env, a));
      if (p === '/v1/shared' && method === 'POST') return json(await shared.create(env, a, JSON.parse(body || '{}'), now, () => crypto.randomUUID()));
      const m = /^\/v1\/shared\/([\w-]+)(\/[a-z]+)?$/.exec(p);
      if (!m) return null;
      const cid = m[1], q = url.searchParams;
      switch (method + ' ' + (m[2] ?? '')) {
        case 'GET /changes': return json(await shared.changes(env, a, cid, Number(q.get('since') ?? 0)));
        case 'POST /bundle': return { status: 200, body: await shared.bundle(env, a, cid, JSON.parse(body || '{}')), type: 'text/plain' };
        case 'GET /log': return json(await shared.log(env, a, cid, Number(q.get('since') ?? 0)));
        case 'POST /append': return json(await shared.append(env, a, cid, body ?? '', now, this.notify(cid, dev)));
        case 'GET /touched': return json(await shared.touched(env, a, cid, Number(q.get('to') ?? 0)));
        case 'POST /checkpoint': return json(await shared.checkpoint(env, a, cid, Number(q.get('at')), body ?? '', q.get('done') === '1', now));
        case 'POST /leave': return json(await shared.leave(env, a, cid, JSON.parse(body || '{}'), now));
        case 'GET /bin': return json(await shared.bin(env, a, cid, now));
        case 'POST /push': shared.oldPush(); break;
        case 'POST /stats': return json(await shared.stats(env, a, cid, JSON.parse(body || '{}'), now));
        case 'PATCH ': return json(await shared.rename(env, a, cid, JSON.parse(body || '{}')));
        case 'DELETE ': return json(await shared.remove(env, a, cid, now, q.get('cloudOnly') === '1', async () => this.onPush?.({ type: 'shared', collection: cid, seq: -1, from: dev, gone: true })));
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      if (e instanceof SyncError) return json({ error: e.message }, e.status);
      throw e;
    }
  }

  /** The account's aliases, as a first computer would have seeded them. */
  async seedProfiles(list: { id: string; name: string; color?: string }[]) {
    await this.init();
    return profiles.seed(this.env, this.access('seed'), { profiles: list }, Date.now());
  }
  /** The account's collections' ids. */
  async collections() {
    await this.init();
    return (await this.env.DB.prepare('SELECT id FROM shared_collections WHERE user_id = ? ORDER BY created_at').bind(this.user).all<{ id: string }>()).results.map(r => r.id);
  }
  /** Every file the collection has in GLUE Cloud (in the snapshot, or changed by the log). */
  async paths(cid: string) {
    const out = new Set<string>();
    for (const r of (await this.env.DB.prepare('SELECT path FROM shared_files WHERE user_id = ? AND collection_id = ? AND deleted_at IS NULL').bind(this.user, cid).all<{ path: string }>()).results) out.add(r.path);
    for (const r of (await this.env.DB.prepare('SELECT paths FROM shared_log WHERE user_id = ? AND collection_id = ?').bind(this.user, cid).all<{ paths: string }>()).results) for (const p of JSON.parse(r.paths) as string[]) out.add(p);
    return out;
  }
  /** A file as GLUE Cloud has it now: the snapshot's, with the log's changes (undefined: none). */
  async current(cid: string, path: string): Promise<string | undefined> {
    const f = await this.env.DB.prepare('SELECT data FROM shared_files WHERE user_id = ? AND collection_id = ? AND path = ? AND deleted_at IS NULL').bind(this.user, cid, path).first<{ data: string }>();
    let text = f ? await unpackText(f.data) : undefined;
    for (const e of (await this.env.DB.prepare('SELECT data FROM shared_log WHERE user_id = ? AND collection_id = ? ORDER BY rev').bind(this.user, cid).all<{ data: string }>()).results) {
      const c = (JSON.parse(await unpackText(e.data)) as { f: Record<string, FileChange> }).f[path];
      if (c) text = applyChange(text, c);
    }
    return text;
  }
  /** The log's entries and the snapshot's files, now. */
  async counts(cid: string) {
    const n = async (sql: string) => (await this.env.DB.prepare(sql).bind(this.user, cid).first<{ n: number }>())?.n ?? 0;
    return {
      log: await n('SELECT COUNT(*) AS n FROM shared_log WHERE user_id = ? AND collection_id = ?'),
      files: await n('SELECT COUNT(*) AS n FROM shared_files WHERE user_id = ? AND collection_id = ?'),
      floor: await n('SELECT floor AS n FROM shared_collections WHERE user_id = ? AND id = ?'),
      seq: await n('SELECT seq AS n FROM shared_collections WHERE user_id = ? AND id = ?'),
    };
  }
}
