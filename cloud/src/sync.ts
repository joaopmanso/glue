/* Cloud sync (ADR 0040): each device mirrors a profile's data files (not audio) into D1, one row per
   file, gzip + base64 text so the Worker never decodes anything (10 ms CPU budget). A manifest says
   what exists; only changed files are uploaded; any of the user's browsers can read them back. */
import type { Access } from './crypto';
import type { Env } from './api';

export const MAX_FILE = 1_800_000;        // base64 characters per file (D1 rows are at most 2 MB)
export const MAX_FILES = 5000;            // per profile per device
/** Stored per user (base64), by tier (ADR 0041). Everyone is on paid for now. */
export const MAX_BYTES: Record<string, number> = { free: 50_000_000, paid: 300_000_000, admin: 1_000_000_000 };

export class SyncError extends Error { constructor(readonly status: number, msg: string) { super(msg); } }
const PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+){0,5}$/, ID = /^[\w-]{1,48}$/, HASH = /^[0-9a-f]{64}$/;
const okPath = (p: unknown): p is string => typeof p === 'string' && p.length <= 300 && PATH.test(p) && !p.split('/').includes('..');

interface ManifestFile { path: string; hash: string; size: number }
export interface Manifest { profile: { id: string; name: string; color?: string }; stats?: unknown; files: ManifestFile[] }

/** Record what this device's profile holds now; drop files that are gone; say which to upload. */
export async function manifest(env: Env, a: Access, b: Manifest, now: number) {
  const p = b?.profile;
  if (!p || !ID.test(p.id) || typeof p.name !== 'string') throw new SyncError(400, 'profile missing');
  if (!Array.isArray(b.files) || b.files.length > MAX_FILES) throw new SyncError(400, 'too many files (at most ' + MAX_FILES + ')');
  const files = new Map<string, ManifestFile>();
  for (const f of b.files) {
    if (!okPath(f?.path) || !HASH.test(f.hash) || typeof f.size !== 'number') throw new SyncError(400, 'bad file entry: ' + String(f?.path).slice(0, 80));
    files.set(f.path, f);
  }
  const have = (await env.DB.prepare('SELECT path, hash, data IS NOT NULL AS stored FROM sync_files WHERE user_id = ? AND device_id = ? AND profile_id = ?').bind(a.sub, a.dev, p.id).all<{ path: string; hash: string; stored: number }>()).results;
  const gone = have.filter(h => !files.has(h.path));
  for (let i = 0; i < gone.length; i += 50) {
    await env.DB.batch(gone.slice(i, i + 50).map(g => env.DB.prepare('DELETE FROM sync_files WHERE user_id = ? AND device_id = ? AND profile_id = ? AND path = ?').bind(a.sub, a.dev, p.id, g.path)));
  }
  const byPath = new Map(have.map(h => [h.path, h]));
  const need = [...files.values()].filter(f => { const h = byPath.get(f.path); return !h || h.hash !== f.hash || !h.stored; }).map(f => f.path);
  const bytes = [...files.values()].reduce((s, f) => s + f.size, 0);
  await env.DB.prepare('INSERT INTO sync_profiles (user_id, device_id, profile_id, name, color, stats, files, bytes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, device_id, profile_id) DO UPDATE SET name = excluded.name, color = excluded.color, stats = excluded.stats, files = excluded.files, bytes = excluded.bytes, updated_at = excluded.updated_at')
    .bind(a.sub, a.dev, p.id, p.name.slice(0, 60), typeof p.color === 'string' ? p.color.slice(0, 20) : null, JSON.stringify(b.stats ?? null).slice(0, 20000), files.size, bytes, now).run();
  return { need };
}

/** One file's gzip + base64 content. */
export async function putFile(env: Env, a: Access, q: URLSearchParams, text: string, now: number) {
  const profile = q.get('profile') ?? '', path = q.get('path'), hash = q.get('hash') ?? '', size = Number(q.get('size'));
  if (!ID.test(profile) || !okPath(path) || !HASH.test(hash) || !Number.isFinite(size)) throw new SyncError(400, 'bad file');
  if (text.length > MAX_FILE) throw new SyncError(413, 'file too large for cloud sync: ' + path);
  if (!/^[A-Za-z0-9+/=]*$/.test(text.slice(0, 200))) throw new SyncError(400, 'expected base64');
  const known = await env.DB.prepare('SELECT 1 FROM sync_profiles WHERE user_id = ? AND device_id = ? AND profile_id = ?').bind(a.sub, a.dev, profile).first();
  if (!known) throw new SyncError(409, 'send the manifest first');
  const used = await env.DB.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM sync_files WHERE user_id = ?').bind(a.sub).first<{ n: number }>();
  const tier = (await env.DB.prepare('SELECT tier FROM users WHERE id = ?').bind(a.sub).first<{ tier: string }>())?.tier ?? 'free';
  if ((used?.n ?? 0) + text.length > (MAX_BYTES[tier] ?? MAX_BYTES.free)) throw new SyncError(507, 'cloud storage for this account is full');
  await env.DB.prepare('INSERT INTO sync_files (user_id, device_id, profile_id, path, hash, size, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, device_id, profile_id, path) DO UPDATE SET hash = excluded.hash, size = excluded.size, data = excluded.data, updated_at = excluded.updated_at')
    .bind(a.sub, a.dev, profile, path, hash, size, text, now).run();
  return { ok: true };
}

