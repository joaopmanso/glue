/* A relay for two devices that can't reach each other directly (ADR 0037, 0081): a phone on mobile data
   and a computer at home are both behind routers, and STUN alone can't connect them. Short-lived
   credentials for Cloudflare's TURN service, made from the account owner's TURN key (secrets
   TURN_KEY_ID and TURN_KEY_API_TOKEN). The relay passes the DTLS-encrypted bytes along; it can't read
   them. Without a key: none, and devices connect directly or not at all. */

export interface TurnEnv { TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string }
export type Ice = { urls: string | string[]; username?: string; credential?: string };
/** How long the credentials last (a day): clients ask again before then. */
export const TURN_TTL = 86_400;

/** Browsers block port 53: a URL on it only times out (Cloudflare's advice: leave it out). */
export function usable(servers: Ice[]): Ice[] {
  return servers
    .map(s => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => !/:53(\?|$)/.test(u)) }))
    .filter(s => s.urls.length > 0);
}

export async function turnServers(env: TurnEnv, ask: typeof fetch): Promise<{ iceServers: Ice[]; ttl: number }> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return { iceServers: [], ttl: 0 };
  const r = await ask('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(env.TURN_KEY_ID) + '/credentials/generate-ice-servers', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.TURN_KEY_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TURN_TTL }),
  });
  if (!r.ok) throw new Error('the relay service said no (' + r.status + ')');
  const j = await r.json() as { iceServers?: Ice[] | Ice };
  const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
  return { iceServers: usable(list), ttl: TURN_TTL };
}
