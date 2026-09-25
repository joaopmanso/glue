/* GLUE Cloud API (ADR 0036): Google sign-in, sessions, devices, pairing GLUE Home, and the door to
   the per-user signaling room. Plain request → response, so tests run it against real SQLite. */
import { normCode, pairingCode, randomId, randomToken, sha256, signAccess, verifyAccess, verifyGoogle, type Access, type JwkSet } from './crypto';

/** The parts of Cloudflare D1 we use (tests pass a node:sqlite shim with the same shape). */
export interface Stmt { bind(...v: unknown[]): Stmt; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; run(): Promise<{ meta: { changes: number } }> }
export interface DB { prepare(sql: string): Stmt; batch(s: Stmt[]): Promise<unknown[]> }
export interface SignalNS { idFromName(n: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } }
export interface Env { DB: DB; SESSION_KEY: string; GOOGLE_CLIENT_ID: string; ALLOWED_ORIGINS: string; SIGNAL?: SignalNS }
export interface Deps { now: () => number; googleKeys: () => Promise<JwkSet> }

const DAY = 864e5;
export const REFRESH_TTL = 60 * DAY, DEVICE_TTL = 365 * DAY, CODE_TTL = 10 * 60e3, ACCESS_TTL = 3600;
const MAX_CLAIMS = 10, CLAIM_WINDOW = 10 * 60e3;   // pairing attempts per address per 10 minutes

class HttpError extends Error { constructor(readonly status: number, msg: string) { super(msg); } }
const bad = (msg: string) => new HttpError(400, msg);

interface DeviceRow { id: string; user_id: string; kind: 'browser' | 'home'; name: string; platform: string | null; public_key: string | null; created_at: number; last_seen: number | null; revoked_at: number | null }
const device = (d: DeviceRow) => ({ id: d.id, kind: d.kind, name: d.name, platform: d.platform, createdAt: d.created_at, lastSeen: d.last_seen, publicKey: d.public_key });
const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  const origin = req.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  const cors: Record<string, string> = origin && allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : { Vary: 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  try {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, ''), m = req.method;
    const body = async () => { try { return await req.json() as Record<string, unknown>; } catch { throw bad('expected a JSON body'); } };
    const now = deps.now();

    if (m === 'GET' && path === '/v1/health') return reply({ ok: true });
    if (m === 'POST' && path === '/v1/auth/google') return reply(await signInGoogle(env, deps, await body(), now));
    if (m === 'POST' && path === '/v1/auth/refresh') return reply(await refresh(env, await body(), now));
    if (m === 'POST' && path === '/v1/auth/device') return reply(await deviceSignIn(env, await body(), now));
    if (m === 'POST' && path === '/v1/pairing/claim') return reply(await claim(env, await body(), now, req.headers.get('CF-Connecting-IP') ?? 'local'));
    if (m === 'POST' && path === '/v1/auth/logout') {
      const b = await body();
      if (typeof b.refresh === 'string') await env.DB.prepare('DELETE FROM credentials WHERE hash = ?').bind(await sha256(b.refresh)).run();
      return reply({ ok: true });
    }
    // The signaling room: a WebSocket, authorised by an access token in the query (browsers can't set headers).
    if (m === 'GET' && path === '/v1/signal') {
      const a = await authed(env, url.searchParams.get('token') ?? '', now);
      if (!env.SIGNAL) throw new HttpError(503, 'signaling unavailable');
      const stub = env.SIGNAL.get(env.SIGNAL.idFromName(a.sub));
      const fwd = new Request('https://signal/connect?device=' + encodeURIComponent(a.dev) + '&user=' + encodeURIComponent(a.sub), req);
      return stub.fetch(fwd);
    }

    // Everything else needs a signed-in device.
    const a = await authed(env, (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''), now);
    if (m === 'GET' && path === '/v1/me') return reply(await me(env, a));
    if (m === 'POST' && path === '/v1/pairing') {
      await env.DB.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').bind(now).run();
      const open = await env.DB.prepare('SELECT COUNT(*) AS n FROM pairing_codes WHERE user_id = ? AND used_at IS NULL').bind(a.sub).first<{ n: number }>();
      if ((open?.n ?? 0) >= 5) throw new HttpError(429, 'too many open pairing codes; wait a few minutes');
      const code = pairingCode();
      await env.DB.prepare('INSERT INTO pairing_codes (hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(normCode(code)), a.sub, now + CODE_TTL).run();
      return reply({ code, expiresAt: now + CODE_TTL });
    }
    const dm = /^\/v1\/devices\/([\w-]+)$/.exec(path);
    if (dm && (m === 'PATCH' || m === 'DELETE')) {
      const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL').bind(dm[1], a.sub).first<DeviceRow>();
      if (!d) throw new HttpError(404, 'no such device');
      if (m === 'PATCH') {
        const name = str((await body()).name, 60);
        if (!name) throw bad('a name is needed');
        await env.DB.prepare('UPDATE devices SET name = ? WHERE id = ?').bind(name, d.id).run();
        return reply({ device: device({ ...d, name }) });
      }
      // Revoke: the device can't refresh or reconnect, and is dropped from the signaling room at once.
      await env.DB.batch([
        env.DB.prepare('UPDATE devices SET revoked_at = ? WHERE id = ?').bind(now, d.id),
        env.DB.prepare('DELETE FROM credentials WHERE device_id = ?').bind(d.id),
      ]);
      if (env.SIGNAL) await env.SIGNAL.get(env.SIGNAL.idFromName(a.sub)).fetch(new Request('https://signal/kick?device=' + encodeURIComponent(d.id), { method: 'POST' })).catch(() => null);
      return reply({ ok: true });
    }
    if (m === 'DELETE' && path === '/v1/me') {
      // Delete the account: user, identities, devices, credentials and codes (cascades).
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(a.sub).run();
      return reply({ ok: true });
    }
    throw new HttpError(404, 'not found');
  } catch (e) {
    if (e instanceof HttpError) return reply({ error: e.message }, e.status);
    console.error(e);
    return reply({ error: 'server error' }, 500);
  }
}

