/* GLUE Home's service (ADR 0044), in a hidden window: online in the account's signaling room while
   it's running, and receiving songs sent from the website into the incoming folder. Start / Stop /
   Restart come from the tray and the settings window. */
import { API, bridge, type HomeConfig, type Received, type Status } from './bridge';
import { stayOnline } from './cloud';
import { CHUNK, HIGH_WATER, ICE_SERVERS, MAX_FILE, PENDING, frame, unframe, isHandshake, type Ctrl, type Handshake, type HomeFolder, type StreamReply, type StreamReq } from '../../src/core/transfer';
import type { DetailsHeader } from '../../src/store/details';
import * as cache from './cache';
import { describe, locateAll, trackPath } from './library';
import { findUpdate, install } from './updates';

let cfg: HomeConfig | null = null;
let room: ReturnType<typeof stayOnline> | null = null;
let state: Status['state'] = 'stopped', text = 'Starting…';
let receiving: Status['receiving'] = null;
let serving = 0;   // songs being sent to another computer right now
let library: Status['library'] = undefined;
const peers = new Map<string, RTCPeerConnection>();   // handshake id → connection

const apiOf = (c: HomeConfig) => c.api || API;
function report(s: Status['state'], t: string) {
  state = s; text = t;
  const status: Status = { state, text, running: !!cfg?.running && s !== 'unpaired' && s !== 'removed', receiving, received: cfg?.received ?? [], library, analysis: { ...cache.progress.background } };
  void bridge.status(status);
  void bridge.trayStatus(t, status.running).catch(() => {});
  const el = document.getElementById('state');
  if (el) el.textContent = t;
}

function start() {
  stop(false);
  if (!cfg?.deviceId || !cfg.token) return report('unpaired', 'Not connected to a GLUE account');
  if (!cfg.running) return report('stopped', 'Stopped');
  report('connecting', 'Connecting…');
  room = stayOnline(apiOf(cfg), cfg.deviceId, cfg.token, e => {
    if (e.type === 'online') report('online', 'Online as ' + cfg!.name + (cfg!.user?.email ? ' · ' + cfg!.user.email : ''));
    else if (e.type === 'offline') report('offline', 'Offline: ' + e.why);
    else if (e.type === 'replaced') report('stopped', 'Stopped: GLUE Home started on another computer with this account’s same device');
    else if (e.type === 'removed') void unpaired();
    else if (e.type === 'signal') void onSignal(e.from, e.data);
  });
}
function stop(say = true) {
  room?.stop(); room = null;
  for (const pc of peers.values()) pc.close();
  peers.clear();
  if (say) report(cfg?.deviceId ? 'stopped' : 'unpaired', cfg?.deviceId ? 'Stopped' : 'Not connected to a GLUE account');
}
/** Removed from the account on the website: forget the credential. */
async function unpaired() {
  const gone = cfg?.deviceId;
  stop(false);
  // Connecting again with a new code removes the old device: then the settings hold the new one.
  const now = await bridge.config().catch(() => null);
  if (now && now.deviceId && now.deviceId !== gone) { cfg = now; start(); return; }
  if (cfg) { cfg = { ...cfg, deviceId: null, token: null, user: null }; await bridge.saveConfig(cfg).catch(() => {}); }
  report('removed', 'Removed from the GLUE account: connect again in the settings');
}

// ---- receiving songs ------------------------------------------------------------------------------
async function onSignal(from: string, data: unknown) {
  if (!isHandshake(data) || !room) return;
  const say = (h: Handshake) => room?.send(from, h);
  if (data.t === 'offer') {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(data.id, pc);
    pc.onicecandidate = e => say({ app: 'glue-send', t: 'ice', id: data.id, candidate: e.candidate?.toJSON() ?? null });
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { peers.delete(data.id); pc.close(); } };
    pc.ondatachannel = ev => ev.channel.label === 'stream' ? serve(ev.channel) : receive(ev.channel, from);
    await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    say({ app: 'glue-send', t: 'answer', id: data.id, sdp: answer.sdp ?? '' });
  } else if (data.t === 'ice') await peers.get(data.id)?.addIceCandidate(data.candidate ?? undefined).catch(() => {});
  else if (data.t === 'bye') { peers.get(data.id)?.close(); peers.delete(data.id); }
}

