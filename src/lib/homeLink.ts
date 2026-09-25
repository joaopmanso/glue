/* A WebRTC data channel to a GLUE Home (ADR 0044, 0045), set up through the account's signaling
   room: the room only relays the handshake; songs go directly between the two computers. */
import { account } from './account.svelte';
import { ICE_SERVERS, isHandshake, type Handshake } from '../core/transfer';

export interface HomeChannel { dc: RTCDataChannel; close: () => void }

/** Open a channel (`label`: 'files' to send songs, 'stream' to get them) to an online GLUE Home. */
export function connectHome(home: string, label: 'files' | 'stream', opts: { timeout?: number; onFail?: (why: string) => void } = {}): Promise<HomeChannel> {
  const name = account.devices.find(d => d.id === home)?.name ?? 'GLUE Home';
  if (!account.online.has(home)) return Promise.reject(new Error(name + '’s GLUE Home is offline: start it on that computer.'));
  const id = crypto.randomUUID();
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const say = (h: Handshake) => { account.signal(home, h); };
  let off = () => {};
  let open = false, closed = false;
  const close = () => { if (closed) return; closed = true; off(); try { dc.close(); } catch { /* closed */ } pc.close(); };
  const dc = pc.createDataChannel(label, { ordered: true });
  dc.binaryType = 'arraybuffer';
  return new Promise<HomeChannel>((resolve, reject) => {
    const fail = (why: string) => { close(); if (!open) reject(new Error(why)); else opts.onFail?.(why); };
    const timer = setTimeout(() => fail('Couldn’t connect to ' + name + '. Both computers need to reach each other directly for now (a relay comes later).'), opts.timeout ?? 20_000);
    off = account.onSignal((from, data) => {
      if (from !== home || !isHandshake(data) || data.id !== id) return;
      if (data.t === 'answer') void pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }).catch(e => fail((e as Error).message));
      else if (data.t === 'ice') void pc.addIceCandidate(data.candidate ?? undefined).catch(() => {});
      else if (data.t === 'bye') fail(data.reason || name + ' said no.');
    });
    pc.onicecandidate = e => say({ app: 'glue-send', t: 'ice', id, candidate: e.candidate?.toJSON() ?? null });
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') fail('The connection to ' + name + ' dropped.'); };
    dc.onopen = () => { open = true; clearTimeout(timer); resolve({ dc, close }); };
    dc.onclose = () => { if (!closed) fail(name + ' closed the connection.'); };
    void (async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!account.signal(home, { app: 'glue-send', t: 'offer', id, sdp: offer.sdp ?? '' } satisfies Handshake)) fail('Not connected to GLUE Cloud.');
    })().catch(e => fail((e as Error).message));
  });
}