async function authed(env: Env, token: string, now: number): Promise<Access> {
  const a = token ? await verifyAccess(token, env.SESSION_KEY, now) : null;
  if (!a) throw new HttpError(401, 'sign in again');
  const d = await env.DB.prepare('SELECT revoked_at FROM devices WHERE id = ? AND user_id = ?').bind(a.dev, a.sub).first<{ revoked_at: number | null }>();
  if (!d || d.revoked_at) throw new HttpError(401, 'this device was removed');
  return a;
}

async function session(env: Env, userId: string, deviceId: string, now: number) {
  const refreshToken = randomToken();
  await env.DB.prepare('INSERT INTO credentials (hash, user_id, device_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(await sha256(refreshToken), userId, deviceId, 'refresh', now, now + REFRESH_TTL).run();
  return { access: await signAccess({ sub: userId, dev: deviceId }, env.SESSION_KEY, now, ACCESS_TTL), refresh: refreshToken, deviceId };
}

async function signInGoogle(env: Env, deps: Deps, b: Record<string, unknown>, now: number) {
  if (typeof b.credential !== 'string') throw bad('credential missing');
  let c;
  try { c = await verifyGoogle(b.credential, env.GOOGLE_CLIENT_ID, await deps.googleKeys(), now); }
  catch (e) { throw new HttpError(401, 'Google sign-in not accepted: ' + (e as Error).message); }
  if (c.email && c.email_verified === false) throw new HttpError(401, 'verify your Google email first');
  const ident = await env.DB.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').bind('google', c.sub).first<{ user_id: string }>();
  let userId = ident?.user_id;
  if (!userId) {
    userId = randomId();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)').bind(userId, c.email ?? null, c.name ?? null, c.picture ?? null, now),
      env.DB.prepare('INSERT INTO identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)').bind('google', c.sub, userId, c.email ?? null, now),
    ]);
  } else await env.DB.prepare('UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?').bind(c.email ?? null, c.name ?? null, c.picture ?? null, userId).run();
  // This browser: reuse its device record when it has one (and it's still ours), else register it.
  const want = str(b.deviceId, 40);
  let dev = want ? await env.DB.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND kind = ?').bind(want, userId, 'browser').first<DeviceRow>() : null;
  if (!dev) {
    const id = randomId(), name = str(b.deviceName, 60) || 'Browser';
    await env.DB.prepare('INSERT INTO devices (id, user_id, kind, name, platform, public_key, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, userId, 'browser', name, str(b.platform, 60) || null, str(b.publicKey, 2000) || null, now, now).run();
    dev = { id } as DeviceRow;
  }
  return { ...(await session(env, userId, dev.id, now)), user: { id: userId, email: c.email ?? null, name: c.name ?? null, picture: c.picture ?? null } };
}

