/* A WebRTC data channel to a GLUE Home (ADR 0044, 0045), set up through the account's signaling
   room: the room only relays the handshake; songs go directly between the two devices, or through
   GLUE Cloud's relay when they can't reach each other (ADR 0081), encrypted end to end either way. */
import { account } from './account.svelte';
import { candidateType, isHandshake, type Handshake } from '../core/transfer';
import { hasRelay, iceServers } from './ice';

/** `play`: a second channel on the same connection for what's playing, so a big answer on `dc` (an
    analysis, covers) never holds up the music's bytes (ADR 0084). */
export interface HomeChannel { dc: RTCDataChannel; play?: RTCDataChannel; close: () => void }

/** Open a channel (`label`: 'files' to send songs, 'stream' to get them) to an online GLUE Home. */
export async function connectHome(home: string, label: 'files' | 'stream', opts: { timeout?: number; onFail?: (why: string) => void } = {}): Promise<HomeChannel> {
  const name = account.devices.find(d => d.id === home)?.name ?? 'GLUE Home';
  if (!account.online.has(home)) throw new Error(name + '’s GLUE Home is offline: start it on that computer.');
  const id = crypto.randomUUID();
  const pc = new RTCPeerConnection({ iceServers: await iceServers() });
  const say = (h: Handshake) => { account.signal(home, h); };
  let off = () => {};
  let open = false, closed = false;
  const close = () => { if (closed) return; closed = true; off(); for (const c of [dc, play]) try { c?.close(); } catch { /* closed */ } pc.close(); };
  const dc = pc.createDataChannel(label, { ordered: true });
  dc.binaryType = 'arraybuffer';
  const play = label === 'stream' ? pc.createDataChannel(label, { ordered: true }) : undefined;
  if (play) play.binaryType = 'arraybuffer';
  return new Promise<HomeChannel>((resolve, reject) => {
    const fail = (why: string) => { close(); if (!open) reject(new Error(why)); else opts.onFail?.(why); };
    // What each side offered, for the message when it doesn't connect (ADR 0084).
    const mine = new Set<string>(), theirs = new Set<string>();
    const seen = () => ' (this device: ' + ([...mine].join(', ') || 'no addresses') + '; ' + name + ': ' + ([...theirs].join(', ') || 'no addresses') + '; ' + pc.iceConnectionState + ')';
    const timer = setTimeout(() => fail(hasRelay() ? 'Couldn’t connect to ' + name + ', even through the relay' + seen() + '.' : 'Couldn’t connect to ' + name + ': without GLUE Cloud’s relay, both need to reach each other directly (on the same network, usually)' + seen() + '.'), opts.timeout ?? 20_000);
    off = account.onSignal((from, data) => {
      if (from !== home || !isHandshake(data) || data.id !== id) return;
      if (data.t === 'answer') void pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }).catch(e => fail((e as Error).message));
      else if (data.t === 'ice') { const k = candidateType(data.candidate?.candidate); if (k) theirs.add(k); void pc.addIceCandidate(data.candidate ?? undefined).catch(() => {}); }
      else if (data.t === 'bye') fail(data.reason || name + ' said no.');
    });
    pc.onicecandidate = e => { const k = candidateType(e.candidate?.candidate); if (k) mine.add(k); say({ app: 'glue-send', t: 'ice', id, candidate: e.candidate?.toJSON() ?? null }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') fail(open ? 'The connection to ' + name + ' dropped.' : 'Couldn’t connect to ' + name + seen() + '.'); };
    const opened = () => { if (dc.readyState !== 'open' || (play && play.readyState !== 'open')) return; open = true; clearTimeout(timer); resolve({ dc, play, close }); };
    dc.onopen = opened;
    if (play) play.onopen = opened;
    dc.onclose = () => { if (!closed) fail(name + ' closed the connection.'); };
    if (play) play.onclose = dc.onclose;
    void (async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!account.signal(home, { app: 'glue-send', t: 'offer', id, sdp: offer.sdp ?? '' } satisfies Handshake)) fail('Not connected to GLUE Cloud.');
    })().catch(e => fail((e as Error).message));
  });
}