function receive(dc: RTCDataChannel, from: string) {
  dc.binaryType = 'arraybuffer';
  const reply = (c: Ctrl) => { if (dc.readyState === 'open') dc.send(JSON.stringify(c)); };
  let cur: { n: number; id: number; name: string; size: number; got: number; error: string } | null = null;
  // One step at a time, in order: a file starts, its bytes are written, it ends.
  let chain: Promise<void> = Promise.resolve();
  const fromName = () => 'another device';
  dc.onopen = () => reply({ t: 'ready', name: cfg?.name ?? 'GLUE Home' });
  dc.onmessage = e => { chain = chain.then(() => step(e.data)).catch(err => { if (cur) cur.error = (err as Error).message || String(err); }); };
  dc.onclose = () => { chain = chain.then(async () => { if (cur) { await bridge.end(cur.id, false).catch(() => {}); cur = null; receiving = null; report(state, text); } }); };

  async function step(d: string | ArrayBuffer) {
    if (typeof d !== 'string') {
      if (!cur || cur.error) return;
      cur.got += d.byteLength;
      if (cur.got > cur.size) { cur.error = 'more bytes than announced'; return; }
      await bridge.write(cur.id, new Uint8Array(d));
      if (receiving) receiving = { ...receiving, got: cur.got };
      return;
    }
    const c = JSON.parse(d) as Ctrl;
    if (c.t === 'file') {
      if (c.size > MAX_FILE) { reply({ t: 'failed', n: c.n, error: 'too large' }); return; }
      const [id, name] = await bridge.begin(c.name);
      cur = { n: c.n, id, name, size: c.size, got: 0, error: '' };
      receiving = { name, got: 0, size: c.size };
      report(state, text);
    } else if (c.t === 'end' && cur && cur.n === c.n) {
      const f = cur; cur = null; receiving = null;
      if (f.error || f.got !== f.size) {
        await bridge.end(f.id, false).catch(() => {});
        reply({ t: 'failed', n: f.n, error: f.error || 'incomplete' });
      } else {
        const path = await bridge.end(f.id, true);
        // Analysed at once, so it's ready in TO BE SORTED (ADR 0048).
        void cache.analyseIncoming(f.name, path, f.size).catch(e => console.warn('GLUE Home: couldn’t analyse', f.name, e));
        const r: Received = { name: f.name, path, from: fromName(), at: Date.now(), size: f.size };
        if (cfg) { cfg = { ...cfg, received: [r, ...(cfg.received ?? [])].slice(0, 30) }; await bridge.saveConfig(cfg).catch(() => {}); }
        reply({ t: 'saved', n: f.n, name: f.name });
      }
      report(state, text);
    }
  }
  void from;
}

