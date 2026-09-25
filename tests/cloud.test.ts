/* GLUE Cloud API (ADR 0036) against real SQLite (node:sqlite) with the real migration, and Google
   ID tokens signed by a test key in place of Google's. */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handle, type DB, type Env, type Stmt } from '../cloud/src/api';
import { b64url, normCode, pairingCode, signAccess, verifyAccess, type JwkSet } from '../cloud/src/crypto';

const CLIENT = 'test-client.apps.googleusercontent.com', ORIGIN = 'https://joaopmanso.github.io';

/** The D1 API over node:sqlite. */
function d1(): DB {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(new URL('../cloud/migrations/0001_init.sql', import.meta.url), 'utf8'));
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
    method, headers: { Origin: ORIGIN, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  }), env, { now: () => now, googleKeys: async () => jwks });
  return { status: r.status, json: await r.json().catch(() => null) as Record<string, any>, headers: r.headers };
};
const signIn = async (claims: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => call('POST', '/v1/auth/google', { credential: await idToken(claims), deviceName: 'Edge on Windows', ...extra });

beforeEach(async () => {
  now = Date.UTC(2026, 8, 25);
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  jwks = { keys: [{ ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' }] };
  env = { DB: d1(), SESSION_KEY: 'test-session-key-0123456789abcdef', GOOGLE_CLIENT_ID: CLIENT, ALLOWED_ORIGINS: ORIGIN + ',http://localhost:5174' };
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