/** Every synced profile of the user's devices (this one included). */
export async function list(env: Env, a: Access) {
  const rows = (await env.DB.prepare(`SELECT sp.device_id, sp.profile_id, sp.name, sp.color, sp.stats, sp.files, sp.bytes, sp.updated_at, d.name AS device_name, d.kind AS device_kind,
      (SELECT COUNT(*) FROM sync_files f WHERE f.user_id = sp.user_id AND f.device_id = sp.device_id AND f.profile_id = sp.profile_id AND f.data IS NOT NULL) AS stored
    FROM sync_profiles sp JOIN devices d ON d.id = sp.device_id WHERE sp.user_id = ? AND d.revoked_at IS NULL ORDER BY sp.updated_at DESC`).bind(a.sub).all<{ device_id: string; profile_id: string; name: string; color: string | null; stats: string | null; files: number; bytes: number; updated_at: number; device_name: string; device_kind: string; stored: number }>()).results;
  return {
    thisDevice: a.dev,
    profiles: rows.map(r => ({
      device: { id: r.device_id, name: r.device_name, kind: r.device_kind },
      profile: { id: r.profile_id, name: r.name, color: r.color },
      stats: (() => { try { return JSON.parse(r.stats ?? 'null'); } catch { return null; } })(),
      files: r.files, stored: r.stored, bytes: r.bytes, updatedAt: r.updated_at, complete: r.stored >= r.files,
    })),
  };
}

async function ownDevice(env: Env, a: Access, device: string) {
  const d = await env.DB.prepare('SELECT 1 FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL').bind(device, a.sub).first();
  if (!d) throw new SyncError(404, 'no such device');
}
export async function files(env: Env, a: Access, device: string, profile: string) {
  await ownDevice(env, a, device);
  const rows = (await env.DB.prepare('SELECT path, hash, size FROM sync_files WHERE user_id = ? AND device_id = ? AND profile_id = ? AND data IS NOT NULL ORDER BY path').bind(a.sub, device, profile).all<ManifestFile>()).results;
  return { files: rows };
}
export async function getFile(env: Env, a: Access, device: string, profile: string, path: string | null): Promise<string> {
  if (!okPath(path)) throw new SyncError(400, 'bad path');
  await ownDevice(env, a, device);
  const r = await env.DB.prepare('SELECT data FROM sync_files WHERE user_id = ? AND device_id = ? AND profile_id = ? AND path = ?').bind(a.sub, device, profile, path).first<{ data: string | null }>();
  if (!r?.data) throw new SyncError(404, 'not in the cloud');
  return r.data;
}
/** Clean up: one profile of one device, or (no device) everything this account keeps in the cloud. */
export async function remove(env: Env, a: Access, device?: string, profile?: string) {
  if (device && profile) {
    await ownDevice(env, a, device);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sync_files WHERE user_id = ? AND device_id = ? AND profile_id = ?').bind(a.sub, device, profile),
      env.DB.prepare('DELETE FROM sync_profiles WHERE user_id = ? AND device_id = ? AND profile_id = ?').bind(a.sub, device, profile),
      env.DB.prepare('DELETE FROM sync_links WHERE user_id = ? AND device_id = ? AND profile_id = ?').bind(a.sub, device, profile),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sync_files WHERE user_id = ?').bind(a.sub),
      env.DB.prepare('DELETE FROM sync_profiles WHERE user_id = ?').bind(a.sub),
    ]);
  }
  return { ok: true };
}

