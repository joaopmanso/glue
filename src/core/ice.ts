/* Where WebRTC looks for a way to another device (ADR 0037, 0081), for the website and GLUE Home: the public STUN
   servers, plus GLUE Cloud's relay when the account's owner has set one up (`/v1/turn`). Each asks with its own
   credential (`ask`); the answer is kept until an hour before the relay's credentials end, or 10 minutes without
   one. One ask at a time; the public servers when it fails. */
import { ICE_SERVERS } from './transfer';

export type TurnReply = { iceServers?: RTCIceServer[]; ttl?: number };

export function iceCache() {
  let known: { servers: RTCIceServer[]; relay: boolean; until: number } | null = null;
  let asking: Promise<RTCIceServer[]> | null = null;
  const fresh = () => known && known.until > Date.now() ? known : null;
  return {
    /** The servers known now, without waiting (null: ask). */
    now: () => fresh()?.servers ?? null,
    /** Is there a relay for connections that can't be direct? */
    relay: () => !!known?.relay,
    get(ask: () => Promise<TurnReply>): Promise<RTCIceServer[]> {
      const k = fresh();
      if (k) return Promise.resolve(k.servers);
      return asking ??= ask().then(r => {
        const relays = (Array.isArray(r?.iceServers) ? r.iceServers : []).filter(s => s.username);
        known = { servers: [...ICE_SERVERS, ...relays], relay: relays.length > 0, until: Date.now() + (relays.length ? Math.max(600, (r.ttl ?? 0) - 3600) : 600) * 1000 };
        return known.servers;
      }).catch(() => ICE_SERVERS).finally(() => { asking = null; });
    },
  };
}
