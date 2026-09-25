/* GLUE Home (ADR 0038), phase 1: pair with a code from the website, keep a device credential, and
   stay online in the account's signaling room. Serving the library, streaming and uploads come next
   (ADR 0037). Runs on Node.js 24 as plain TypeScript (type stripping): no build step. */
import { mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir, hostname, platform } from 'node:os';

export const DEFAULT_API = 'https://glue-api.joaopmanso.workers.dev';

export interface HomeConfig {
  api: string;
  deviceId: string;
  token: string;               // the device credential: keep private (the file is readable by you only)
  name: string;
  user: { email: string | null; name: string | null } | null;
  library: string | null;      // the GLUE folder this computer uses (phase 2: served read-only)
  incoming: string | null;     // where uploads land (phase 3)
  pairedAt: number;
}

export const configPath = () => process.env.GLUE_HOME_CONFIG || join(homedir(), '.glue-home', 'config.json');
export function loadConfig(path = configPath()): HomeConfig | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as HomeConfig; } catch { return null; }
}
export function saveConfig(c: HomeConfig, path = configPath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(c, null, 2), { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* Windows: the user profile folder is private already */ }
}
export function removeConfig(path = configPath()) { rmSync(path, { force: true }); }

type Fetch = typeof fetch;
async function post<T>(f: Fetch, api: string, path: string, body: unknown): Promise<T> {
  const r = await f(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(j.error || 'GLUE Cloud said no (' + r.status + ')'), { status: r.status });
  return j;
}

/** Join the account that made `code` on the website. */
export async function pair(code: string, opts: { name?: string; api?: string; fetch?: Fetch; path?: string } = {}): Promise<HomeConfig> {
  const api = opts.api ?? process.env.GLUE_API ?? DEFAULT_API, f = opts.fetch ?? fetch;
  const r = await post<{ deviceId: string; token: string; name: string; user: HomeConfig['user'] }>(f, api, '/v1/pairing/claim', { code, name: opts.name || hostname(), platform: platform() });
  const prev = loadConfig(opts.path);
  const c: HomeConfig = { api, deviceId: r.deviceId, token: r.token, name: r.name, user: r.user, library: prev?.library ?? null, incoming: prev?.incoming ?? null, pairedAt: Date.now() };
  saveConfig(c, opts.path);
  return c;
}

/** A short access token for this GLUE Home. */
export async function access(c: HomeConfig, f: Fetch = fetch): Promise<string> {
  return (await post<{ access: string }>(f, c.api, '/v1/auth/device', { deviceId: c.deviceId, token: c.token })).access;
}

/** Stay connected to the signaling room; reconnect with backoff; new token before the old expires. */
export function stayOnline(c: HomeConfig, log: (s: string) => void, opts: { signal?: AbortSignal } = {}) {
  let retry = 0, gone = '', ws: WebSocket | null = null, timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => { for (const t of timers) clearTimeout(t); timers = []; };
  const stop = () => { clear(); ws?.close(1000, 'bye'); ws = null; };
  opts.signal?.addEventListener('abort', stop);
  const connect = async () => {
    if (opts.signal?.aborted) return;
    let token: string;
    try { token = await access(c); }
    catch (e) {
      if ((e as { status?: number }).status === 401) { log('This GLUE Home was removed from the account. Pair it again with a new code.'); return; }
      return again('Couldn’t reach GLUE Cloud (' + (e as Error).message + ')');
    }
    const s = new WebSocket(c.api.replace(/^http/, 'ws') + '/v1/signal?token=' + encodeURIComponent(token));
    ws = s;
    s.onopen = () => {
      retry = 0; log('Online as “' + c.name + '”' + (c.user?.email ? ' for ' + c.user.email : '') + '.');
      timers.push(setInterval(() => { if (s.readyState === 1) s.send('{"type":"ping"}'); }, 30_000) as unknown as ReturnType<typeof setTimeout>);
      // Access tokens last an hour: reconnect with a fresh one before that.
      timers.push(setTimeout(() => s.close(4002, 'renew'), 50 * 60e3));
    };
    s.onmessage = e => {
      let m: { type: string; online?: string[]; from?: string };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      // Act on these at once: a close handshake may never complete once the room drops us.
      if (m.type === 'removed' || m.type === 'replaced') {
        gone = m.type === 'removed' ? 'This GLUE Home was removed from the account. Pair it again with a new code.' : 'Another copy of this GLUE Home connected; this one stops.';
        log(gone); stop(); return;
      }
      if (m.type === 'presence' && m.online) log('Devices online: ' + m.online.length + (m.online.length > 1 ? ' (a browser is connected)' : ''));
      else if (m.type === 'signal') log('Connection request from ' + m.from + ' (library sharing arrives in the next phase).');
    };
    s.onclose = e => {
      clear(); ws = null;
      if (opts.signal?.aborted) return;
      if (gone) return;
      if (e.code === 4001) { log('This GLUE Home was removed from the account. Pair it again with a new code.'); return; }
      if (e.code === 4000) { log('Another copy of this GLUE Home connected; this one stops.'); return; }
      again(e.code === 4002 ? '' : 'Connection closed (' + e.code + ')');
    };
  };
  const again = (why: string) => {
    const wait = Math.min(60_000, 1000 * 2 ** retry++);
    if (why) log(why + '; retrying in ' + Math.round(wait / 1000) + ' s.');
    timers.push(setTimeout(() => void connect(), wait));
  };
  void connect();
  return stop;
}