// ---- Merged collections -----------------------------------------------------------------------------
export interface Link { device: string; profile: string; collection: string }
/** All merge groups: { id, name, members }. */
export async function links(env: Env, a: Access) {
  const rows = (await env.DB.prepare('SELECT l.group_id, l.name, l.device_id, l.profile_id, l.collection_id FROM sync_links l JOIN devices d ON d.id = l.device_id WHERE l.user_id = ? AND d.revoked_at IS NULL ORDER BY l.created_at').bind(a.sub).all<{ group_id: string; name: string; device_id: string; profile_id: string; collection_id: string }>()).results;
  const groups = new Map<string, { id: string; name: string; members: Link[] }>();
  for (const r of rows) {
    const g = groups.get(r.group_id) ?? { id: r.group_id, name: r.name, members: [] };
    g.members.push({ device: r.device_id, profile: r.profile_id, collection: r.collection_id });
    groups.set(r.group_id, g);
  }
  return { groups: [...groups.values()] };
}
/** Merge collections into one group (a new one, or `group` to add to it). A collection is in at most one group. */
export async function link(env: Env, a: Access, b: { group?: string; name?: string; members?: Link[] }, now: number, newId: () => string) {
  const members = Array.isArray(b?.members) ? b.members : [];
  if (members.length < 1 || members.length > 20) throw new SyncError(400, 'members missing');
  for (const m of members) if (!ID.test(m?.device) || !ID.test(m?.profile) || !ID.test(m?.collection)) throw new SyncError(400, 'bad member');
  for (const m of members) await ownDevice(env, a, m.device);
  let group = typeof b.group === 'string' && ID.test(b.group) ? b.group : '';
  let name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
  if (group) {
    const g = await env.DB.prepare('SELECT name FROM sync_links WHERE user_id = ? AND group_id = ? LIMIT 1').bind(a.sub, group).first<{ name: string }>();
    if (!g) throw new SyncError(404, 'no such merged collection');
    name = name || g.name;
  } else group = newId();
  if (!name) name = 'Merged collection';
  await env.DB.batch(members.map(m => env.DB.prepare('INSERT INTO sync_links (user_id, group_id, name, device_id, profile_id, collection_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, device_id, profile_id, collection_id) DO UPDATE SET group_id = excluded.group_id, name = excluded.name')
    .bind(a.sub, group, name, m.device, m.profile, m.collection, now)));
  await env.DB.prepare('UPDATE sync_links SET name = ? WHERE user_id = ? AND group_id = ?').bind(name, a.sub, group).run();
  return { group, name };
}
/** Take one collection out of its group (the others stay merged), or undo a whole group. */
export async function unlink(env: Env, a: Access, b: { group?: string; member?: Link }) {
  if (b?.member) await env.DB.prepare('DELETE FROM sync_links WHERE user_id = ? AND device_id = ? AND profile_id = ? AND collection_id = ?').bind(a.sub, b.member.device, b.member.profile, b.member.collection).run();
  else if (typeof b?.group === 'string') await env.DB.prepare('DELETE FROM sync_links WHERE user_id = ? AND group_id = ?').bind(a.sub, b.group).run();
  else throw new SyncError(400, 'group or member needed');
  return { ok: true };
}

// ---- Edits for another device -----------------------------------------------------------------------
const MAX_OPS = 500, MAX_OP = 20_000, MAX_PENDING = 20_000;
export interface OpIn { device: string; profile: string; collection: string; op: unknown }
/** Queue edits for the devices that own the data; each applies them when it next opens. */
export async function pushOps(env: Env, a: Access, b: { ops?: OpIn[] }, now: number) {
  const ops = Array.isArray(b?.ops) ? b.ops : [];
  if (!ops.length) return { queued: 0 };
  if (ops.length > MAX_OPS) throw new SyncError(400, 'too many edits at once');
  const devices = new Set<string>();
  for (const o of ops) {
    if (!ID.test(o?.device) || !ID.test(o?.profile) || !ID.test(o?.collection)) throw new SyncError(400, 'bad edit target');
    const t = (o.op as { t?: string } | null)?.t;
    if (t !== 'track' && t !== 'list' && t !== 'list-del') throw new SyncError(400, 'unknown edit');
    if (JSON.stringify(o.op).length > MAX_OP) throw new SyncError(413, 'edit too large');
    devices.add(o.device);
  }
  for (const d of devices) await ownDevice(env, a, d);
  const pending = await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_ops WHERE user_id = ?').bind(a.sub).first<{ n: number }>();
  if ((pending?.n ?? 0) + ops.length > MAX_PENDING) throw new SyncError(507, 'too many edits waiting; open GLUE on your other devices so they catch up');
  for (let i = 0; i < ops.length; i += 50) {
    await env.DB.batch(ops.slice(i, i + 50).map(o => env.DB.prepare('INSERT INTO sync_ops (user_id, device_id, profile_id, collection_id, op, from_device, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(a.sub, o.device, o.profile, o.collection, JSON.stringify(o.op), a.dev, now)));
  }
  return { queued: ops.length };
}
/** Edits waiting for a device's profile (the device itself, or a browser showing them on top of its copy). */
export async function pendingOps(env: Env, a: Access, device: string, profile: string) {
  await ownDevice(env, a, device);
  const rows = (await env.DB.prepare('SELECT seq, collection_id, op, created_at FROM sync_ops WHERE user_id = ? AND device_id = ? AND profile_id = ? ORDER BY seq LIMIT 5000').bind(a.sub, device, profile).all<{ seq: number; collection_id: string; op: string; created_at: number }>()).results;
  return { ops: rows.map(r => ({ seq: r.seq, collection: r.collection_id, op: JSON.parse(r.op), at: r.created_at })) };
}
/** The owning device applied everything up to `upTo`. */
export async function ackOps(env: Env, a: Access, b: { profile?: string; upTo?: number }) {
  if (!ID.test(b?.profile ?? '') || typeof b.upTo !== 'number') throw new SyncError(400, 'profile and upTo needed');
  await env.DB.prepare('DELETE FROM sync_ops WHERE user_id = ? AND device_id = ? AND profile_id = ? AND seq <= ?').bind(a.sub, a.dev, b.profile, b.upTo).run();
  return { ok: true };
}
