/* GLUE Cloud API (ADR 0036) against real SQLite (node:sqlite) with the real migration, and Google
   ID tokens signed by a test key in place of Google's. */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handle, type Env } from '../cloud/src/api';
import { d1 } from './d1';
import { purge } from '../cloud/src/shared';
import { b64url, normCode, pairingCode, signAccess, verifyAccess, type JwkSet } from '../cloud/src/crypto';

const CLIENT = 'test-client.apps.googleusercontent.com', ORIGIN = 'https://joaopmanso.github.io';

let keys: CryptoKeyPair, jwks: JwkSet, env: Env, now = Date.UTC(2026, 8, 25);
/** Stands in for Cloudflare's TURN service (ADR 0081). */
let relay: typeof fetch | undefined;
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
  }), env, { now: () => now, googleKeys: async () => jwks, fetch: relay });
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
  relay = undefined;
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
    // Only signed in: a session, not a device (ADR 0091).
    const me = await call('GET', '/v1/me', undefined, b.json.access);
    expect(me.json.devices).toHaveLength(0);
    expect(me.json.sessions).toHaveLength(1);
    expect(me.json.sessions[0]).toMatchObject({ kind: 'browser', name: 'Edge on Windows', role: 'browse' });
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
  it('a GLUE Home is the companion of the browser that made its code; connecting again replaces it (ADR 0045)', async () => {
    const a = await signIn({}, { deviceName: 'Desktop' });
    const claimWith = async (extra: Record<string, unknown> = {}) => (await call('POST', '/v1/pairing/claim', { code: (await call('POST', '/v1/pairing', {}, a.json.access)).json.code, name: 'Desktop', ...extra })).json;
    const h1 = await claimWith();
    expect(h1.companionOf).toEqual({ id: a.json.deviceId, name: 'Desktop' });
    let me = (await call('GET', '/v1/me', undefined, a.json.access)).json;
    expect(me.devices.find((d: { id: string }) => d.id === h1.deviceId)).toMatchObject({ kind: 'home', companionOf: a.json.deviceId });
    // A new code for the same browser: the new GLUE Home replaces the old (proved with its token).
    const h2 = await claimWith({ replaces: { deviceId: h1.deviceId, token: h1.token } });
    me = (await call('GET', '/v1/me', undefined, a.json.access)).json;
    expect(me.devices.filter((d: { kind: string }) => d.kind === 'home').map((d: { id: string }) => d.id)).toEqual([h2.deviceId]);
    expect((await call('POST', '/v1/auth/device', { deviceId: h1.deviceId, token: h1.token })).status).toBe(401);
    // GLUE Home's email sign-in is gone: codes only.
    expect((await call('POST', '/v1/home/signin', { email: 'x@example.com', key: 'k'.repeat(43) })).status).not.toBe(200);
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
    await call('POST', '/v1/shared', { id: 'c1', name: 'x' }, dj.json.access);
    await call('POST', '/v1/shared/c1/append', '0	["lists/a.json"]\nAAAA', dj.json.access);
    const s = await call('GET', '/v1/admin/stats', undefined, boss.json.access);
    expect(s.json.users).toMatchObject({ total: 2, byTier: { admin: 1, paid: 1 }, byProvider: { google: 2 }, new7: 2 });
    expect(s.json.users.signups).toHaveLength(30);
    expect(s.json.users.signups[29]).toBe(2);
    expect(s.json.cloud).toMatchObject({ collections: 1, files: 0, entries: 1, bytes: 4 });
    // Every sign-in, with who and whether it only browses (ADR 0091); admins only.
    const ss = await call('GET', '/v1/admin/sessions', undefined, boss.json.access);
    expect(ss.json.sessions.map((x: { email: string; role: string }) => [x.email, x.role]).sort()).toEqual([['boss@example.com', 'browse'], ['dj@example.com', 'browse']]);
    expect((await call('GET', '/v1/admin/sessions', undefined, dj.json.access)).status).toBe(403);
    const us = await call('GET', '/v1/admin/users?q=dj@', undefined, boss.json.access);
    expect(us.json.users).toHaveLength(1);
    expect(us.json.users[0]).toMatchObject({ email: 'dj@example.com', tier: 'paid', devices: 1, bytes: 4, collections: 1, providers: ['google'] });
    const id = us.json.users[0].id;
    expect((await call('PATCH', '/v1/admin/users/' + id, { tier: 'free' }, boss.json.access)).status).toBe(200);
    expect((await call('GET', '/v1/me', undefined, dj.json.access)).json.user.tier).toBe('free');
    expect((await call('PATCH', '/v1/admin/users/' + boss.json.user.id, { tier: 'paid' }, boss.json.access)).status).toBe(400);   // not yourself
    await call('DELETE', '/v1/admin/users/' + id + '/cloud', undefined, boss.json.access);
    expect((await call('GET', '/v1/shared', undefined, dj.json.access)).json.collections).toEqual([]);
    expect((await call('POST', '/v1/admin/maintenance', { task: 'attempts' }, boss.json.access)).status).toBe(200);
    expect((await call('DELETE', '/v1/admin/users/' + id, undefined, boss.json.access)).status).toBe(200);
    expect((await call('GET', '/v1/me', undefined, dj.json.access)).status).toBe(401);
  });
});

