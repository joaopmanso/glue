/* GLUE Home and GLUE Cloud (ADR 0036, 0044, 0045): join the account with a code from the website on
   this computer (GLUE Home becomes that browser's companion). Its access tokens and the signaling room are the
   engine's (crates/glue-engine/src/room.rs, ADR 0158). */

type Fetch = typeof fetch;
export interface Joined { deviceId: string; token: string; name: string; user: { email: string | null; name: string | null } | null; companionOf?: { id: string; name: string } | null }

async function post<T>(api: string, path: string, body: unknown, f: Fetch = fetch): Promise<T> {
  const r = await f(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(j.error || 'GLUE Cloud said no (' + r.status + ')'), { status: r.status });
  return j;
}
const platform = () => /Mac/i.test(navigator.userAgent) ? 'darwin' : /Win/i.test(navigator.userAgent) ? 'win32' : 'other';

/** Join with a pairing code made on the website (sidebar › Devices › + GLUE Home). `replaces`: this
    GLUE Home's previous device, which goes (connecting again doesn't leave a second one). */
export const claim = (api: string, code: string, name: string, replaces?: { deviceId: string; token: string } | null, f?: Fetch) =>
  post<Joined>(api, '/v1/pairing/claim', { code, name, platform: platform(), ...(replaces ? { replaces } : {}) }, f);
