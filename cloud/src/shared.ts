/* The shared collection (ADR 0094): one copy of a collection in GLUE Cloud for all the account's devices.
   Files as the GLUE folder has them (gzip + base64, never opened here: the Worker's 10 ms budget), each
   at the revision of the push that wrote it. Devices pull what changed since their cursor, and push each
   changed file with the revision they based it on: a file that moved on meanwhile is "stale" for them
   to merge (they do the merging, not the Worker). */
import type { Access } from './crypto';
import type { Env } from './api';
import { MAX_BUNDLE, MAX_BUNDLE_PATHS, MAX_BYTES, MAX_FILE, SyncError } from './limits';

const PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+){0,5}$/, ID = /^[\w-]{1,48}$/, HASH = /^[0-9a-f]{64}$/;
const okPath = (p: unknown): p is string => typeof p === 'string' && p.length <= 300 && PATH.test(p) && !p.split('/').includes('..');
/** A push body: at most this many files and characters (D1 rows are at most 2 MB). */
export const MAX_PUSH_FILES = 200, MAX_PUSH_BODY = 1_900_000, MAX_CHANGES = 5000;
const BIN_DAYS = 30, DAY = 864e5;

interface Row { path: string; rev: number; hash: string; size: number; data: string | null; deleted_at: number | null; updated_by: string | null; updated_at: number }

async function own(env: Env, a: Access, cid: string) {
  if (!ID.test(cid)) throw new SyncError(400, 'bad collection');
  const c = await env.DB.prepare('SELECT id, name, seq FROM shared_collections WHERE user_id = ? AND id = ?').bind(a.sub, cid).first<{ id: string; name: string; seq: number }>();
  if (!c) throw new SyncError(404, 'no such shared collection');
  return c;
}

/** The account's shared collections. */
export async function list(env: Env, a: Access) {
  const rows = (await env.DB.prepare('SELECT id, name, seq, stats, created_by, created_at, updated_at FROM shared_collections WHERE user_id = ? ORDER BY updated_at DESC').bind(a.sub).all<{ id: string; name: string; seq: number; stats: string | null; created_by: string | null; created_at: number; updated_at: number }>()).results;
  return { collections: rows.map(r => ({ id: r.id, name: r.name, seq: r.seq, stats: r.stats ? JSON.parse(r.stats) : null, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at })) };
}

/** Make one (a collection's own id keeps its local folder's name). Making it again is fine. */
export async function create(env: Env, a: Access, b: { id?: unknown; name?: unknown }, now: number, randomId: () => string) {
  const id = typeof b.id === 'string' && ID.test(b.id) ? b.id : randomId();
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 80) : 'My collection';
  await env.DB.prepare('INSERT INTO shared_collections (user_id, id, name, seq, created_by, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?) ON CONFLICT (user_id, id) DO NOTHING').bind(a.sub, id, name, a.dev, now, now).run();
  const c = await own(env, a, id);
  return { id: c.id, name: c.name, seq: c.seq };
}

/** What changed since `since` (metadata only): the collection's revision and each changed file. */
export async function changes(env: Env, a: Access, cid: string, since: number) {
  const c = await own(env, a, cid);
  const rows = (await env.DB.prepare('SELECT path, rev, hash, size, deleted_at, updated_by, updated_at FROM shared_files WHERE user_id = ? AND collection_id = ? AND rev > ? ORDER BY rev LIMIT ?').bind(a.sub, cid, Math.max(0, since | 0), MAX_CHANGES + 1).all<Omit<Row, 'data'>>()).results;
  const more = rows.length > MAX_CHANGES, files = rows.slice(0, MAX_CHANGES);
  // A partial answer's cursor is the last revision it has, so the next ask carries on from there.
  return { seq: more ? files[files.length - 1].rev : c.seq, more, files: files.map(r => ({ path: r.path, rev: r.rev, hash: r.hash, size: r.size, deleted: !!r.deleted_at, by: r.updated_by, at: r.updated_at })) };
}

/** Files' contents, many per answer: lines of path \t rev \t hash \t data (deleted files have none). */
export async function bundle(env: Env, a: Access, cid: string, b: { paths?: unknown }): Promise<string> {
  const paths = Array.isArray(b?.paths) ? b.paths : [];
  if (paths.length > MAX_BUNDLE_PATHS || !paths.every(okPath)) throw new SyncError(400, 'bad paths');
  await own(env, a, cid);
  if (!paths.length) return '';
  const rows = (await env.DB.prepare('SELECT path, rev, hash, data FROM shared_files WHERE user_id = ? AND collection_id = ? AND deleted_at IS NULL AND path IN (SELECT value FROM json_each(?))')
    .bind(a.sub, cid, JSON.stringify(paths)).all<{ path: string; rev: number; hash: string; data: string }>()).results;
  const at = new Map((paths as string[]).map((p, i) => [p, i]));
  rows.sort((x, y) => at.get(x.path)! - at.get(y.path)!);
  const out: string[] = [];
  let n = 0;
  for (const r of rows) {
    const len = r.path.length + r.hash.length + r.data.length + 12;
    if (out.length && n + len > MAX_BUNDLE) break;
    out.push(r.path + '\t' + r.rev + '\t' + r.hash + '\t' + r.data); n += len;
  }
  return out.join('\n');
}

