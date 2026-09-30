/* The shared collection (ADR 0094, 0106): one copy of a collection in GLUE Cloud for all the account's
   devices, as a snapshot and a log.
   - The log: each push is one entry, the songs, playlists and analyses that changed (gzip + base64, never
     opened here: the Worker's 10 ms budget), at the collection's next revision. It lands only on the
     revision it was based on; otherwise it's "stale", and the device pulls, merges and pushes again (the
     devices do the merging, not the Worker).
   - The snapshot: the collection's files (shared_files), complete at `floor`. Now and then the device that
     pushed folds the log into it (`checkpoint`), and the log before it goes. A device behind the floor
     reads the snapshot (`changes`, `bundle`), then the log. */
import type { Access } from './crypto';
import type { Env } from './api';
import { MAX_BUNDLE, MAX_BUNDLE_PATHS, MAX_BYTES, MAX_FILE, SyncError } from './limits';

const PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+){0,5}$/, ID = /^[\w-]{1,48}$/, HASH = /^[0-9a-f]{64}$/;
const okPath = (p: unknown): p is string => typeof p === 'string' && p.length <= 300 && PATH.test(p) && !p.split('/').includes('..');
/** A push body: at most this many files and characters (D1 rows are at most 2 MB). */
export const MAX_PUSH_FILES = 200, MAX_PUSH_BODY = 1_900_000, MAX_CHANGES = 5000;
const BIN_DAYS = 30, DAY = 864e5;
/** One log entry (base64 characters; D1 rows are at most 2 MB), and the entries after which the device
    that pushed is asked to fold the log into the snapshot. */
export const MAX_ENTRY = 1_800_000, MAX_ENTRY_PATHS = 2000, COMPACT_AFTER = 300;

interface Row { path: string; rev: number; hash: string; size: number; data: string | null; deleted_at: number | null; updated_by: string | null; updated_at: number }

/** Deleted from one of the account's devices (ADR 0112): every other device is told so, and forgets it. */
export const GONE = 'this collection was deleted from your account';
async function own(env: Env, a: Access, cid: string) {
  if (!ID.test(cid)) throw new SyncError(400, 'bad collection');
  const c = await env.DB.prepare('SELECT id, name, seq, floor, deleted_at FROM shared_collections WHERE user_id = ? AND id = ?').bind(a.sub, cid).first<{ id: string; name: string; seq: number; floor: number; deleted_at: number | null }>();
  if (!c) throw new SyncError(404, 'no such shared collection');
  if (c.deleted_at) throw new SyncError(410, GONE);
  return c;
}

/** The account's collections, and those deleted lately (`gone`: each device forgets them, ADR 0112). */
export async function list(env: Env, a: Access) {
  const rows = (await env.DB.prepare('SELECT id, name, seq, stats, created_by, created_at, updated_at, delete_after, deleted_at FROM shared_collections WHERE user_id = ? ORDER BY updated_at DESC').bind(a.sub).all<{ id: string; name: string; seq: number; stats: string | null; created_by: string | null; created_at: number; updated_at: number; delete_after: number | null; deleted_at: number | null }>()).results;
  return {
    collections: rows.filter(r => !r.deleted_at).map(r => ({ id: r.id, name: r.name, seq: r.seq, stats: r.stats ? JSON.parse(r.stats) : null, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, deleteAfter: r.delete_after })),
    gone: rows.filter(r => r.deleted_at).map(r => r.id),
  };
}

/** The computer a device's numbers are under (ADR 0108): a GLUE Home's companion, else the device itself
    (SQL, with the device as ?1). */
const COMPUTER = 'COALESCE((SELECT companion_of FROM devices WHERE id = ?1), ?1)';
/** One computer's numbers for a collection (after each sync): the songs it has, and the collection's total. */
export async function stats(env: Env, a: Access, cid: string, b: { tracks?: unknown; songs?: unknown }, now: number) {
  await own(env, a, cid);
  const n = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e7 ? v : null;
  const tracks = n(b?.tracks), songs = n(b?.songs);
  if (tracks === null || songs === null) throw new SyncError(400, 'bad numbers');
  // A sign-in that only looks (a phone: a session, ADR 0091) with no songs isn't one of its computers.
  if (!songs && (await env.DB.prepare('SELECT role FROM devices WHERE id = ?').bind(a.dev).first<{ role: string | null }>())?.role === 'browse') return { ok: true, ignored: true };
  await env.DB.prepare(`UPDATE shared_collections SET stats = json_patch(COALESCE(stats, '{}'), json_object('tracks', ?2, 'by', json_object(${COMPUTER}, json_object('songs', ?3, 'at', ?4))))
    WHERE user_id = ?5 AND id = ?6`).bind(a.dev, tracks, songs, now, a.sub, cid).run();
  return { ok: true };
}