// ---- playing this computer's songs on another (ADR 0045) -----------------------------------------
const TYPES: Record<string, string> = { mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', alac: 'audio/mp4' };
function serve(dc: RTCDataChannel) {
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = HIGH_WATER / 4;
  const send = (c: StreamReply) => { if (dc.readyState === 'open') dc.send(JSON.stringify(c)); };
  const drained = () => new Promise<void>(res => { if (dc.bufferedAmount <= HIGH_WATER) return res(); const f = () => { dc.removeEventListener('bufferedamountlow', f); res(); }; dc.addEventListener('bufferedamountlow', f); });
  /** An answer: `data`, then bytes (all at once, or read from a file in 1 MB steps), then the end. */
  const answer = async (n: number, data: unknown, bytes: Uint8Array | { path: string; size: number } | null, extra: { name?: string; type?: string } = {}) => {
    const size = bytes ? ('path' in bytes ? bytes.size : bytes.length) : 0;
    send({ t: 'meta', n, size, data, ...extra });
    // Each binary message carries its request's number, so answers can go out at the same time (ADR 0047).
    const push = async (block: Uint8Array) => { for (let i = 0; i < block.length; i += CHUNK) { await drained(); if (dc.readyState !== 'open') return; dc.send(frame(n, block.subarray(i, Math.min(block.length, i + CHUNK)))); } };
    if (bytes && 'path' in bytes) for (let at = 0; at < bytes.size;) { const b = new Uint8Array(await bridge.fileRead(bytes.path, at, 1024 * 1024)); if (!b.length) break; await push(b); at += b.length; }
    else if (bytes) await push(bytes);
    send({ t: 'eof', n, type: extra.type });
  };
  const need = () => { if (!cfg?.glue) throw new Error('GLUE Home doesn’t know this computer’s GLUE folder: choose it in its settings.'); return cfg; };
  const typeOf = (name: string) => TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
  // What the website on this computer hands over ('put'): its bytes arrive after the request, by number.
  const uploads = new Map<number, { req: Extract<StreamReq, { t: 'put' }>; parts: Uint8Array[]; got: number }>();
  // Requests run at the same time: a slow one (an analysis) doesn't hold up the others.
  const step = (f: () => Promise<void>, n: number) => {
    void (async () => { serving++; try { await f(); } catch (err) { send({ t: 'error', n, error: (err as Error).message || String(err) }); } finally { serving--; } })();
  };
  dc.onmessage = e => {
    if (typeof e.data !== 'string') { const f = unframe(e.data as ArrayBuffer), u = uploads.get(f.n); if (u) { u.parts.push(f.data.slice()); u.got += f.data.length; } return; }
    const c = JSON.parse(e.data) as StreamReq;
    if (c.t === 'put') { uploads.set(c.n, { req: c, parts: [], got: 0 }); return; }
    if (c.t === 'end') {
      const u = uploads.get(c.n); uploads.delete(c.n);
      if (!u) return;
      step(async () => {
        const bytes = new Uint8Array(u.got); let at = 0;
        for (const p of u.parts) { bytes.set(p, at); at += p.length; }
        const r = u.req;
        if (r.kind === 'thumb') await cache.putThumb(r.profile, r.collection, r.track, bytes);
        else await cache.putDetails(r.profile, r.collection, r.track, r.header as DetailsHeader, bytes);
        await answer(r.n, null, null);
      }, c.n);
      return;
    }
    step(async () => {
      if (c.t === 'get') {
        const f = await trackPath(c.profile, c.collection, c.track, need());
        // A music folder found by name: remember it (and GLUE Home may read it from now on).
        if (f.folder && cfg) { cfg = { ...cfg, folders: { ...(cfg.folders ?? {}), [f.folder.id]: f.folder.path } }; await bridge.saveConfig(cfg); }
        await answer(c.n, null, { path: f.path, size: await bridge.fileSize(f.path) }, { name: f.name, type: typeOf(f.name) });
      } else if (c.t === 'thumbs') {
        need();
        const found: [string, number][] = [], parts: Uint8Array[] = [];
        for (const id of c.tracks.slice(0, 200)) {
          const b = await cache.thumb(c.profile, c.collection, id);
          found.push([id, b?.length ?? 0]);
          if (b) parts.push(b); else void cache.soon(c.profile, c.collection, id, () => cfg);   // made next, for the next ask
        }
        const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0;
        for (const p of parts) { all.set(p, at); at += p.length; }
        await answer(c.n, found, all);
      } else if (c.t === 'details') {
        need();
        let d = await cache.details(c.profile, c.collection, c.track);
        if (!d) {
          // Made now, first in line; if it takes long, the page asks again (it shows the summary meanwhile).
          const made = cache.soon(c.profile, c.collection, c.track, () => cfg, true);
          const r = await Promise.race([made, new Promise<'wait'>(res => setTimeout(() => res('wait'), 12_000))]);
          if (r === 'wait') throw new Error(PENDING);
          if (r) d = await cache.details(c.profile, c.collection, c.track);
        }
        if (!d) throw new Error('GLUE Home couldn’t analyse that song.');
        await answer(c.n, d.header, d.bin);
      } else if (c.t === 'have') {
        await answer(c.n, await cache.kept(c.profile, c.collection), null);
      } else if (c.t === 'incoming') {
        // With the analysis made when each song arrived.
        const list = await Promise.all((await bridge.incomingList()).map(async f => ({ name: f.name, size: f.size, mtime: f.mtime, summary: await cache.incomingSummary(f.name) })));
        await answer(c.n, list, null);
      } else if (c.t === 'cache') {
        const found: [string, number][] = [], parts: Uint8Array[] = [];
        for (const key of c.keys.slice(0, 200)) { const b = await cache.cacheFile(key); found.push([key, b?.length ?? 0]); if (b) parts.push(b); }
        const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0;
        for (const p of parts) { all.set(p, at); at += p.length; }
        await answer(c.n, found, all);
      } else if (c.t === 'local') {
        // The website on this computer: how to reach GLUE Home without GLUE Cloud (ADR 0048).
        await answer(c.n, { port: await bridge.localPort(), token: cfg?.localToken ?? null }, null);
      } else if (c.t === 'get-incoming') {
        const f = (await bridge.incomingList()).find(x => x.name === c.name);
        if (!f) throw new Error('That song isn’t in the incoming folder any more.');
        await answer(c.n, null, { path: f.path, size: f.size }, { name: f.name, type: typeOf(f.name) });
      } else if (c.t === 'folders') {
        const lib = await describe(), out: HomeFolder[] = [];
        for (const p of lib?.profiles ?? []) for (const col of p.collections) for (const r of col.roots) if (cfg?.folders?.[r.id] && !out.some(x => x.id === r.id)) out.push({ id: r.id, name: r.name, collection: p.name + ' · ' + col.name });
        await answer(c.n, out, null);
      } else if (c.t === 'move-incoming') {
        const to = cfg?.folders?.[c.folder];
        if (!to) throw new Error('GLUE Home doesn’t know that music folder.');
        await answer(c.n, await bridge.incomingMove(c.name, to), null);
        report(state, text);
      }
    }, c.n);
  };
}

/** Find the shared collections' music folders by themselves (at start, and when the settings change);
    what's found is remembered, so songs play at once. */
let finding: Promise<void> | null = null, again = false;
async function findFolders() {
  if (finding) { again = true; return; }
  finding = (async () => {
    do {
      again = false;
      if (!cfg?.glue) { library = undefined; report(state, text); continue; }
      library = { searching: true, found: 0, missing: [] }; report(state, text);
      const r = await locateAll(cfg).catch(() => ({ folders: {}, missing: [] }));
      const merged = { ...(cfg.folders ?? {}), ...r.folders };
      if (JSON.stringify(merged) !== JSON.stringify(cfg.folders ?? {})) { cfg = { ...cfg, folders: merged }; await bridge.saveConfig(cfg).catch(() => {}); }
      library = { searching: false, found: Object.keys(r.folders).length, missing: r.missing };
      report(state, text);
      // Then the mini spectrograms and analyses it doesn't have yet, gently in the background.
      void cache.background(() => cfg, () => !!receiving || serving > 0, () => report(state, text));
    } while (again);
  })().finally(() => { finding = null; });
}

// ---- wiring ---------------------------------------------------------------------------------------
async function boot() {
  cfg = await bridge.config();
  if (cfg && cfg.running === undefined) cfg = { ...cfg, running: true };
  // The token that lets the website on this computer use the local link.
  if (cfg && !cfg.localToken) { cfg = { ...cfg, localToken: [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('') }; await bridge.saveConfig(cfg).catch(() => {}); }
  // Songs already waiting without an analysis (arrived while it was off, or before this version).
  void (async () => { for (const f of await bridge.incomingList().catch(() => [])) await cache.analyseIncoming(f.name, f.path, f.size).catch(() => {}); })();
  // The website's GLUE folder, when it's in a usual place and none was chosen.
  if (cfg && !cfg.glue) { const g = await bridge.findGlue().catch(() => null); if (g) { cfg = { ...cfg, glue: g }; await bridge.saveConfig(cfg).catch(() => {}); } }
  start();
  await bridge.onControl(async what => {
    if (!cfg) return;
    const running = what !== 'stop';
    if (cfg.running !== running) { cfg = { ...cfg, running }; await bridge.saveConfig(cfg).catch(() => {}); }
    if (what === 'stop') stop(); else start();
  });
  // New settings (joined an account, another incoming folder): reconnect if the account changed.
  await bridge.onConfig(c => {
    const before = cfg;
    cfg = c;
    if (before?.glue !== c.glue || JSON.stringify(before?.serve ?? {}) !== JSON.stringify(c.serve ?? {}) || JSON.stringify(before?.folders ?? {}) !== JSON.stringify(c.folders ?? {})) void findFolders();
    if (!before || before.deviceId !== c.deviceId || before.token !== c.token || before.running !== c.running || (before.api ?? '') !== (c.api ?? '')) start();
    else report(state, text);
  });
  await bridge.onAskStatus(() => report(state, text));
  void findFolders();
  // Updates by itself: a minute after starting, then every six hours, when nothing is being sent.
  const auto = async () => {
    if (cfg?.autoUpdate === false || receiving || serving) return;
    const u = await findUpdate().catch(() => null);
    if (!u || receiving || serving) return;
    report(state, 'Updating to ' + u.version + '…');
    await install(u).catch(e => report(state, 'Update failed: ' + ((e as Error).message || e)));
  };
  setTimeout(() => void auto(), 60_000);
  setInterval(() => void auto(), 6 * 3600e3);
}
void boot();
