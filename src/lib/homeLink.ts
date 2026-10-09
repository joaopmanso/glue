/* A WebRTC data channel to a GLUE Home (ADR 0044, 0045), set up through the account's signaling
   room: the room only relays the handshake; songs go directly between the two devices, or through
   GLUE Cloud's relay when they can't reach each other (ADR 0081), encrypted end to end either way. */
import { account } from './account.svelte';
import { candidateType, isHandshake, type Handshake } from '../core/transfer';
import { hasRelay, iceServers } from './ice';

/** `play`: a second channel on the same connection for what's playing, so a big answer on `dc` (an
    analysis, covers) never holds up the music's bytes (ADR 0084). `open`: another channel on the same connection (a
    session's 'files', ADR 0133), with no new handshake. `route`: how the bytes go now (ADR 0174). */
export interface HomeChannel { dc: RTCDataChannel; play?: RTCDataChannel; close: () => void; open: (label: string) => RTCDataChannel; route: () => Promise<string> }

/** How a connection's bytes go, from the browser's own numbers for the pair of addresses in use: directly on the same
    network, directly through the router (an address it gave the outside), or through GLUE Cloud's relay; and how long
    a message takes there and back. */
async function routeOf(pc: RTCPeerConnection): Promise<string> {
  const stats = await pc.getStats(), all = new Map<string, Record<string, unknown>>();
  stats.forEach((r: Record<string, unknown>) => all.set(r.id as string, r));
  let pair: Record<string, unknown> | undefined;
  for (const r of all.values()) if (r.type === 'transport' && r.selectedCandidatePairId) pair = all.get(r.selectedCandidatePairId as string);
  // Safari and Firefox don't name the selected pair on the transport: the nominated one that works.
  if (!pair) for (const r of all.values()) if (!pair && r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r;
  if (!pair) return 'its route isn’t known';
  const kinds = [all.get(pair.localCandidateId as string)?.candidateType, all.get(pair.remoteCandidateId as string)?.candidateType];
  const how = kinds.includes('relay') ? 'through GLUE Cloud’s relay' : kinds.every(k => k === 'host') ? 'direct, on the same network' : 'direct, through the router';
  const rtt = typeof pair.currentRoundTripTime === 'number' ? ', ' + Math.round(pair.currentRoundTripTime * 1000) + ' ms there and back' : '';
  return how + rtt;
}

/** Open a channel (`label`: 'files' to send songs, 'stream' to get them) to an online GLUE Home. */
/** `session` (ADR 0133): this tab's id and who it is, so GLUE Home keeps one session per tab and lists it. */
export async function connectHome(home: string, label: 'files' | 'stream', opts: { timeout?: number; onFail?: (why: string) => void; session?: { tab: string; name: string } } = {}): Promise<HomeChannel> {
  const name = account.devices.find(d => d.id === home)?.name ?? 'GLUE Home';
  if (!account.online.has(home)) throw new Error(name + '’s GLUE Home is offline: start it on that computer.');
  const id = crypto.randomUUID();
  const pc = new RTCPeerConnection({ iceServers: await iceServers() });
  const say = (h: Handshake) => { account.signal(home, h); };
  let off = () => {};
  let open = false, closed = false;
  // Given up before it opened: GLUE Home is told, so it lets its side go at once (ADR 0132).
  const close = () => { if (closed) return; closed = true; if (!open) say({ app: 'glue-send', t: 'bye', id }); off(); for (const c of [dc, play]) try { c?.close(); } catch { /* closed */ } pc.close(); };
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
    const more = (l: string) => { const c = pc.createDataChannel(l, { ordered: true }); c.binaryType = 'arraybuffer'; return c; };
    const opened = () => { if (dc.readyState !== 'open' || (play && play.readyState !== 'open')) return; open = true; clearTimeout(timer); resolve({ dc, play, close, open: more, route: () => routeOf(pc) }); };
    dc.onopen = opened;
    if (play) play.onopen = opened;
    dc.onclose = () => { if (!closed) fail(name + ' closed the connection.'); };
    if (play) play.onclose = dc.onclose;
    void (async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!account.signal(home, { app: 'glue-send', t: 'offer', id, sdp: offer.sdp ?? '', ...opts.session } satisfies Handshake)) fail('Not connected to GLUE Cloud.');
    })().catch(e => fail((e as Error).message));
  });
}