describe('GLUE Cloud: the relay (ADR 0081)', () => {
  it('hands signed-in devices short-lived relay credentials from the TURN key, without port 53; none without a key', async () => {
    const a = await signIn();
    expect((await call('GET', '/v1/turn')).status).toBe(401);
    // No key yet: nothing, and devices connect directly.
    expect((await call('GET', '/v1/turn', undefined, a.json.access)).json).toEqual({ iceServers: [], ttl: 0 });
    // With the key: Cloudflare's answer, less the URL browsers block.
    env = { ...env, TURN_KEY_ID: 'key-1', TURN_KEY_API_TOKEN: 'secret-token' };
    const asked: { url: string; auth: string | null; body: string }[] = [];
    relay = (async (url: string, init: RequestInit) => {
      asked.push({ url, auth: new Headers(init.headers).get('Authorization'), body: String(init.body) });
      return new Response(JSON.stringify({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }] }), { status: 201 });
    }) as unknown as typeof fetch;
    const r = await call('GET', '/v1/turn', undefined, a.json.access);
    expect(asked).toEqual([{ url: 'https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers', auth: 'Bearer secret-token', body: '{"ttl":86400}' }]);
    expect(r.json).toEqual({ ttl: 86400, iceServers: [
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
    ] });
    // The service failing: none, and the reason.
    relay = (async () => new Response('no', { status: 503 })) as unknown as typeof fetch;
    expect((await call('GET', '/v1/turn', undefined, a.json.access)).json).toMatchObject({ iceServers: [], ttl: 0, error: expect.stringContaining('503') });
  });
});