/** Push changed files: lines of path \t baseRev \t hash \t size \t data, data '-' to delete. Each lands only
    if the cloud still has it at baseRev (0: it's new); the others come back as stale, to be pulled,
    merged and pushed again. One push is one revision. */
export async function push(env: Env, a: Access, cid: string, text: string, now: number, notify?: (seq: number) => Promise<void>) {
  await own(env, a, cid);
  if (text.length > MAX_PUSH_BODY) throw new SyncError(413, 'push too large');
  const rows: { path: string; base: number; hash: string; size: number; data: string | null }[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [path, base, hash, size, data = ''] = line.split('\t');
    const del = data === '-';
    if (!okPath(path) || !Number.isInteger(Number(base)) || Number(base) < 0 || (!del && !HASH.test(hash)) || !Number.isFinite(Number(size))) throw new SyncError(400, 'bad file entry: ' + String(path).slice(0, 80));
    if (!del && data.length > MAX_FILE) throw new SyncError(413, 'file too large for GLUE Cloud: ' + path);
    if (!del && !/^[A-Za-z0-9+/=]*$/.test(data.slice(0, 200))) throw new SyncError(400, 'expected base64');
    rows.push({ path, base: Number(base), hash: del ? '' : hash, size: del ? 0 : Number(size), data: del ? null : data });
  }
  if (rows.length > MAX_PUSH_FILES) throw new SyncError(400, 'too many files in one push (at most ' + MAX_PUSH_FILES + ')');
  if (!rows.length) return { rev: null, stored: [], stale: [] };
  const used = await env.DB.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM shared_files WHERE user_id = ?').bind(a.sub).first<{ n: number }>();
  const tier = (await env.DB.prepare('SELECT tier FROM users WHERE id = ?').bind(a.sub).first<{ tier: string }>())?.tier ?? 'free';
  if ((used?.n ?? 0) + rows.reduce((s, r) => s + (r.data?.length ?? 0), 0) > (MAX_BYTES[tier] ?? MAX_BYTES.free)) throw new SyncError(507, 'cloud storage for this account is full');
  // The revision of this push, taken at once: two pushes never share one, so no pull misses a file.
  const rev = (await env.DB.prepare('UPDATE shared_collections SET seq = seq + 1, updated_at = ? WHERE user_id = ? AND id = ? RETURNING seq').bind(now, a.sub, cid).first<{ seq: number }>())!.seq;
  const res = await env.DB.batch(rows.map(r => r.data === null
    // A deletion keeps the last contents for the bin, and only lands on the revision it saw.
    ? env.DB.prepare('UPDATE shared_files SET rev = ?, deleted_at = ?, updated_by = ?, updated_at = ? WHERE user_id = ? AND collection_id = ? AND path = ? AND rev = ? AND deleted_at IS NULL').bind(rev, now, a.dev, now, a.sub, cid, r.path, r.base)
    : env.DB.prepare(`INSERT INTO shared_files (user_id, collection_id, path, rev, hash, size, data, deleted_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT (user_id, collection_id, path) DO UPDATE SET rev = excluded.rev, hash = excluded.hash, size = excluded.size, data = excluded.data, deleted_at = NULL, updated_by = excluded.updated_by, updated_at = excluded.updated_at
        WHERE shared_files.rev = ? OR (shared_files.deleted_at IS NOT NULL AND ? = 0)`).bind(a.sub, cid, r.path, rev, r.hash, r.size, r.data, a.dev, now, r.base, r.base)));
  const stored: string[] = [], stale: string[] = [];
  res.forEach((x, i) => ((x as { meta: { changes: number } }).meta.changes ? stored : stale).push(rows[i].path));
  if (stored.length) await notify?.(rev).catch(() => {});
  return { rev: stored.length ? rev : null, stored, stale };
}

/** Deleted files still kept (the bin), newest first. */
export async function bin(env: Env, a: Access, cid: string, now: number) {
  await own(env, a, cid);
  await env.DB.prepare('DELETE FROM shared_files WHERE user_id = ? AND collection_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?').bind(a.sub, cid, now - BIN_DAYS * DAY).run();
  const rows = (await env.DB.prepare('SELECT path, rev, deleted_at, updated_by FROM shared_files WHERE user_id = ? AND collection_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500').bind(a.sub, cid).all<{ path: string; rev: number; deleted_at: number; updated_by: string | null }>()).results;
  return { files: rows.map(r => ({ path: r.path, rev: r.rev, deletedAt: r.deleted_at, by: r.updated_by })) };
}

/** The shared collection and all its files. */
export async function remove(env: Env, a: Access, cid: string) {
  await own(env, a, cid);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM shared_files WHERE user_id = ? AND collection_id = ?').bind(a.sub, cid),
    env.DB.prepare('DELETE FROM shared_collections WHERE user_id = ? AND id = ?').bind(a.sub, cid),
  ]);
  return { ok: true };
}
