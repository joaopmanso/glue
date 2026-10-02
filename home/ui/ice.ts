/* GLUE Home's ICE servers (src/core/ice.ts), asked for with this GLUE Home's device credential. */
import { access } from './cloud';
import { iceCache, type TurnReply } from '../../src/core/ice';

const ice = iceCache();

/** The servers known now (the relay once asked for), without waiting. */
export const iceNow = ice.now;

export function iceServers(api: string, deviceId: string, token: string, f: typeof fetch = fetch): Promise<RTCIceServer[]> {
  return ice.get(async () => {
    const t = await access(api, deviceId, token, f);
    return (await f(api + '/v1/turn', { headers: { Authorization: 'Bearer ' + t } })).json() as Promise<TurnReply>;
  });
}
