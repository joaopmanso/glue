/* GLUE Cloud API (ADR 0036) against real SQLite (node:sqlite) with the real migration, and Google
   ID tokens signed by a test key in place of Google's. */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handle, type DB, type Env, type Stmt } from '../cloud/src/api';
import { b64url, normCode, pairingCode, signAccess, verifyAccess, type JwkSet } from '../cloud/src/crypto';

const CLIENT = 'test-client.apps.googleusercontent.com', ORIGIN = 'https://joaopmanso.github.io';

/** The D1 API over node:sqlite. */
function d1(): DB {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of ['0001_init.sql', '0002_sync.sql', '0003_tiers_passwords.sql']) db.exec(readFileSync(new URL('../cloud/migrations/' + m, import.meta.url), 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): Stmt => ({
    bind: (...v) => stmt(sql, v),
    first: async <T,>() => (db.prepare(sql).get(...(args as never[])) as T) ?? null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
  });
  return { prepare: sql => stmt(sql), batch: async s => { db.exec('BEGIN'); try { const r = []; for (const x of s) r.push(await x.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
}

let keys: CryptoKeyPair, jwks: JwkSet, env: Env, now = Date.UTC(2026, 8, 25);
async function idToken(claims: Record<string, unknown>, kid = 'k1') {
  const enc = new TextEncoder();
  const body = b64url(enc.encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))) + '.' + b64url(enc.encode(JSON.stringify({
    iss: 'https://accounts.google.com', aud: CLIENT, sub: 'g-123', email: 'dj@example.com', email_verified: true, name: 'DJ Test',
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600, ...claims,
  })));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, enc.encode(body)));
  return body + '.' + b64url(sig);
}
const call = async (method: string, path: string, body?: unknown, token?: string, extra: Record<string, string> = {}) => {
  const r = await handle(new Request('https://glue-api.test' + path, {
    method, headers: { Origin: ORIGIN, ...(body ? { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra },
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  }), env, { now: () => now, googleKeys: async () => jwks });
  const text = await r.text();
  let json: Record<string, any> = {};
  try { json = JSON.parse(text); } catch { /* a file body */ }
  return { status: r.status, json, text, headers: r.headers };
};
const signIn = async (claims: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => call('POST', '/v1/auth/google', { credential: await idToken(claims), deviceName: 'Edge on Windows', ...extra });

// One signing key for the file (making an RSA key per test slowed the whole suite down).
beforeAll(async () => {
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  jwks = { keys: [{ ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' }] };
});
beforeEach(async () => {
  now = Date.UTC(2026, 8, 25);
  env = { DB: d1(), SESSION_KEY: 'test-session-key-0123456789abcdef', GOOGLE_CLIENT_ID: CLIENT, ALLOWED_ORIGINS: ORIGIN + ',http://localhost:5174', ADMIN_EMAILS: 'boss@example.com' };
});

describe('GLUE Cloud: tokens', () => {
  it('signs and checks access tokens; expired or tampered ones fail', async () => {
    const t = await signAccess({ sub: 'u', dev: 'd' }, 'k', now, 60);
    expect(await verifyAccess(t, 'k', now)).toMatchObject({ sub: 'u', dev: 'd' });
    expect(await verifyAccess(t, 'k', now + 61_000)).toBeNull();
    expect(await verifyAccess(t, 'other', now)).toBeNull();
    expect(await verifyAccess(t.slice(0, -2) + 'xx', 'k', now)).toBeNull();
  });
  it('makes pairing codes without look-alike characters', () => {
    for (let i = 0; i < 200; i++) expect(pairingCode()).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(normCode(' abcd-efgh ')).toBe('ABCDEFGH');
  });
});

describe('GLUE Cloud: Google sign-in and sessions', () => {
  it('creates the account and this browser once; a second sign-in reuses both', async () => {
    const a = await signIn();
    expect(a.status).toBe(200);
    expect(a.json.user).toMatchObject({ email: 'dj@example.com', name: 'DJ Test' });
    expect(a.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const b = await signIn({}, { deviceId: a.json.deviceId });
    expect(b.json.user.id).toBe(a.json.user.id);
    expect(b.json.deviceId).toBe(a.json.deviceId);
    const me = await call('GET', '/v1/me', undefined, b.json.access);
    expect(me.json.devices).toHaveLength(1);
    expect(me.json.devices[0]).toMatchObject({ kind: 'browser', name: 'Edge on Windows' });
  });
  it('refuses tokens for another app, from another issuer, expired, or badly signed', async () => {
    expect((await signIn({ aud: 'someone-else' })).status).toBe(401);
    expect((await signIn({ iss: 'https://evil.example' })).status).toBe(401);
    expect((await signIn({ exp: Math.floor(now / 1000) - 3600 })).status).toBe(401);
    const t = await idToken({});
    const r = await call('POST', '/v1/auth/google', { credential: t.slice(0, -4) + 'AAAA' });
    expect(r.status).toBe(401);
    expect((await call('POST', '/v1/auth/google', { credential: await idToken({}, 'unknown-kid') })).status).toBe(401);
    expect((await call('POST', '/v1/auth/google', { credential: 'x.y.z' })).json.error).toMatch(/malformed token/);
  });
  it('refresh tokens rotate and work once; logout ends the session', async () => {
    const a = await signIn();
    const r1 = await call('POST', '/v1/auth/refresh', { refresh: a.json.refresh });
    expect(r1.status).toBe(200);
    expect((await call('POST', '/v1/auth/refresh', { refresh: a.json.refresh })).status).toBe(401);   // used
    await call('POST', '/v1/auth/logout', { refresh: r1.json.refresh });
    expect((await call('POST', '/v1/auth/refresh', { refresh: r1.json.refresh })).status).toBe(401);
  });
  it('needs a valid access token for the rest', async () => {
    expect((await call('GET', '/v1/me')).status).toBe(401);
    expect((await call('GET', '/v1/me', undefined, 'nonsense')).status).toBe(401);
  });
  it('answers CORS preflights only for GLUE’s own origins', async () => {
    const ok = await handle(new Request('https://x/v1/me', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env, { now: () => now, googleKeys: async () => jwks });
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const no = await handle(new Request('https://x/v1/me', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env, { now: () => now, googleKeys: async () => jwks });
    expect(no.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('GLUE Cloud: pairing GLUE Home and devices', () => {
  it('pairs with a code once; the home device signs in with its token and shows in the list', async () => {
    const a = await signIn();
    const p = await call('POST', '/v1/pairing', {}, a.json.access);
    expect(p.json.code).toMatch(/^\w{4}-\w{4}$/);
    const c = await call('POST', '/v1/pairing/claim', { code: p.json.code.toLowerCase(), name: 'Studio PC', platform: 'win32' });
    expect(c.status).toBe(200);
    expect(c.json.user.email).toBe('dj@example.com');
    expect((await call('POST', '/v1/pairing/claim', { code: p.json.code, name: 'Again' })).status).toBe(401);   // single use
    const d = await call('POST', '/v1/auth/device', { deviceId: c.json.deviceId, token: c.json.token });
    expect(d.status).toBe(200);
    const me = await call('GET', '/v1/me', undefined, d.json.access);
    expect(me.json.thisDevice).toBe(c.json.deviceId);
    expect(me.json.devices.map((x: { kind: string; name: string }) => x.kind + ':' + x.name)).toEqual(['home:Studio PC', 'browser:Edge on Windows']);
  });
  it('codes expire after 10 minutes', async () => {
    const a = await signIn();
    const p = await call('POST', '/v1/pairing', {}, a.json.access);
    now += 10 * 60e3 + 1;
    expect((await call('POST', '/v1/pairing/claim', { code: p.json.code })).status).toBe(401);
  });
  it('limits guesses per address', async () => {
    for (let i = 0; i < 10; i++) expect((await call('POST', '/v1/pairing/claim', { code: 'AAAA-AAAA' }, undefined, { 'CF-Connecting-IP': '1.2.3.4' })).status).toBe(401);
    expect((await call('POST', '/v1/pairing/claim', { code: 'AAAA-AAAA' }, undefined, { 'CF-Connecting-IP': '1.2.3.4' })).status).toBe(429);
    expect((await call('POST', '/v1/pairing/claim', { code: 'AAAA-AAAA' }, undefined, { 'CF-Connecting-IP': '5.6.7.8' })).status).toBe(401);
  });
  it('renames and revokes; a revoked device is locked out at once', async () => {
    const a = await signIn();
    const c = await call('POST', '/v1/pairing/claim', { code: (await call('POST', '/v1/pairing', {}, a.json.access)).json.code, name: 'NAS' });
    const d = await call('POST', '/v1/auth/device', { deviceId: c.json.deviceId, token: c.json.token });
    expect((await call('PATCH', '/v1/devices/' + c.json.deviceId, { name: 'Basement NAS' }, a.json.access)).json.device.name).toBe('Basement NAS');
    expect((await call('DELETE', '/v1/devices/' + c.json.deviceId, undefined, a.json.access)).status).toBe(200);
    expect((await call('GET', '/v1/me', undefined, d.json.access)).status).toBe(401);                  // its access token is dead too
    expect((await call('POST', '/v1/auth/device', { deviceId: c.json.deviceId, token: c.json.token })).status).toBe(401);
    expect((await call('GET', '/v1/me', undefined, a.json.access)).json.devices).toHaveLength(1);
  });
  it('another account can’t touch your devices', async () => {
    const a = await signIn();
    const b = await signIn({ sub: 'g-other', email: 'other@example.com' });
    expect((await call('DELETE', '/v1/devices/' + a.json.deviceId, undefined, b.json.access)).status).toBe(404);
  });
  it('deleting the account removes everything', async () => {
    const a = await signIn();
    await call('POST', '/v1/pairing/claim', { code: (await call('POST', '/v1/pairing', {}, a.json.access)).json.code, name: 'NAS' });
    expect((await call('DELETE', '/v1/me', undefined, a.json.access)).status).toBe(200);
    for (const t of ['users', 'identities', 'devices', 'credentials', 'pairing_codes']) {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM ' + t).first<{ n: number }>();
      expect(n?.n, t).toBe(0);
    }
  });
});

describe('GLUE Cloud: sync and merged collections (ADR 0040)', () => {
  const h = (c: string) => c.repeat(64);
  const home = async (a: { json: Record<string, any> }, name: string) => {
    const c = await call('POST', '/v1/pairing/claim', { code: (await call('POST', '/v1/pairing', {}, a.json.access)).json.code, name });
    return (await call('POST', '/v1/auth/device', { deviceId: c.json.deviceId, token: c.json.token })).json.access as string;
  };
  it('uploads only what changed, removes what is gone, and any device of the account reads it back', async () => {
    const laptop = await signIn();
    const m1 = await call('POST', '/v1/sync/manifest', { profile: { id: 'p1', name: 'DJ Test' }, stats: { collections: [{ id: 'c1', name: 'My collection', tracks: 2 }] },
      files: [{ path: 'profile.json', hash: h('a'), size: 10 }, { path: 'collections/c1/tracks/ab.json', hash: h('b'), size: 20 }] }, laptop.json.access);
    expect(m1.json.need).toEqual(['profile.json', 'collections/c1/tracks/ab.json']);
    for (const [p, hash] of [['profile.json', h('a')], ['collections/c1/tracks/ab.json', h('b')]]) {
      expect((await call('PUT', '/v1/sync/file?profile=p1&path=' + encodeURIComponent(p) + '&hash=' + hash + '&size=10', 'H4sIAAAA' + p.length, laptop.json.access)).status).toBe(200);
    }
    // Next time: one file changed, one gone, one new.
    const m2 = await call('POST', '/v1/sync/manifest', { profile: { id: 'p1', name: 'DJ Test' }, files: [{ path: 'profile.json', hash: h('c'), size: 11 }, { path: 'collections/c1/lists/x.json', hash: h('d'), size: 5 }] }, laptop.json.access);
    expect(m2.json.need).toEqual(['profile.json', 'collections/c1/lists/x.json']);
    // Another browser of the same account sees the laptop's profile and reads its files.
    const desktop = await signIn({}, { deviceName: 'Chrome on Mac' });
    const l = await call('GET', '/v1/sync', undefined, desktop.json.access);
    expect(l.json.profiles).toHaveLength(1);
    expect(l.json.profiles[0]).toMatchObject({ device: { id: laptop.json.deviceId }, profile: { id: 'p1', name: 'DJ Test' }, files: 2, stored: 1, complete: false });
    const f = await call('GET', '/v1/sync/' + laptop.json.deviceId + '/p1', undefined, desktop.json.access);
    expect(f.json.files.map((x: { path: string }) => x.path)).toEqual(['profile.json']);    // only stored files
    expect((await call('GET', '/v1/sync/' + laptop.json.deviceId + '/p1/file?path=profile.json', undefined, desktop.json.access)).text).toBe('H4sIAAAA12');
  });
  it('refuses bad paths, oversized files, uploads before a manifest, and other accounts', async () => {
    const a = await signIn();
    expect((await call('POST', '/v1/sync/manifest', { profile: { id: 'p1', name: 'x' }, files: [{ path: '../etc', hash: h('a'), size: 1 }] }, a.json.access)).status).toBe(400);
    expect((await call('PUT', '/v1/sync/file?profile=nope&path=a.json&hash=' + h('a') + '&size=1', 'AAAA', a.json.access)).status).toBe(409);
    await call('POST', '/v1/sync/manifest', { profile: { id: 'p1', name: 'x' }, files: [{ path: 'a.json', hash: h('a'), size: 1 }] }, a.json.access);
    expect((await call('PUT', '/v1/sync/file?profile=p1&path=a.json&hash=' + h('a') + '&size=1', 'A'.repeat(1_800_001), a.json.access)).status).toBe(413);
    const other = await signIn({ sub: 'g-other' });
    expect((await call('GET', '/v1/sync/' + a.json.deviceId + '/p1', undefined, other.json.access)).status).toBe(404);
    expect((await call('GET', '/v1/sync', undefined, other.json.access)).json.profiles).toEqual([]);
  });
  it('merges collections of two devices into one group, and undoes it', async () => {
    const a = await signIn(), home1 = await home(a, 'Desktop');
    const me = (await call('GET', '/v1/me', undefined, home1)).json.thisDevice;
    const g = await call('POST', '/v1/sync/links', { name: 'Everything', members: [{ device: a.json.deviceId, profile: 'p1', collection: 'c1' }, { device: me, profile: 'p9', collection: 'c9' }] }, a.json.access);
    expect(g.json.name).toBe('Everything');
    let ls = (await call('GET', '/v1/sync/links', undefined, home1)).json.groups;
    expect(ls).toHaveLength(1);
    expect(ls[0].members).toHaveLength(2);
    await call('POST', '/v1/sync/unlink', { member: { device: me, profile: 'p9', collection: 'c9' } }, a.json.access);
    ls = (await call('GET', '/v1/sync/links', undefined, a.json.access)).json.groups;
    expect(ls[0].members).toHaveLength(1);
    await call('POST', '/v1/sync/unlink', { group: g.json.group }, a.json.access);
    expect((await call('GET', '/v1/sync/links', undefined, a.json.access)).json.groups).toEqual([]);
  });
  it('cleans up: one profile, everything, and a removed device copy', async () => {
    const a = await signIn();
    const up = async (tok: string, pid: string) => { await call('POST', '/v1/sync/manifest', { profile: { id: pid, name: pid }, files: [{ path: 'a.json', hash: h('a'), size: 1 }] }, tok); await call('PUT', '/v1/sync/file?profile=' + pid + '&path=a.json&hash=' + h('a') + '&size=1', 'AAAA', tok); };
    await up(a.json.access, 'p1'); await up(a.json.access, 'p2');
    expect((await call('DELETE', '/v1/sync/' + a.json.deviceId + '/p1', undefined, a.json.access)).status).toBe(200);
    expect((await call('GET', '/v1/sync', undefined, a.json.access)).json.profiles.map((p: { profile: { id: string } }) => p.profile.id)).toEqual(['p2']);
    await call('DELETE', '/v1/sync', undefined, a.json.access);
    expect((await call('GET', '/v1/sync', undefined, a.json.access)).json.profiles).toEqual([]);
    const home1 = await home(a, 'NAS'), nas = (await call('GET', '/v1/me', undefined, home1)).json.thisDevice;
    await up(home1, 'p3');
    await call('DELETE', '/v1/devices/' + nas, undefined, a.json.access);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_files').first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
  it('queues edits for the device that owns the data; only that device acknowledges them', async () => {
    const laptop = await signIn(), desktop = await signIn({}, { deviceName: 'Desktop browser' });
    const q = await call('POST', '/v1/sync/ops', { ops: [
      { device: desktop.json.deviceId, profile: 'p2', collection: 'c2', op: { t: 'track', id: 'd1', rating: 5 } },
      { device: desktop.json.deviceId, profile: 'p2', collection: 'c2', op: { t: 'list-del', id: 'dq' } },
    ] }, laptop.json.access);
    expect(q.json.queued).toBe(2);
    expect((await call('POST', '/v1/sync/ops', { ops: [{ device: desktop.json.deviceId, profile: 'p2', collection: 'c2', op: { t: 'rm -rf' } }] }, laptop.json.access)).status).toBe(400);
    // The laptop can read them (to show its edits on top of the desktop's copy); the desktop applies them.
    expect((await call('GET', '/v1/sync/ops?device=' + desktop.json.deviceId + '&profile=p2', undefined, laptop.json.access)).json.ops).toHaveLength(2);
    const mine = await call('GET', '/v1/sync/ops?profile=p2', undefined, desktop.json.access);
    expect(mine.json.ops.map((o: { op: { t: string } }) => o.op.t)).toEqual(['track', 'list-del']);
    await call('POST', '/v1/sync/ops/ack', { profile: 'p2', upTo: mine.json.ops[1].seq }, laptop.json.access);   // not the laptop's to ack
    expect((await call('GET', '/v1/sync/ops?profile=p2', undefined, desktop.json.access)).json.ops).toHaveLength(2);
    await call('POST', '/v1/sync/ops/ack', { profile: 'p2', upTo: mine.json.ops[1].seq }, desktop.json.access);
    expect((await call('GET', '/v1/sync/ops?profile=p2', undefined, desktop.json.access)).json.ops).toHaveLength(0);
  });
});

describe('GLUE Cloud: email + password, tiers, admin (ADR 0041)', () => {
  const key = (s: string) => (s + '-'.repeat(43)).slice(0, 43);   // stands in for the browser's PBKDF2 output
  it('registers, signs in, refuses a wrong password and a second account for the same email', async () => {
    const r = await call('POST', '/v1/auth/register', { email: 'DJ@Example.com', name: 'DJ', key: key('secret'), deviceName: 'Firefox' });
    expect(r.status).toBe(200);
    expect(r.json.user).toMatchObject({ email: 'dj@example.com', name: 'DJ', tier: 'paid' });                  // everyone is on paid for now
    expect((await call('POST', '/v1/auth/register', { email: 'dj@example.com', key: key('other') })).status).toBe(409);
    expect((await call('POST', '/v1/auth/password', { email: 'dj@example.com', key: key('wrong') })).status).toBe(401);
    const ok = await call('POST', '/v1/auth/password', { email: ' dj@EXAMPLE.com ', key: key('secret'), deviceId: r.json.deviceId });
    expect(ok.status).toBe(200);
    expect(ok.json.deviceId).toBe(r.json.deviceId);
    const me = await call('GET', '/v1/me', undefined, ok.json.access);
    expect(me.json.user).toMatchObject({ tier: 'paid', providers: ['password'] });
    expect((await call('POST', '/v1/auth/register', { email: 'not-an-email', key: key('x') })).status).toBe(400);
  });
  it('limits password guesses per account', async () => {
    await call('POST', '/v1/auth/register', { email: 'dj@example.com', key: key('secret') });
    for (let i = 0; i < 10; i++) await call('POST', '/v1/auth/password', { email: 'dj@example.com', key: key('guess' + i) });
    expect((await call('POST', '/v1/auth/password', { email: 'dj@example.com', key: key('secret') })).status).toBe(429);
  });
  it('makes only a Google-verified admin email an admin; a password account with that email is not', async () => {
    const pw = await call('POST', '/v1/auth/register', { email: 'boss@example.com', key: key('squat') });
    expect(pw.json.user.tier).toBe('paid');
    expect((await call('GET', '/v1/admin/stats', undefined, pw.json.access)).status).toBe(403);
    const unverified = await signIn({ sub: 'g-boss', email: 'boss@example.com', email_verified: false });
    expect(unverified.status).toBe(401);
    const boss = await signIn({ sub: 'g-boss', email: 'boss@example.com' });
    expect(boss.json.user.tier).toBe('admin');
    expect((await call('GET', '/v1/admin/stats', undefined, (await signIn()).json.access)).status).toBe(403);   // an ordinary Google user
  });
  it('admin: statistics, users, tiers, clearing data, deleting accounts, maintenance', async () => {
    const boss = await signIn({ sub: 'g-boss', email: 'boss@example.com' }), dj = await signIn();
    await call('POST', '/v1/sync/manifest', { profile: { id: 'p1', name: 'x' }, files: [{ path: 'a.json', hash: 'a'.repeat(64), size: 1 }] }, dj.json.access);
    await call('PUT', '/v1/sync/file?profile=p1&path=a.json&hash=' + 'a'.repeat(64) + '&size=1', 'AAAA', dj.json.access);
    const s = await call('GET', '/v1/admin/stats', undefined, boss.json.access);
    expect(s.json.users).toMatchObject({ total: 2, byTier: { admin: 1, paid: 1 }, byProvider: { google: 2 }, new7: 2 });
    expect(s.json.users.signups).toHaveLength(30);
    expect(s.json.users.signups[29]).toBe(2);
    expect(s.json.sync).toMatchObject({ profiles: 1, files: 1, bytes: 4 });
    const us = await call('GET', '/v1/admin/users?q=dj@', undefined, boss.json.access);
    expect(us.json.users).toHaveLength(1);
    expect(us.json.users[0]).toMatchObject({ email: 'dj@example.com', tier: 'paid', devices: 1, bytes: 4, providers: ['google'] });
    const id = us.json.users[0].id;
    expect((await call('PATCH', '/v1/admin/users/' + id, { tier: 'free' }, boss.json.access)).status).toBe(200);
    expect((await call('GET', '/v1/me', undefined, dj.json.access)).json.user.tier).toBe('free');
    expect((await call('PATCH', '/v1/admin/users/' + boss.json.user.id, { tier: 'paid' }, boss.json.access)).status).toBe(400);   // not yourself
    await call('DELETE', '/v1/admin/users/' + id + '/cloud', undefined, boss.json.access);
    expect((await call('GET', '/v1/sync', undefined, dj.json.access)).json.profiles).toEqual([]);
    expect((await call('POST', '/v1/admin/maintenance', { task: 'attempts' }, boss.json.access)).status).toBe(200);
    expect((await call('DELETE', '/v1/admin/users/' + id, undefined, boss.json.access)).status).toBe(200);
    expect((await call('GET', '/v1/me', undefined, dj.json.access)).status).toBe(401);
  });
});
