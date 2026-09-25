/* Admin API (ADR 0041): statistics, users and their tiers, clearing data, maintenance.
   Only for users whose tier is 'admin', which comes from a Google-verified admin email. */
import type { Access } from './crypto';
import type { Env } from './api';

export class AdminError extends Error { constructor(readonly status: number, msg: string) { super(msg); } }
const TIERS = ['free', 'paid', 'admin'];
const DAY = 864e5;

export async function route(env: Env, a: Access, m: string, path: string, q: URLSearchParams, b: Record<string, unknown>, now: number): Promise<unknown> {
  const me = await env.DB.prepare('SELECT tier FROM users WHERE id = ?').bind(a.sub).first<{ tier: string }>();
  if (me?.tier !== 'admin') throw new AdminError(403, 'admins only');
  if (m === 'GET' && path === '/v1/admin/stats') return stats(env, now);
  if (m === 'GET' && path === '/v1/admin/users') return users(env, q.get('q') ?? '', Math.min(200, Number(q.get('limit')) || 100));
  if (m === 'POST' && path === '/v1/admin/maintenance') return maintenance(env, String(b.task ?? ''), now);
  const u = /^\/v1\/admin\/users\/([\w-]+)(\/cloud)?$/.exec(path);
  if (u) {
    const id = u[1];
    if (!await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(id).first()) throw new AdminError(404, 'no such user');
    if (m === 'PATCH' && !u[2]) {
      const tier = String(b.tier ?? '');
      if (!TIERS.includes(tier)) throw new AdminError(400, 'tier is free, paid or admin');
      if (id === a.sub && tier !== 'admin') throw new AdminError(400, 'you can’t take away your own admin tier');
      await env.DB.prepare('UPDATE users SET tier = ? WHERE id = ?').bind(tier, id).run();
      return { ok: true };
    }
    if (m === 'DELETE' && u[2]) {
      // Clear a user's cloud data (synced copies, merges, waiting edits); the account stays.
      await env.DB.batch(['sync_files', 'sync_profiles', 'sync_links', 'sync_ops'].map(t => env.DB.prepare('DELETE FROM ' + t + ' WHERE user_id = ?').bind(id)));
      return { ok: true };
    }
    if (m === 'DELETE' && !u[2]) {
      if (id === a.sub) throw new AdminError(400, 'delete your own account from the account menu');
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();   // cascades to everything
      return { ok: true };
    }
  }
  throw new AdminError(404, 'not found');
}

type N = { n: number };
async function count(env: Env, sql: string, ...v: unknown[]) { return (await env.DB.prepare(sql).bind(...v).first<N>())?.n ?? 0; }

