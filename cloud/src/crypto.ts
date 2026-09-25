/* Tokens and signatures for the GLUE Cloud API (ADR 0036), on WebCrypto only (Workers and Node). */

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
}
const json = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));
const parse = <T>(s: string): T => JSON.parse(new TextDecoder().decode(unb64url(s))) as T;

/** A random, URL-safe secret (refresh tokens, device tokens). */
export function randomToken(bytes = 32): string { return b64url(crypto.getRandomValues(new Uint8Array(bytes))); }
export function randomId(): string { return b64url(crypto.getRandomValues(new Uint8Array(12))); }

/** Stored instead of any secret: a leaked database holds no usable tokens or pairing codes. */
export async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...d].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- GLUE's own short-lived access tokens: HS256 JWTs signed with SESSION_KEY ----------------------
export interface Access { sub: string; dev: string; exp: number; iat: number }
const hmacKey = (secret: string) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function signAccess(p: Omit<Access, 'iat' | 'exp'>, secret: string, now: number, ttl = 3600): Promise<string> {
  const body = json({ alg: 'HS256', typ: 'JWT' }) + '.' + json({ ...p, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttl });
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return body + '.' + b64url(sig);
}
export async function verifyAccess(token: string, secret: string, now: number): Promise<Access | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    if (parse<{ alg: string }>(parts[0]).alg !== 'HS256') return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const p = parse<Access>(parts[1]);
    return typeof p.sub === 'string' && typeof p.dev === 'string' && p.exp * 1000 > now ? p : null;
  } catch { return null; }
}

// ---- Google Sign-In ID tokens (RS256, Google's published keys) -----------------------------------
export interface GoogleClaims { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string; aud: string; iss: string; exp: number; iat: number }
export type JwkSet = { keys: (JsonWebKey & { kid: string })[] };

let cached: { at: number; ttl: number; set: JwkSet } | null = null;
/** Google's signing keys, cached for as long as Google says. */
export async function googleKeys(now = Date.now()): Promise<JwkSet> {
  if (cached && now - cached.at < cached.ttl) return cached.set;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('Google keys unavailable (' + r.status + ')');
  const age = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  cached = { at: now, ttl: Math.min(age, 86400) * 1000, set: await r.json() as JwkSet };
  return cached.set;
}

/** Checks signature, issuer, audience (our client id), expiry. Returns the claims, or throws why not. */
export async function verifyGoogle(idToken: string, clientId: string, keys: JwkSet, now: number): Promise<GoogleClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const head = parse<{ alg: string; kid: string }>(parts[0]);
  if (head.alg !== 'RS256') throw new Error('unexpected algorithm');
  const jwk = keys.keys.find(k => k.kid === head.kid);
  if (!jwk) throw new Error('unknown signing key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64url(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('bad signature');
  const c = parse<GoogleClaims>(parts[1]);
  if (c.iss !== 'accounts.google.com' && c.iss !== 'https://accounts.google.com') throw new Error('wrong issuer');
  if (c.aud !== clientId) throw new Error('wrong audience');
  const t = Math.floor(now / 1000);
  if (c.exp < t - 60 || c.iat > t + 300) throw new Error('expired');
  if (!c.sub) throw new Error('no subject');
  return c;
}

// ---- Pairing codes: 8 characters without look-alikes (no 0/O, 1/I/L), shown as ABCD-EFGH ---------
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function pairingCode(): string {
  let s = '';
  const limit = 256 - (256 % ALPHABET.length);   // no modulo bias
  while (s.length < 8) for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < limit && s.length < 8) s += ALPHABET[b % ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
/** What people might type: lower case, spaces, dashes, O for 0 and I / L for 1 aren't in the alphabet. */
export const normCode = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '');