/** Refresh tokens rotate: each is good once, and a new one comes back. */
async function refresh(env: Env, b: Record<string, unknown>, now: number) {
  if (typeof b.refresh !== 'string') throw bad('refresh missing');
  const h = await sha256(b.refresh);
  const c = await env.DB.prepare("SELECT c.user_id, c.device_id, c.expires_at FROM credentials c JOIN devices d ON d.id = c.device_id WHERE c.hash = ? AND c.kind = 'refresh' AND d.revoked_at IS NULL").bind(h).first<{ user_id: string; device_id: string; expires_at: number }>();
  if (!c || c.expires_at < now) throw new HttpError(401, 'sign in again');
  await env.DB.prepare('DELETE FROM credentials WHERE hash = ?').bind(h).run();
  return session(env, c.user_id, c.device_id, now);
}

/** GLUE Home trades its device token for a short access token. */
async function deviceSignIn(env: Env, b: Record<string, unknown>, now: number) {
  if (typeof b.deviceId !== 'string' || typeof b.token !== 'string') throw bad('deviceId and token needed');
  const c = await env.DB.prepare("SELECT c.user_id, c.expires_at FROM credentials c JOIN devices d ON d.id = c.device_id WHERE c.hash = ? AND c.device_id = ? AND c.kind = 'device' AND d.revoked_at IS NULL").bind(await sha256(b.token), b.deviceId).first<{ user_id: string; expires_at: number }>();
  if (!c || c.expires_at < now) throw new HttpError(401, 'this GLUE Home isn’t paired any more: pair it again');
  await env.DB.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').bind(now, b.deviceId).run();
  return { access: await signAccess({ sub: c.user_id, dev: b.deviceId }, env.SESSION_KEY, now, ACCESS_TTL), expiresIn: ACCESS_TTL };
}

/** GLUE Home turns a pairing code (made on the signed-in website) into its own device credential. */
async function claim(env: Env, b: Record<string, unknown>, now: number, ip: string) {
  // Rate limit per address: codes are short, guesses must be few.
  const key = 'claim:' + ip, row = await env.DB.prepare('SELECT count, window_start FROM attempts WHERE key = ?').bind(key).first<{ count: number; window_start: number }>();
  if (row && now - row.window_start < CLAIM_WINDOW && row.count >= MAX_CLAIMS) throw new HttpError(429, 'too many attempts; wait 10 minutes');
  if (!row || now - row.window_start >= CLAIM_WINDOW) await env.DB.prepare('INSERT OR REPLACE INTO attempts (key, count, window_start) VALUES (?, 1, ?)').bind(key, now).run();
  else await env.DB.prepare('UPDATE attempts SET count = count + 1 WHERE key = ?').bind(key).run();

  const code = normCode(str(b.code, 20));
  if (code.length !== 8) throw bad('the code has 8 letters and digits, like ABCD-EFGH');
  const h = await sha256(code);
  const pc = await env.DB.prepare('SELECT user_id, expires_at, used_at FROM pairing_codes WHERE hash = ?').bind(h).first<{ user_id: string; expires_at: number; used_at: number | null }>();
  if (!pc || pc.used_at || pc.expires_at < now) throw new HttpError(401, 'that code isn’t valid (codes work once, for 10 minutes)');
  const used = await env.DB.prepare('UPDATE pairing_codes SET used_at = ? WHERE hash = ? AND used_at IS NULL').bind(now, h).run();
  if (!used.meta.changes) throw new HttpError(401, 'that code was just used');
  const id = randomId(), token = randomToken(), name = str(b.name, 60) || 'GLUE Home';
  await env.DB.batch([
    env.DB.prepare('INSERT INTO devices (id, user_id, kind, name, platform, public_key, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, pc.user_id, 'home', name, str(b.platform, 60) || null, str(b.publicKey, 2000) || null, now, now),
    env.DB.prepare('INSERT INTO credentials (hash, user_id, device_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(await sha256(token), pc.user_id, id, 'device', now, now + DEVICE_TTL),
  ]);
  const user = await env.DB.prepare('SELECT email, name FROM users WHERE id = ?').bind(pc.user_id).first<{ email: string | null; name: string | null }>();
  return { deviceId: id, token, name, user };
}

async function me(env: Env, a: Access) {
  const u = await env.DB.prepare('SELECT id, email, name, picture, created_at FROM users WHERE id = ?').bind(a.sub).first<{ id: string; email: string | null; name: string | null; picture: string | null; created_at: number }>();
  if (!u) throw new HttpError(401, 'sign in again');
  const ds = await env.DB.prepare('SELECT * FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY kind DESC, created_at').bind(a.sub).all<DeviceRow>();
  return { user: { id: u.id, email: u.email, name: u.name, picture: u.picture, createdAt: u.created_at }, thisDevice: a.dev, devices: ds.results.map(device) };
}