async function stats(env: Env, now: number) {
  const tiers = (await env.DB.prepare('SELECT tier, COUNT(*) AS n FROM users GROUP BY tier').all<{ tier: string; n: number }>()).results;
  const providers = (await env.DB.prepare('SELECT provider, COUNT(*) AS n FROM identities GROUP BY provider').all<{ provider: string; n: number }>()).results;
  const kinds = (await env.DB.prepare('SELECT kind, COUNT(*) AS n FROM devices WHERE revoked_at IS NULL GROUP BY kind').all<{ kind: string; n: number }>()).results;
  const days = (await env.DB.prepare('SELECT CAST((? - created_at) / 86400000 AS INTEGER) AS d, COUNT(*) AS n FROM users WHERE created_at > ? GROUP BY d').bind(now, now - 30 * DAY).all<{ d: number; n: number }>()).results;
  const signups = Array.from({ length: 30 }, (_, i) => days.find(x => x.d === 29 - i)?.n ?? 0);   // oldest first, today last
  return {
    users: { total: tiers.reduce((s, t) => s + t.n, 0), byTier: Object.fromEntries(tiers.map(t => [t.tier, t.n])), byProvider: Object.fromEntries(providers.map(p => [p.provider, p.n])),
      new7: await count(env, 'SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 7 * DAY), new30: await count(env, 'SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 30 * DAY),
      active7: await count(env, 'SELECT COUNT(DISTINCT user_id) AS n FROM devices WHERE last_seen > ? AND revoked_at IS NULL', now - 7 * DAY), signups },
    devices: { byKind: Object.fromEntries(kinds.map(k => [k.kind, k.n])), revoked: await count(env, 'SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NOT NULL'),
      seen24h: await count(env, 'SELECT COUNT(*) AS n FROM devices WHERE last_seen > ? AND revoked_at IS NULL', now - DAY) },
    sync: { profiles: await count(env, 'SELECT COUNT(*) AS n FROM sync_profiles'), files: await count(env, 'SELECT COUNT(*) AS n FROM sync_files'),
      bytes: await count(env, 'SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM sync_files'), merges: await count(env, 'SELECT COUNT(DISTINCT group_id) AS n FROM sync_links'),
      pendingEdits: await count(env, 'SELECT COUNT(*) AS n FROM sync_ops') },
    housekeeping: { expiredCodes: await count(env, 'SELECT COUNT(*) AS n FROM pairing_codes WHERE expires_at < ? OR used_at IS NOT NULL', now),
      expiredSessions: await count(env, 'SELECT COUNT(*) AS n FROM credentials WHERE expires_at < ?', now), attempts: await count(env, 'SELECT COUNT(*) AS n FROM attempts'),
      oldEdits: await count(env, 'SELECT COUNT(*) AS n FROM sync_ops WHERE created_at < ?', now - 90 * DAY) },
    at: now,
  };
}

async function users(env: Env, q: string, limit: number) {
  const like = '%' + q.toLowerCase().replace(/[%_]/g, '') + '%';
  const rows = (await env.DB.prepare(`SELECT u.id, u.email, u.name, u.tier, u.created_at,
      (SELECT GROUP_CONCAT(provider) FROM identities i WHERE i.user_id = u.id) AS providers,
      (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.revoked_at IS NULL) AS devices,
      (SELECT MAX(last_seen) FROM devices d WHERE d.user_id = u.id) AS last_seen,
      (SELECT COALESCE(SUM(LENGTH(data)), 0) FROM sync_files f WHERE f.user_id = u.id) AS bytes,
      (SELECT COUNT(*) FROM sync_profiles p WHERE p.user_id = u.id) AS profiles
    FROM users u WHERE LOWER(COALESCE(u.email, '')) LIKE ? OR LOWER(COALESCE(u.name, '')) LIKE ? ORDER BY u.created_at DESC LIMIT ?`).bind(like, like, limit).all<Record<string, unknown>>()).results;
  return { users: rows.map(r => ({ id: r.id, email: r.email, name: r.name, tier: r.tier, createdAt: r.created_at, providers: String(r.providers ?? '').split(',').filter(Boolean), devices: r.devices, lastSeen: r.last_seen, bytes: r.bytes, profiles: r.profiles })) };
}

async function maintenance(env: Env, task: string, now: number) {
  const run = async (sql: string, ...v: unknown[]) => (await env.DB.prepare(sql).bind(...v).run()).meta.changes;
  switch (task) {
    case 'codes': return { removed: await run('DELETE FROM pairing_codes WHERE expires_at < ? OR used_at IS NOT NULL', now) };
    case 'sessions': return { removed: await run('DELETE FROM credentials WHERE expires_at < ?', now) };
    case 'attempts': return { removed: await run('DELETE FROM attempts') };
    case 'old-edits': return { removed: await run('DELETE FROM sync_ops WHERE created_at < ?', now - 90 * DAY) };
    case 'revoked-devices': return { removed: await run('DELETE FROM devices WHERE revoked_at IS NOT NULL AND revoked_at < ?', now - 30 * DAY) };
    default: throw new AdminError(400, 'unknown task');
  }
}
