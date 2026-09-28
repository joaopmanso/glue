/* Where GLUE Home's WebRTC looks for a way to another device (ADR 0037, 0081): public STUN servers, plus
   GLUE Cloud's relay when the account's owner has set one up (a phone on mobile data usually needs
   it). Asked once a day with this GLUE Home's device credential. */
import { access } from './cloud';
import { ICE_SERVERS } from '../../src/core/transfer';

let known: { servers: RTCIceServer[]; until: number } | null = null;
let asking: Promise<RTCIceServer[]> | null = null;

/** The servers known now (the relay once asked for), without waiting. */
export const iceNow = () => known && known.until > Date.now() ? known.servers : null;

export function iceServers(api: string, deviceId: string, token: string, f: typeof fetch = fetch): Promise<RTCIceServer[]> {
  const now = iceNow();
  if (now) return Promise.resolve(now);
  asking ??= (async () => {
    const t = await access(api, deviceId, token, f);
    const r = await f(api + '/v1/turn', { headers: { Authorization: 'Bearer ' + t } });
    const j = await r.json() as { iceServers?: RTCIceServer[]; ttl?: number };
    const relays = (Array.isArray(j.iceServers) ? j.iceServers : []).filter(s => s.username);
    // A day's credentials: asked again an hour before they end. No relay: asked again in 10 minutes.
    known = { servers: [...ICE_SERVERS, ...relays], until: Date.now() + (relays.length ? ((j.ttl ?? 3600) - 3600) * 1000 : 600_000) };
    return known.servers;
  })().catch(() => ICE_SERVERS).finally(() => { asking = null; });
  return asking;
}
