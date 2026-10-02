/* The website's ICE servers (src/core/ice.ts), asked for with the account's sign-in. */
import { account } from './account.svelte';
import { ICE_SERVERS } from '../core/transfer';
import { iceCache, type TurnReply } from '../core/ice';

const ice = iceCache();

/** The ICE servers for a new connection. */
export function iceServers(): Promise<RTCIceServer[]> {
  if (!account.signedIn && !ice.now()) return Promise.resolve(ICE_SERVERS);
  return ice.get(() => account.request<TurnReply>('GET', '/v1/turn'));
}
/** Is there a relay for connections that can't be direct? */
export const hasRelay = ice.relay;
