/* GLUE Home and GLUE Cloud (ADR 0036, 0044): join the account (a code from the website, or email and
   password), trade the device credential for short access tokens, and stay in the signaling room. */
import { passwordKey } from '../../src/core/password';

type Fetch = typeof fetch;
export interface Joined { deviceId: string; token: string; name: string; user: { email: string | null; name: string | null } | null }

async function post<T>(api: string, path: string, body: unknown, f: Fetch = fetch): Promise<T> {
  const r = await f(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(j.error || 'GLUE Cloud said no (' + r.status + ')'), { status: r.status });
  return j;
}
const platform = () => /Mac/i.test(navigator.userAgent) ? 'darwin' : /Win/i.test(navigator.userAgent) ? 'win32' : 'other';

/** Join with a pairing code made on the website (sidebar › Devices › + GLUE Home). */
export const claim = (api: string, code: string, name: string, f?: Fetch) => post<Joined>(api, '/v1/pairing/claim', { code, name, platform: platform() }, f);
/** Join with the account's email and password (stretched here, as on the website). */
export async function signIn(api: string, email: string, password: string, name: string, f?: Fetch) {
  return post<Joined>(api, '/v1/home/signin', { email: email.trim(), key: await passwordKey(email, password), name, platform: platform() }, f);
}
export const access = (api: string, deviceId: string, token: string, f?: Fetch) => post<{ access: string }>(api, '/v1/auth/device', { deviceId, token }, f).then(r => r.access);

export type RoomEvent =
  | { type: 'online' } | { type: 'offline'; why: string } | { type: 'removed' } | { type: 'replaced' }
  | { type: 'presence'; online: string[] } | { type: 'signal'; from: string; data: unknown };

/** Stay in the room: reconnect with backoff, a fresh token before the old one expires. */
export function stayOnline(api: string, deviceId: string, token: string, on: (e: RoomEvent) => void) {
  let retry = 0, stopped = false, ws: WebSocket | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => { while (timers.length) clearTimeout(timers.pop()); };
  const again = (why: string) => {
    if (stopped) return;
    const wait = Math.min(60_000, 1000 * 2 ** retry++);
    on({ type: 'offline', why: why + (why ? '; ' : '') + 'trying again in ' + Math.round(wait / 1000) + ' s' });
    timers.push(setTimeout(() => void connect(), wait));
  };
  const connect = async () => {
    if (stopped) return;
    let t: string;
    try { t = await access(api, deviceId, token); }
    catch (e) {
      if ((e as { status?: number }).status === 401) { stopped = true; on({ type: 'removed' }); return; }
      return again('Can’t reach GLUE Cloud');
    }
    if (stopped) return;
    const s = new WebSocket(api.replace(/^http/, 'ws') + '/v1/signal?token=' + encodeURIComponent(t));
    ws = s;
    s.onopen = () => {
      retry = 0; on({ type: 'online' });
      timers.push(setInterval(() => { if (s.readyState === 1) s.send('{"type":"ping"}'); }, 30_000) as unknown as ReturnType<typeof setTimeout>);
      timers.push(setTimeout(() => s.close(4002, 'renew'), 50 * 60e3));   // access tokens last an hour
    };
    s.onmessage = e => {
      let m: { type: string; online?: string[]; from?: string; data?: unknown };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      // Act on these at once: the close handshake may never arrive.
      if (m.type === 'removed') { stopped = true; clear(); s.close(); on({ type: 'removed' }); }
      else if (m.type === 'replaced') { stopped = true; clear(); s.close(); on({ type: 'replaced' }); }
      else if (m.type === 'presence' && m.online) on({ type: 'presence', online: m.online });
      else if (m.type === 'signal' && m.from) on({ type: 'signal', from: m.from, data: m.data });
    };
    s.onclose = e => {
      clear(); ws = null;
      if (stopped) return;
      if (e.code === 4001) { stopped = true; on({ type: 'removed' }); return; }
      if (e.code === 4000) { stopped = true; on({ type: 'replaced' }); return; }
      again(e.code === 4002 ? '' : 'Disconnected');
    };
  };
  void connect();
  return {
    send: (to: string, data: unknown) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'signal', to, data })); },
    stop: () => { stopped = true; clear(); ws?.close(1000, 'bye'); ws = null; },
  };
}