/** One computer's line taken off the collection's list (the user's ×: an old device, a phone from before). It
    comes back only if that computer sends its numbers again. */
export async function forgetStats(env: Env, a: Access, cid: string, computer: string) {
  await own(env, a, cid);
  if (!ID.test(computer)) throw new SyncError(400, 'bad computer');
  await env.DB.prepare(`UPDATE shared_collections SET stats = json_remove(stats, '$.by."' || ? || '"') WHERE user_id = ? AND id = ? AND stats IS NOT NULL`).bind(computer, a.sub, cid).run();
  return { ok: true };
}

/** A new name, for every device. */
export async function rename(env: Env, a: Access, cid: string, b: { name?: unknown }) {
  await own(env, a, cid);
  const name = typeof b?.name === 'string' ? b.name.trim().slice(0, 80) : '';
  if (!name) throw new SyncError(400, 'a name, please');
  await env.DB.prepare('UPDATE shared_collections SET name = ? WHERE user_id = ? AND id = ?').bind(name, a.sub, cid).run();
  return { id: cid, name };
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
  await keep(env, a, cid);
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

/** Before the log (ADR 0106): a GLUE from before it pushes whole files. It's told to update, so nothing it
    sends goes around the log. */
export function oldPush(): never { throw new SyncError(410, 'GLUE was updated: reload this page, or update GLUE Home'); }

async function quota(env: Env, a: Access, more: number) {
  const used = await env.DB.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM shared_collections WHERE user_id = ?').bind(a.sub).first<{ n: number }>();
  const tier = (await env.DB.prepare('SELECT tier FROM users WHERE id = ?').bind(a.sub).first<{ tier: string }>())?.tier ?? 'free';
  if ((used?.n ?? 0) + more > (MAX_BYTES[tier] ?? MAX_BYTES.free)) throw new SyncError(507, 'cloud storage for this account is full');
}

/** The log since `since`: its entries, as many as fit one answer (`more`: ask again from `seq`). Behind
    the snapshot's floor (the log there was folded in): `reset`, read the snapshot first. */
export async function log(env: Env, a: Access, cid: string, since: number) {
  const c = await own(env, a, cid);
  await keep(env, a, cid);
  since = Math.max(0, since | 0);
  if (since < c.floor) return { reset: true, floor: c.floor, seq: c.seq, more: true, entries: [] };
  const rows = (await env.DB.prepare('SELECT rev, by, at, data FROM shared_log WHERE user_id = ? AND collection_id = ? AND rev > ? ORDER BY rev LIMIT 200').bind(a.sub, cid, since).all<{ rev: number; by: string | null; at: number; data: string }>()).results;
  const entries: typeof rows = [];
  let n = 0;
  for (const r of rows) {
    if (entries.length && n + r.data.length > MAX_BUNDLE) break;
    entries.push(r); n += r.data.length;
  }
  const more = entries.length < rows.length || rows.length === 200;
  return { seq: entries.length ? entries[entries.length - 1].rev : since, more, entries };
}

/** Push one entry: a first line of baseRev \t paths (JSON), then the data. It lands only if the collection
    is still at baseRev; else `stale`. `compact`: this device should fold the log into the snapshot. */
export async function append(env: Env, a: Access, cid: string, text: string, now: number, notify?: (seq: number) => Promise<void>) {
  const c = await own(env, a, cid);
  const nl = text.indexOf('\n');
  const head = nl < 0 ? '' : text.slice(0, nl), data = nl < 0 ? '' : text.slice(nl + 1);
  const [b, pj = ''] = head.split('\t'), base = Number(b);
  let paths: unknown;
  try { paths = JSON.parse(pj); } catch { paths = null; }
  if (!Number.isInteger(base) || base < 0 || !Array.isArray(paths) || !paths.length || paths.length > MAX_ENTRY_PATHS || !paths.every(okPath)) throw new SyncError(400, 'bad entry');
  if (data.length > MAX_ENTRY) throw new SyncError(413, 'entry too large');
  if (!data || !/^[A-Za-z0-9+/=]*$/.test(data.slice(0, 200))) throw new SyncError(400, 'expected base64');
  await quota(env, a, data.length);
  // One transaction: the entry goes in at the next revision only if the collection is still at base.
  const res = await env.DB.batch([
    env.DB.prepare('INSERT INTO shared_log (user_id, collection_id, rev, paths, data, by, at) SELECT user_id, id, seq + 1, ?, ?, ?, ? FROM shared_collections WHERE user_id = ? AND id = ? AND seq = ?').bind(JSON.stringify(paths), data, a.dev, now, a.sub, cid, base),
    env.DB.prepare(`UPDATE shared_collections SET seq = seq + 1, bytes = bytes + ?1, updated_at = ?2, delete_after = NULL,
      stats = json_patch(COALESCE(stats, '{}'), json_object('by', json_object(COALESCE((SELECT companion_of FROM devices WHERE id = ?6), ?6), json_object('changed', ?2))))
      WHERE user_id = ?3 AND id = ?4 AND seq = ?5`).bind(data.length, now, a.sub, cid, base, a.dev),
  ]);
  if (!(res[0] as { meta: { changes: number } }).meta.changes) return { stale: true, seq: c.seq };
  const rev = base + 1;
  await notify?.(rev).catch(() => {});
  return { rev, compact: rev - c.floor >= COMPACT_AFTER };
}

/** The files the log changed after the floor, up to `to` (what a checkpoint at `to` must write). */
export async function touched(env: Env, a: Access, cid: string, to: number) {
  const c = await own(env, a, cid);
  const rows = (await env.DB.prepare('SELECT paths FROM shared_log WHERE user_id = ? AND collection_id = ? AND rev > ? AND rev <= ?').bind(a.sub, cid, c.floor, to | 0).all<{ paths: string }>()).results;
  const out = new Set<string>();
  for (const r of rows) for (const p of JSON.parse(r.paths) as string[]) out.add(p);
  return { floor: c.floor, paths: [...out] };
}

/** Fold the log into the snapshot at revision `at` (the collection as the device has it there): lines of
    path \t hash \t size \t data ('-' deleted), in as many calls as it takes; `done` on the last one moves
    the floor there, and the log up to it goes. A file already written at a later checkpoint stays. */
export async function checkpoint(env: Env, a: Access, cid: string, at: number, text: string, done: boolean, now: number) {
  const c = await own(env, a, cid);
  if (!Number.isInteger(at) || at <= c.floor || at > c.seq) throw new SyncError(409, 'checkpoint out of date');
  if (text.length > MAX_PUSH_BODY) throw new SyncError(413, 'too large');
  const rows: { path: string; hash: string; size: number; data: string | null }[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [path, hash, size, data = ''] = line.split('\t');
    const del = data === '-';
    if (!okPath(path) || (!del && !HASH.test(hash)) || !Number.isFinite(Number(size))) throw new SyncError(400, 'bad file entry: ' + String(path).slice(0, 80));
    if (!del && data.length > MAX_FILE) throw new SyncError(413, 'file too large for GLUE Cloud: ' + path);
    rows.push({ path, hash: del ? '' : hash, size: del ? 0 : Number(size), data: del ? null : data });
  }
  if (rows.length > MAX_PUSH_FILES) throw new SyncError(400, 'too many files (at most ' + MAX_PUSH_FILES + ')');
  if (rows.length) await env.DB.batch(rows.map(r => r.data === null
    ? env.DB.prepare('UPDATE shared_files SET rev = ?, deleted_at = ?, updated_by = ?, updated_at = ? WHERE user_id = ? AND collection_id = ? AND path = ? AND rev <= ? AND deleted_at IS NULL').bind(at, now, a.dev, now, a.sub, cid, r.path, at)
    : env.DB.prepare(`INSERT INTO shared_files (user_id, collection_id, path, rev, hash, size, data, deleted_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT (user_id, collection_id, path) DO UPDATE SET rev = excluded.rev, hash = excluded.hash, size = excluded.size, data = excluded.data, deleted_at = NULL, updated_by = excluded.updated_by, updated_at = excluded.updated_at
        WHERE shared_files.rev <= excluded.rev`).bind(a.sub, cid, r.path, at, r.hash, r.size, r.data, a.dev, now)));
  if (done) await env.DB.batch([
    env.DB.prepare('UPDATE shared_collections SET floor = ? WHERE user_id = ? AND id = ? AND floor < ?').bind(at, a.sub, cid, at),
    env.DB.prepare('DELETE FROM shared_log WHERE user_id = ? AND collection_id = ? AND rev <= ?').bind(a.sub, cid, at),
    env.DB.prepare(`UPDATE shared_collections SET bytes = (SELECT COALESCE(SUM(LENGTH(data)), 0) FROM shared_files WHERE user_id = ?1 AND collection_id = ?2)
      + (SELECT COALESCE(SUM(LENGTH(data)), 0) FROM shared_log WHERE user_id = ?1 AND collection_id = ?2) WHERE user_id = ?1 AND id = ?2`).bind(a.sub, cid),
  ]);
  return { ok: true, written: rows.length };
}

/** A device syncs it: in use, so a deletion asked for (cloud sync turned off elsewhere) is off (ADR 0102). */
const keep = (env: Env, a: Access, cid: string) => env.DB.prepare('UPDATE shared_collections SET delete_after = NULL WHERE user_id = ? AND id = ? AND delete_after IS NOT NULL').bind(a.sub, cid).run();
export const DELETE_AFTER_DAYS = 30;

/** Cloud sync turned off on a device (ADR 0102): the account's copy goes in 30 days (`remove`), or stays. */
export async function leave(env: Env, a: Access, cid: string, b: { remove?: unknown }, now: number) {
  await own(env, a, cid);
  const at = b?.remove === true ? now + DELETE_AFTER_DAYS * DAY : null;
  await env.DB.prepare('UPDATE shared_collections SET delete_after = ? WHERE user_id = ? AND id = ?').bind(at, a.sub, cid).run();
  return { deleteAfter: at };
}

/** Every account's collections whose time has come (the daily cron). */
export async function purge(env: Env, now: number) {
  const due = (await env.DB.prepare('SELECT user_id, id FROM shared_collections WHERE delete_after IS NOT NULL AND delete_after < ? LIMIT 200').bind(now).all<{ user_id: string; id: string }>()).results;
  for (const c of due) await env.DB.batch([
    env.DB.prepare('DELETE FROM shared_files WHERE user_id = ? AND collection_id = ?').bind(c.user_id, c.id),
    env.DB.prepare('DELETE FROM shared_log WHERE user_id = ? AND collection_id = ?').bind(c.user_id, c.id),
    env.DB.prepare('DELETE FROM shared_collections WHERE user_id = ? AND id = ?').bind(c.user_id, c.id),
  ]);
  return { removed: due.length };
}

/** Deleted files still kept (the bin), newest first. */
export async function bin(env: Env, a: Access, cid: string, now: number) {
  await own(env, a, cid);
  await env.DB.prepare('DELETE FROM shared_files WHERE user_id = ? AND collection_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?').bind(a.sub, cid, now - BIN_DAYS * DAY).run();
  const rows = (await env.DB.prepare('SELECT path, rev, deleted_at, updated_by FROM shared_files WHERE user_id = ? AND collection_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500').bind(a.sub, cid).all<{ path: string; rev: number; deleted_at: number; updated_by: string | null }>()).results;
  return { files: rows.map(r => ({ path: r.path, rev: r.rev, deletedAt: r.deleted_at, by: r.updated_by })) };
}

/** Deleted for every device (ADR 0112): kept as a tombstone, so each device hears it's gone, then purged with
    its files after 30 days. `cloudOnly` ("delete everything in my cloud"): gone from GLUE Cloud at once, and
    each computer keeps its own copy. */
export async function remove(env: Env, a: Access, cid: string, now: number, cloudOnly = false, notify?: () => Promise<void>) {
  await own(env, a, cid);
  if (!cloudOnly) {
    await env.DB.prepare('UPDATE shared_collections SET deleted_at = ?, delete_after = ? WHERE user_id = ? AND id = ?').bind(now, now + DELETE_AFTER_DAYS * DAY, a.sub, cid).run();
    await notify?.().catch(() => {});
    return { ok: true, gone: true };
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM shared_files WHERE user_id = ? AND collection_id = ?').bind(a.sub, cid),
    env.DB.prepare('DELETE FROM shared_log WHERE user_id = ? AND collection_id = ?').bind(a.sub, cid),
    env.DB.prepare('DELETE FROM shared_collections WHERE user_id = ? AND id = ?').bind(a.sub, cid),
  ]);
  return { ok: true };
}