describe('computers and sessions (ADR 0091)', () => {
  const h = (c: string) => c.repeat(64);
  // A push to the account's collection, from a computer with songs of its own (music=1) or not.
  const upload = async (tok: string, tracks: number, cid = 'c1') => {
    await call('POST', '/v1/shared', { id: cid, name: 'My collection' }, tok);
    const seq = (await call('GET', '/v1/shared/' + cid + '/log?since=0', undefined, tok)).json.seq as number;
    return call('POST', '/v1/shared/' + cid + '/append' + (tracks ? '?music=1' : ''), seq + '	["lists/l.json"]\nAAAA', tok);
  };
  const devices = async (tok: string) => (await call('GET', '/v1/me', undefined, tok)).json as { thisDevice: string; devices: { id: string; kind: string; role: string; companionOf: string | null }[]; sessions: { id: string }[] };
  it('a sign-in that only browses stays a session; one that uploads a collection with songs becomes a device', async () => {
    const phone = await signIn({}, { deviceName: 'Safari on iOS' });
    await upload(phone.json.access, 0);                                 // an empty collection: still a session
    expect((await devices(phone.json.access)).devices).toEqual([]);
    const desk = await signIn({}, { deviceName: 'Edge on Windows' });
    await upload(desk.json.access, 12);
    const me = await devices(desk.json.access);
    expect(me.devices.map(d => d.id)).toEqual([desk.json.deviceId]);
    expect(me.sessions.map(d => d.id)).toEqual([phone.json.deviceId]);
  });
  it('GLUE Home attaches a second browser of its computer: it takes on the computer’s device, whose sign-ins it shares', async () => {
    const edge = await signIn({}, { deviceName: 'Edge on Windows' });
    const home = (await call('POST', '/v1/pairing/claim', { code: (await call('POST', '/v1/pairing', {}, edge.json.access)).json.code, name: 'Desktop' })).json;
    const ha = (await call('POST', '/v1/auth/device', { deviceId: home.deviceId, token: home.token })).json.access;
    const chrome = await signIn({}, { deviceName: 'Chrome on Windows' });
    // Only a GLUE Home may attach, and only the account's own browsers.
    expect((await call('POST', '/v1/computer/attach', { browser: chrome.json.deviceId }, chrome.json.access)).status).toBe(403);
    const r = await call('POST', '/v1/computer/attach', { browser: chrome.json.deviceId }, ha);
    expect(r.json).toEqual({ device: edge.json.deviceId });
    // Chrome's next refresh is the computer's device; its own record is gone; one device in the list.
    const again = await call('POST', '/v1/auth/refresh', { refresh: chrome.json.refresh });
    expect(again.json.deviceId).toBe(edge.json.deviceId);
    const me = await devices(again.json.access);
    expect(me.thisDevice).toBe(edge.json.deviceId);
    expect(me.devices.map(d => d.kind).sort()).toEqual(['browser', 'home']);
    expect(me.sessions).toEqual([]);
    // Edge's sign-in still works (both browsers are one device).
    expect((await call('POST', '/v1/auth/refresh', { refresh: edge.json.refresh })).json.deviceId).toBe(edge.json.deviceId);
  });
  it('a browser with a library of its own isn’t joined into another; by hand, one with none is', async () => {
    const a = await signIn({}, { deviceName: 'Edge' }); await upload(a.json.access, 5);
    const b = await signIn({}, { deviceName: 'Firefox' });
    await upload(b.json.access, 3, 'c9');
    expect((await call('POST', '/v1/devices/' + a.json.deviceId + '/same-computer', {}, b.json.access)).status).toBe(409);
    const c = await signIn({}, { deviceName: 'Chrome' });
    expect((await call('POST', '/v1/devices/' + a.json.deviceId + '/same-computer', {}, c.json.access)).json).toEqual({ device: a.json.deviceId });
    expect((await call('POST', '/v1/auth/refresh', { refresh: c.json.refresh })).json.deviceId).toBe(a.json.deviceId);
  });
  it('several GLUE Homes on one account: each pairs from its own computer and stays', async () => {
    const desk = await signIn({}, { deviceName: 'Desktop' }), studio = await signIn({}, { deviceName: 'Studio' });
    const pair = async (tok: string, name: string) => (await call('POST', '/v1/pairing/claim', { code: (await call('POST', '/v1/pairing', {}, tok)).json.code, name })).json;
    const h1 = await pair(desk.json.access, 'Desktop'), h2 = await pair(studio.json.access, 'Studio');
    const me = await devices(desk.json.access);
    expect(me.devices.filter(d => d.kind === 'home').map(d => d.id).sort()).toEqual([h1.deviceId, h2.deviceId].sort());
    expect(me.devices.filter(d => d.kind === 'browser').every(d => d.role === 'device')).toBe(true);
  });
});

describe('admin: free-tier usage (ADR 0093)', () => {
  it('shows Cloudflare’s numbers against the free plan with a read-only token; without one, says what’s missing', async () => {
    const boss = await signIn({ sub: 'g-boss', email: 'boss@example.com' });
    const u0 = (await call('GET', '/v1/admin/usage', undefined, boss.json.access)).json;
    expect(u0.note).toMatch(/CF_ANALYTICS_TOKEN/);
    expect(u0.worker.requests).toBeNull();
    env = { ...env, CF_ANALYTICS_TOKEN: 'read-only', CF_ACCOUNT_ID: 'acc1' };
    const asked: { auth: string | null; vars: unknown }[] = [];
    relay = (async (_url: string, init: RequestInit) => {
      asked.push({ auth: new Headers(init.headers).get('Authorization'), vars: JSON.parse(String(init.body)).variables });
      return new Response(JSON.stringify({ data: { viewer: { accounts: [{
        d1: [{ sum: { rowsRead: 1000, rowsWritten: 20 } }, { sum: { rowsRead: 500, rowsWritten: 5 } }],
        size: [{ max: { databaseSizeBytes: 15_900_000 } }],
        worker: [{ sum: { requests: 10_000, errors: 2 } }],
        turn: [{ sum: { egressBytes: 46_000_000, ingressBytes: 183_000_000 } }],
      }] } } }));
    }) as unknown as typeof fetch;
    const u = (await call('GET', '/v1/admin/usage', undefined, boss.json.access)).json;
    expect(asked[0].auth).toBe('Bearer read-only');
    expect(asked[0].vars).toMatchObject({ a: 'acc1' });
    expect(u).toMatchObject({ d1: { bytes: 15_900_000, rowsRead: 1500, rowsWritten: 25 }, worker: { requests: 10_000, errors: 2 }, turn: { egressBytes: 46_000_000 }, limits: { d1RowsWritten: 100_000 } });
    expect(u.note).toBeUndefined();
    const dj = await signIn();
    expect((await call('GET', '/v1/admin/usage', undefined, dj.json.access)).status).toBe(403);
  });
});

