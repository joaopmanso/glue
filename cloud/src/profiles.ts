/* The account's profiles: artist aliases, the same list on every device (ADR 0113). A GLUE folder keeps one
   library; an alias is who's using it (its name and colour, how BPMs show, later its events). */
import type { Access } from './crypto';
import type { Env } from './api';
import { SyncError } from './limits';

const ID = /^[\w-]{1,48}$/, COLOR = /^#[0-9a-fA-F]{3,8}$/;
export interface Alias { id: string; name: string; color: string | null; bpmRange: 'half' | 'full' | null; updatedAt: number }
interface Row { id: string; name: string; color: string | null; bpm_range: string | null; updated_at: number; deleted_at: number | null }
const out = (r: Row): Alias => ({ id: r.id, name: r.name, color: r.color, bpmRange: r.bpm_range === 'half' || r.bpm_range === 'full' ? r.bpm_range : null, updatedAt: r.updated_at });
const name = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null;
const color = (v: unknown) => typeof v === 'string' && COLOR.test(v) ? v : null;
const range = (v: unknown) => v === 'half' || v === 'full' ? v : null;

/** The account's aliases (`seeded`: it has had some, so a device never seeds it again). */
export async function list(env: Env, a: Access) {
  const rows = (await env.DB.prepare('SELECT id, name, color, bpm_range, updated_at, deleted_at FROM profiles WHERE user_id = ? ORDER BY created_at, id').bind(a.sub).all<Row>()).results;
  return { profiles: rows.filter(r => !r.deleted_at).map(out), seeded: rows.length > 0 };
}

/** The first computer's aliases, kept with their ids, only while the account has never had any. */
export async function seed(env: Env, a: Access, b: { profiles?: unknown }, now: number) {
  const ps = Array.isArray(b?.profiles) ? b.profiles as { id?: unknown; name?: unknown; color?: unknown; bpmRange?: unknown }[] : [];
  const rows = ps.map(p => ({ id: typeof p.id === 'string' && ID.test(p.id) ? p.id : '', name: name(p.name), color: color(p.color), bpmRange: range(p.bpmRange) }));
  if (!rows.length || rows.length > 50 || rows.some(r => !r.id || !r.name)) throw new SyncError(400, 'bad profiles');
  // One statement: every alias goes in, or none does (another device seeded first).
  await env.DB.prepare(`INSERT INTO profiles (user_id, id, name, color, bpm_range, created_at, updated_at)
    SELECT ?1, json_extract(j.value, '$.id'), json_extract(j.value, '$.name'), json_extract(j.value, '$.color'), json_extract(j.value, '$.bpmRange'), ?2 + j.key, ?2
    FROM json_each(?3) j WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = ?1)`).bind(a.sub, now, JSON.stringify(rows)).run();
  return list(env, a);
}

export async function create(env: Env, a: Access, b: { id?: unknown; name?: unknown; color?: unknown }, now: number, randomId: () => string) {
  const n = name(b?.name);
  if (!n) throw new SyncError(400, 'a name, please');
  const id = typeof b?.id === 'string' && ID.test(b.id) ? b.id : randomId();
  await env.DB.prepare('INSERT INTO profiles (user_id, id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, id) DO UPDATE SET name = excluded.name, color = excluded.color, updated_at = excluded.updated_at, deleted_at = NULL')
    .bind(a.sub, id, n, color(b?.color), now, now).run();
  return one(env, a, id);
}

/** A new name, colour or BPM range (only what's given). */
export async function update(env: Env, a: Access, id: string, b: { name?: unknown; color?: unknown; bpmRange?: unknown }, now: number) {
  const cur = await one(env, a, id);
  const n = b?.name !== undefined ? name(b.name) : cur.name;
  if (!n) throw new SyncError(400, 'a name, please');
  const c = b?.color !== undefined ? color(b.color) : cur.color, r = b?.bpmRange !== undefined ? range(b.bpmRange) : cur.bpmRange;
  await env.DB.prepare('UPDATE profiles SET name = ?, color = ?, bpm_range = ?, updated_at = ? WHERE user_id = ? AND id = ?').bind(n, c, r, now, a.sub, id).run();
  return one(env, a, id);
}

export async function remove(env: Env, a: Access, id: string, now: number) {
  await one(env, a, id);
  await env.DB.prepare('UPDATE profiles SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ?').bind(now, now, a.sub, id).run();
  return { ok: true };
}

async function one(env: Env, a: Access, id: string): Promise<Alias> {
  if (!ID.test(id)) throw new SyncError(400, 'bad profile');
  const r = await env.DB.prepare('SELECT id, name, color, bpm_range, updated_at, deleted_at FROM profiles WHERE user_id = ? AND id = ?').bind(a.sub, id).first<Row>();
  if (!r || r.deleted_at) throw new SyncError(404, 'no such profile');
  return out(r);
}
