/* Where WebRTC looks for a way to another device (ADR 0037, 0081): public STUN servers (enough on the
   same network, and through most home routers), plus GLUE Cloud's relay when the account's owner has
   set one up: a phone on mobile data and a computer at home usually need it. Asked once a day. */
import { account } from './account.svelte';
import { ICE_SERVERS } from '../core/transfer';

let known: { servers: RTCIceServer[]; relay: boolean; until: number } | null = null;
let asking: Promise<RTCIceServer[]> | null = null;

/** The ICE servers for a new connection. */
export function iceServers(): Promise<RTCIceServer[]> {
  if (known && known.until > Date.now()) return Promise.resolve(known.servers);
  if (!account.signedIn) return Promise.resolve(ICE_SERVERS);
  asking ??= account.request<{ iceServers: RTCIceServer[]; ttl: number }>('GET', '/v1/turn')
    .then(r => {
      const relays = (r.iceServers ?? []).filter(s => s.username);
      // A day's credentials: asked again an hour before they end. No relay: asked again in 10 minutes.
      known = { servers: [...ICE_SERVERS, ...relays], relay: relays.length > 0, until: Date.now() + (relays.length ? (r.ttl - 3600) * 1000 : 600_000) };
      return known.servers;
    })
    .catch(() => ICE_SERVERS)
    .finally(() => { asking = null; });
  return asking;
}
/** Is there a relay for connections that can't be direct? */
export const hasRelay = () => !!known?.relay;