describe('the shared collection (ADR 0094, 0106)', () => {
  const h = (c: string) => c.repeat(64);
  /** An entry of the log, on revision `base`. */
  const entry = (base: number, paths: string[], data = 'QUJD') => base + '\t' + JSON.stringify(paths) + '\n' + data;
  const line = (path: string, c: string, data = 'QUJD') => [path, c === '-' ? '' : h(c), 3, c === '-' ? '-' : data].join('\t');
  it('cloud sync off (ADR 0102): the account’s copy goes 30 days later, unless a device syncs it meanwhile', async () => {
    const lap = await signIn({}, { deviceName: 'Laptop' }), t = lap.json.access;
    for (const id of ['c1', 'c2']) {
      await call('POST', '/v1/shared', { id, name: id }, t);
      await call('POST', '/v1/shared/' + id + '/append', entry(0, ['lists/a.json']), t);
      expect((await call('POST', '/v1/shared/' + id + '/leave', { remove: true }, t)).json.deleteAfter).toBe(now + 30 * 864e5);
    }
    expect((await call('GET', '/v1/shared', undefined, t)).json.collections.map((c: { deleteAfter: number | null }) => c.deleteAfter)).toEqual([now + 30 * 864e5, now + 30 * 864e5]);
    // A device syncs c2 again: kept.
    await call('GET', '/v1/shared/c2/log?since=0', undefined, t);
    expect(await purge(env, now + 29 * 864e5)).toEqual({ removed: 0 });   // not yet
    expect(await purge(env, now + 31 * 864e5)).toEqual({ removed: 1 });
    const left = (await call('GET', '/v1/shared', undefined, t)).json.collections;
    expect(left.map((c: { id: string; deleteAfter: number | null }) => [c.id, c.deleteAfter])).toEqual([['c2', null]]);
    // Kept on purpose ("keep it"): no date at all.
    expect((await call('POST', '/v1/shared/c2/leave', { remove: false }, t)).json.deleteAfter).toBeNull();
  });
  it('one copy for every device: a log of entries, each on the latest revision; folded into a snapshot of files', async () => {
    const lap = await signIn({}, { deviceName: 'Laptop' }), desk = await signIn({}, { deviceName: 'Desktop' });
    expect((await call('POST', '/v1/shared', { id: 'col1', name: 'My collection' }, desk.json.access)).json).toEqual({ id: 'col1', name: 'My collection', seq: 0 });
    // The desktop's first entry: revision 1.
    expect((await call('POST', '/v1/shared/col1/append', entry(0, ['collection.json', 'tracks/ab.json', 'lists/l1.json'], 'AAAA'), desk.json.access)).json).toEqual({ rev: 1, compact: false });
    // The laptop reads the log.
    const l1 = (await call('GET', '/v1/shared/col1/log?since=0', undefined, lap.json.access)).json;
    expect(l1).toMatchObject({ seq: 1, more: false, entries: [{ rev: 1, data: 'AAAA' }] });
    // The laptop's entry, on revision 1: lands (revision 2). The desktop, still on 1: stale.
    expect((await call('POST', '/v1/shared/col1/append', entry(1, ['lists/l1.json'], 'BBBB'), lap.json.access)).json).toEqual({ rev: 2, compact: false });
    expect((await call('POST', '/v1/shared/col1/append', entry(1, ['tracks/cd.json'], 'CCCC'), desk.json.access)).json).toEqual({ stale: true, seq: 2 });
    expect((await call('GET', '/v1/shared/col1/log?since=1', undefined, desk.json.access)).json.entries.map((e: { rev: number; data: string }) => [e.rev, e.data])).toEqual([[2, 'BBBB']]);
    expect((await call('POST', '/v1/shared/col1/append', entry(2, ['tracks/cd.json'], 'CCCC'), desk.json.access)).json).toEqual({ rev: 3, compact: false });
    // Folded into the snapshot at revision 3: the files the log touched, written as they are there.
    expect((await call('GET', '/v1/shared/col1/touched?to=3', undefined, desk.json.access)).json.paths.sort()).toEqual(['collection.json', 'lists/l1.json', 'tracks/ab.json', 'tracks/cd.json']);
    expect((await call('POST', '/v1/shared/col1/checkpoint?at=4', line('lists/l1.json', 'a'), desk.json.access)).status).toBe(409);   // not a revision there is
    await call('POST', '/v1/shared/col1/checkpoint?at=3', [line('collection.json', 'a'), line('tracks/ab.json', 'b')].join('\n'), desk.json.access);
    await call('POST', '/v1/shared/col1/checkpoint?at=3&done=1', [line('lists/l1.json', '-'), line('tracks/cd.json', 'c')].join('\n'), desk.json.access);
    expect((await call('POST', '/v1/shared/col1/checkpoint?at=3&done=1', '', desk.json.access)).status).toBe(409);   // done already
    // Behind the floor: read the snapshot first.
    expect((await call('GET', '/v1/shared/col1/log?since=0', undefined, lap.json.access)).json).toMatchObject({ reset: true, floor: 3 });
    const c = (await call('GET', '/v1/shared/col1/changes?since=0', undefined, lap.json.access)).json;
    expect(c.files.map((f: { path: string; rev: number; deleted: boolean }) => [f.path, f.rev, f.deleted])).toEqual([['collection.json', 3, false], ['tracks/ab.json', 3, false], ['tracks/cd.json', 3, false]]);
    const b = (await call('POST', '/v1/shared/col1/bundle', { paths: ['tracks/cd.json', 'tracks/ab.json'] }, lap.json.access)).text.split('\n');
    expect(b).toEqual(['tracks/cd.json\t3\t' + h('c') + '\tQUJD', 'tracks/ab.json\t3\t' + h('b') + '\tQUJD']);
    // The log after the floor, as usual.
    expect((await call('POST', '/v1/shared/col1/append', entry(3, ['lists/l2.json']), lap.json.access)).json).toEqual({ rev: 4, compact: false });
    expect((await call('GET', '/v1/shared/col1/log?since=3', undefined, desk.json.access)).json.entries.map((e: { rev: number }) => e.rev)).toEqual([4]);
    expect((await call('GET', '/v1/shared', undefined, lap.json.access)).json.collections.map((c: { id: string; seq: number }) => [c.id, c.seq])).toEqual([['col1', 4]]);
  });
  it('the device that pushes is asked to fold the log in once it’s long', async () => {
    const t = (await signIn()).json.access;
    await call('POST', '/v1/shared', { id: 'long' }, t);
    let last: unknown = null;
    for (let n = 0; n < 300; n++) last = (await call('POST', '/v1/shared/long/append', entry(n, ['lists/a.json']), t)).json;
    expect(last).toEqual({ rev: 300, compact: true });
  }, 30_000);
  it('another account can’t read or write it; bad entries, big ones and old pushes are refused', async () => {
    const a = await signIn();
    await call('POST', '/v1/shared', { id: 'mine' }, a.json.access);
    const other = await signIn({ sub: 'g-other', email: 'other@example.com' });
    expect((await call('GET', '/v1/shared/mine/log?since=0', undefined, other.json.access)).status).toBe(404);
    expect((await call('POST', '/v1/shared/mine/append', entry(0, ['a.json']), other.json.access)).status).toBe(404);
    expect((await call('POST', '/v1/shared/mine/append', entry(0, ['../x.json']), a.json.access)).status).toBe(400);
    expect((await call('POST', '/v1/shared/mine/append', entry(0, []), a.json.access)).status).toBe(400);
    expect((await call('POST', '/v1/shared/mine/append', entry(0, ['a.json'], 'A'.repeat(1_800_001)), a.json.access)).status).toBe(413);
    expect((await call('POST', '/v1/shared/mine/push', 'a.json\t0\t' + h('a') + '\t1\tAAAA', a.json.access)).status).toBe(410);
    expect((await call('DELETE', '/v1/shared/mine', undefined, a.json.access)).json).toEqual({ ok: true });
    expect((await call('GET', '/v1/shared', undefined, a.json.access)).json.collections).toEqual([]);
  });
});

