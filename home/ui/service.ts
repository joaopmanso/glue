/* GLUE Home's service (ADR 0044), in a hidden window: online in the account's signaling room while
   it's running, and receiving songs sent from the website into the incoming folder. Start / Stop /
   Restart come from the tray and the settings window. */
import { API, bridge, type HomeConfig, type Received, type Status } from './bridge';
import { access, stayOnline } from './cloud';
import { CHUNK, HIGH_WATER, ICE_SERVERS, MAX_FILE, PENDING, frame, unframe, isHandshake, type Ctrl, type Handshake, type HomeFolder, type StreamReply, type StreamReq } from '../../src/core/transfer';
import type { DetailsHeader } from '../../src/store/details';
import * as cache from './cache';
import * as lookup from './lookup';
import { backupDaily } from './backups';
import { syncSharedHere } from './sharedSync';
import { followMoves } from './moves';
import * as analysis from './analysis';
import { describe, locate, locateAll, newlyFound, trackPath, folderOf, found } from './library';
import { findUpdate, install, version } from './updates';
import { admit, maxOf, sessionKey } from './sessions';
import * as engine from './engine';
import { checkReminders } from './reminders';
import { whoAmI } from './identity';
import * as ice from './ice';

let cfg: HomeConfig | null = null;
let room: ReturnType<typeof stayOnline> | null = null;
let state: Status['state'] = 'stopped', text = 'Starting…';
let receiving: Status['receiving'] = null;
let serving = 0;   // songs being sent to another computer right now
let library: Status['library'] = undefined;
let reminders: Status['reminders'] = undefined;
const peers = new Map<string, RTCPeerConnection>();   // handshake id → connection
/** A connection not open by then is let go (ADR 0132). */
const SETUP_MS = 30_000;
/** Sessions (ADR 0133): one per device's tab, at most `maxSessions` (the settings; 5 unless changed). A device whose
    tab connects again replaces its own; a new one when full is refused, with why. */
interface Session { key: string; from: string; name: string; since: number; last: number; calls: number; pc: RTCPeerConnection; chan?: RTCDataChannel }
const sessions = new Map<string, Session>();
/** Disconnected in the settings: refused for an hour (its tab would only connect again). */
const refused = new Map<string, number>();
const maxSessions = () => maxOf(cfg?.maxSessions);
let myVersion = '';
void version().then(v => (myVersion = v)).catch(() => {});
/** What happened here, said to every session at once (ADR 0133): devices stop asking again and again. */
function tell(e: StreamReply) { const s = JSON.stringify(e); for (const x of sessions.values()) if (x.chan?.readyState === 'open') try { x.chan.send(s); } catch { /* closing */ } }
/** Songs analysed here, said together half a second later (a batch analyses many). */
const made = new Map<string, Set<string>>();
let madeTimer = 0;
cache.onMade.f = (p, c, id) => {
  if (!sessions.size) return;
  const k = p + '|' + c;
  (made.get(k) ?? made.set(k, new Set()).get(k)!).add(id);
  if (!madeTimer) madeTimer = window.setTimeout(() => {
    madeTimer = 0;
    for (const [pc, ids] of made) { const [profile, collection] = pc.split('|'); tell({ t: 'event', kind: 'made', profile, collection, tracks: [...ids] }); }
    made.clear();
  }, 500);
};
function endSession(key: string) { const s = sessions.get(key); if (!s) return; sessions.delete(key); s.pc.close(); servedSoon(); }
const early = new Map<string, (RTCIceCandidateInit | null)[]>();   // candidates that came before their connection
const located = new Map<string, { path: string; name: string; until: number }>();   // songs being streamed: where they are
const lookingUp = new Map<string, ReturnType<typeof trackPath>>();   // a song being looked for now: its lookup, shared
/** What other devices asked since GLUE Home started (ADR 0083), by kind: shown in the settings. */
const served: Record<string, { calls: number; ms: number; bytes: number }> = {};

const apiOf = (c: HomeConfig) => c.api || API;
/** Running unless stopped: settings that never said (Start or Stop never pressed) mean running. */
const isRunning = (c: HomeConfig | null | undefined) => !!c && c.running !== false;
/** What GLUE Home did lately (the settings window shows each new one as a toast), newest first. */
const events: { at: number; text: string }[] = [];
function event(text: string) { events.unshift({ at: Date.now(), text }); if (events.length > 30) events.length = 30; servedSoon(); }
/** What was asked shows in the settings a moment after (at most every 2 s, ADR 0083). */
let servedTimer = 0;
const servedSoon = () => { if (!servedTimer) servedTimer = window.setTimeout(() => { servedTimer = 0; report(state, text); }, 2000); };
function report(s: Status['state'], t: string) {
  state = s; text = t;
  const status: Status = { state, text, running: isRunning(cfg) && s !== 'unpaired' && s !== 'removed', receiving, received: cfg?.received ?? [], library, analysis: { ...cache.progress.background }, analysing: structuredClone(analysis.state), engine: engine.status(), events: events.slice(), reminders, served: structuredClone(served), sessions: { list: [...sessions.values()].map(s => ({ key: s.key, name: s.name, since: s.since, last: s.last, calls: s.calls, open: s.pc.connectionState === 'connected' })), max: maxSessions() }, computer: { id: cfg?.computer ?? null, why: cfg?.computerWhy ?? '' } };
  void bridge.status(status);
  void bridge.trayStatus(t, status.running).catch(() => {});
  const el = document.getElementById('state');
  if (el) el.textContent = t;
}

function start() {
  stop(false);
  if (!cfg?.deviceId || !cfg.token) return report('unpaired', 'Not connected to a GLUE account');
  if (!isRunning(cfg)) return report('stopped', 'Stopped');
  report('connecting', 'Connecting…');
  room = stayOnline(apiOf(cfg), cfg.deviceId, cfg.token, e => {
    if (e.type === 'online') { learnComputer(); report('online', 'Online as ' + cfg!.name + (cfg!.user?.email ? ' · ' + cfg!.user.email : '')); void ice.iceServers(apiOf(cfg!), cfg!.deviceId!, cfg!.token!); }
    else if (e.type === 'offline') report('offline', 'Offline: ' + e.why);
    else if (e.type === 'replaced') report('stopped', 'Stopped: GLUE Home started on another computer with this account’s same device');
    else if (e.type === 'removed') void unpaired();
    else if (e.type === 'signal') void onSignal(e.from, e.data);
    // A shared collection changed on another device (ADR 0097): taken in here when no GLUE tab is open.
    else if (e.type === 'shared' && e.from !== cfg?.deviceId) sharedSoon();
  });
}
function stop(say = true) {
  room?.stop(); room = null;
  for (const pc of peers.values()) pc.close();
  peers.clear(); sessions.clear();
  if (say) report(cfg?.deviceId ? 'stopped' : 'unpaired', cfg?.deviceId ? 'Stopped' : 'Not connected to a GLUE account');
}
/** Removed from the account on the website: forget the credential. */
async function unpaired() {
  const gone = cfg?.deviceId;
  stop(false);
  // Connecting again with a new code removes the old device: then the settings hold the new one.
  const now = await bridge.config().catch(() => null);
  if (now && now.deviceId && now.deviceId !== gone) { cfg = now; start(); return; }
  if (cfg) cfg = await bridge.patchConfig(() => ({ deviceId: null, token: null, user: null })).catch(() => cfg) ?? cfg;
  report('removed', 'Removed from the GLUE account: connect again in the settings');
}

// ---- receiving songs ------------------------------------------------------------------------------
async function onSignal(from: string, data: unknown) {
  if (!isHandshake(data) || !room) return;
  const say = (h: Handshake) => room?.send(from, h);
  if (data.t === 'offer') {
    try {
      // A session per device's tab (ADR 0133). An older website says no tab: each of its connections is one.
      const key = sessionKey(from, data.tab, data.id), name = data.name || 'Another device';
      // This computer's own browser isn't counted, nor ever refused for room (ADR 0137): the limit is other devices'.
      const own = !!cfg?.computer && from === cfg.computer;
      const others = [...sessions.values()].filter(s => s.from !== cfg?.computer).length;
      const a = admit(key, { has: k => sessions.has(k), size: others }, maxSessions(), refused.get(key), Date.now(), own);
      if (!a.ok && a.why === 'refused') { say({ app: 'glue-send', t: 'bye', id: data.id, reason: 'Disconnected in GLUE Home’s settings on ' + (cfg?.name ?? 'that computer') + '.' }); return; }
      if (a.ok && a.replaces) endSession(key);   // the same tab again (it reconnected): the new one replaces it
      else if (!a.ok) {
        say({ app: 'glue-send', t: 'bye', id: data.id, reason: 'GLUE Home on ' + (cfg?.name ?? 'that computer') + ' is full: ' + others + ' devices connected (raise the limit in its settings).' });
        event(name + ' couldn’t connect: ' + others + ' devices are connected already (the most at once is ' + maxSessions() + ')');
        return;
      }
      // The relay's credentials (ADR 0081), asked for once a day: the other side's first candidates
      // may come meanwhile, so they wait for the connection.
      let servers = ice.iceNow();
      if (!servers && cfg?.deviceId && cfg.token) { early.set(data.id, []); servers = await ice.iceServers(apiOf(cfg), cfg.deviceId, cfg.token); }
      const pc = new RTCPeerConnection({ iceServers: servers ?? ICE_SERVERS });
      peers.set(data.id, pc);
      const session: Session = { key, from, name, since: Date.now(), last: Date.now(), calls: 0, pc };
      sessions.set(key, session);
      servedSoon();
      const waiting = early.get(data.id) ?? [];
      early.delete(data.id);
      const end = () => { clearTimeout(setup); clearTimeout(gone); if (peers.get(data.id) === pc) peers.delete(data.id); if (sessions.get(key)?.pc === pc) { sessions.delete(key); servedSoon(); } pc.close(); };
      // Not open in time (the other side gave up, or its candidates never came): let it go.
      const setup = window.setTimeout(() => { if (pc.connectionState !== 'connected') end(); }, SETUP_MS);
      pc.onicecandidate = e => say({ app: 'glue-send', t: 'ice', id: data.id, candidate: e.candidate?.toJSON() ?? null });
      // "disconnected" often passes (a phone moving between Wi-Fi and mobile data): only give up if it stays.
      let gone = 0;
      pc.onconnectionstatechange = () => {
        clearTimeout(gone);
        if (pc.connectionState === 'connected') { clearTimeout(setup); servedSoon(); }   // the settings show it open
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') end();
        else if (pc.connectionState === 'disconnected') gone = window.setTimeout(end, 15_000);
      };
      pc.ondatachannel = ev => ev.channel.label === 'stream' ? serve(ev.channel, session) : receive(ev.channel, from);
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      for (const c of waiting) await pc.addIceCandidate(c ?? undefined).catch(() => {});
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      say({ app: 'glue-send', t: 'answer', id: data.id, sdp: answer.sdp ?? '' });
    } catch (e) {
      // Said, not left unanswered: the other side shows why at once instead of waiting for its time-out.
      const broken = peers.get(data.id);
      broken?.close(); peers.delete(data.id); early.delete(data.id);
      for (const [k, s] of sessions) if (s.pc === broken) sessions.delete(k);
      const why = (e as Error).message || String(e);
      say({ app: 'glue-send', t: 'bye', id: data.id, reason: 'GLUE Home couldn’t take the connection: ' + why });
      event('A connection couldn’t be set up: ' + why);
    }
  } else if (data.t === 'ice') {
    const wait = early.get(data.id);
    if (wait) wait.push(data.candidate ?? null);
    else await peers.get(data.id)?.addIceCandidate(data.candidate ?? undefined).catch(() => {});
  }
  else if (data.t === 'bye') { peers.get(data.id)?.close(); peers.delete(data.id); early.delete(data.id); }
}

function receive(dc: RTCDataChannel, from: string) {
  dc.binaryType = 'arraybuffer';
  const reply = (c: Ctrl) => { if (dc.readyState === 'open') dc.send(JSON.stringify(c)); };
  let cur: { n: number; id: number; name: string; size: number; got: number; error: string } | null = null;
  // One step at a time, in order: a file starts, its bytes are written, it ends.
  let chain: Promise<void> = Promise.resolve();
  const fromName = () => 'another device';
  dc.onopen = () => reply({ t: 'ready', name: cfg?.name ?? 'GLUE Home' });
  // On a session (ADR 0133) the channel can come already open: no `open` event then.
  if (dc.readyState === 'open') reply({ t: 'ready', name: cfg?.name ?? 'GLUE Home' });
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
        // TO BE SORTED changed: said once it's analysed, so devices show it with its waveform (ADR 0133).
        void cache.analyseIncoming(f.name, path, f.size).catch(e => console.warn('GLUE Home: couldn’t analyse', f.name, e)).finally(() => tell({ t: 'event', kind: 'incoming' }));
        const r: Received = { name: f.name, path, from: fromName(), at: Date.now(), size: f.size };
        if (cfg) cfg = await bridge.patchConfig(cur => ({ received: [r, ...(cur.received ?? [])].slice(0, 30) })).catch(() => cfg) ?? cfg;
        reply({ t: 'saved', n: f.n, name: f.name });
        event('Received ' + f.name + ' from ' + r.from);
      }
      report(state, text);
    }
  }
  void from;
}

// ---- playing this computer's songs on another (ADR 0045) -----------------------------------------
const TYPES: Record<string, string> = { mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', alac: 'audio/mp4' };
function serve(dc: RTCDataChannel, session?: Session) {
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = HIGH_WATER / 4;
  const send = (c: StreamReply) => { if (dc.readyState === 'open') dc.send(JSON.stringify(c)); };
  const drained = () => new Promise<void>(res => { if (dc.bufferedAmount <= HIGH_WATER) return res(); const f = () => { dc.removeEventListener('bufferedamountlow', f); res(); }; dc.addEventListener('bufferedamountlow', f); });
  /** An answer: `data`, then bytes (all at once, or read from a file in 1 MB steps), then the end. */
  const answer = async (n: number, data: unknown, bytes: Uint8Array | { path: string; size: number } | null, extra: { name?: string; type?: string } = {}) => {
    const size = bytes ? ('path' in bytes ? bytes.size : bytes.length) : 0;
    const w = whatOf.get(n); if (w) served[w].bytes += size;
    send({ t: 'meta', n, size, data, ...extra });
    // Each binary message carries its request's number, so answers can go out at the same time (ADR 0047).
    const push = async (block: Uint8Array) => { for (let i = 0; i < block.length; i += CHUNK) { await drained(); if (dc.readyState !== 'open') return; dc.send(frame(n, block.subarray(i, Math.min(block.length, i + CHUNK)))); } };
    if (bytes && 'path' in bytes) for (let at = 0; at < bytes.size;) { const b = new Uint8Array(await bridge.fileRead(bytes.path, at, 1024 * 1024, true)); if (!b.length) break; await push(b); at += b.length; }
    else if (bytes) await push(bytes);
    send({ t: 'eof', n, type: extra.type });
  };
  const need = () => { if (!cfg?.glue) throw new Error('GLUE Home doesn’t know this computer’s GLUE folder: choose it in its settings.'); return cfg; };
  const typeOf = (name: string) => TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
  // What the website on this computer hands over ('put'): its bytes arrive after the request, by number.
  const uploads = new Map<number, { req: Extract<StreamReq, { t: 'put' }>; parts: Uint8Array[]; got: number }>();
  // Requests run at the same time: a slow one (an analysis) doesn't hold up the others.
  // Each counted (ADR 0083): what other devices ask, how often, the time it takes.
  const whatOf = new Map<number, string>();
  const step = (f: () => Promise<void>, n: number, what: string) => {
    const t0 = performance.now(), row = served[what] ??= { calls: 0, ms: 0, bytes: 0 };
    whatOf.set(n, what);
    void (async () => { serving++; try { await f(); } catch (err) { send({ t: 'error', n, error: (err as Error).message || String(err) }); } finally { serving--; row.calls++; row.ms += performance.now() - t0; whatOf.delete(n); servedSoon(); } })();
  };
  // A session (ADR 0133): said first, so the website knows it may ping, send songs on it, and hear what happens.
  if (session && !session.chan) session.chan = dc;   // what happens here is said on its first channel
  const hello = () => send({ t: 'session', version: myVersion, max: maxSessions() });
  if (dc.readyState === 'open') hello(); else dc.addEventListener('open', hello, { once: true });
  dc.onmessage = e => {
    if (session) session.last = Date.now();
    if (typeof e.data !== 'string') { const f = unframe(e.data as ArrayBuffer), u = uploads.get(f.n); if (u) { u.parts.push(f.data.slice()); u.got += f.data.length; } return; }
    const c = JSON.parse(e.data) as StreamReq;
    // The heartbeat: answered at once, not counted as something asked.
    if (c.t === 'ping') { send({ t: 'meta', n: c.n, size: 0, data: 'pong' }); send({ t: 'eof', n: c.n }); return; }
    if (session) session.calls++;
    if (c.t === 'put') { uploads.set(c.n, { req: c, parts: [], got: 0 }); return; }
    if (c.t === 'end') {
      const u = uploads.get(c.n); uploads.delete(c.n);
      if (!u) return;
      step(async () => {
        const bytes = new Uint8Array(u.got); let at = 0;
        for (const p of u.parts) { bytes.set(p, at); at += p.length; }
        const r = u.req;
        if (r.kind === 'thumb') await cache.putThumb(r.profile, r.collection, r.track, bytes);
        else if (r.kind === 'wave') await cache.putWave(r.profile, r.collection, r.track, bytes);
        else if (r.kind === 'art') { if (r.hash && (r.px === 64 || r.px === 320)) await cache.putArt(r.hash, r.px, bytes); }
        else await cache.putDetails(r.profile, r.collection, r.track, r.header as DetailsHeader, bytes);
        await answer(r.n, null, null);
      }, c.n, 'put ' + u.req.kind);
      return;
    }
    step(async () => {
      // Asked with a folder that isn't this collection's (a computer's entry that named the wrong one, ADR 0108):
      // the folder that has it.
      const pc = c as { profile?: string; collection?: string };
      if (pc.profile && pc.collection) pc.profile = await folderOf(pc.profile, pc.collection);
      // A song streamed to another device: the analysis lets it go first (ADR 0138).
      if (c.t === 'get' || c.t === 'range') cache.playing.at = Date.now();
      if (c.t === 'get') {
        const seen = { ...(need().folders ?? {}) };
        const f = await trackPath(c.profile, c.collection, c.track, need());
        // A music folder found by name: remember it (and GLUE Home may read it from now on).
        if (f.folder) await keepFound(f.folder.id, f.folder.path, seen);
        await answer(c.n, null, { path: f.path, size: await bridge.fileSize(f.path) }, { name: f.name, type: typeOf(f.name) });
      } else if (c.t === 'range') {
        // Part of a song (streaming, ADR 0076): a collection's song, or one in the incoming folder.
        let path: string, name: string;
        if (c.incoming) {
          const f = (await bridge.incomingList()).find(x => x.name === c.incoming);
          if (!f) throw new Error('That song isn’t in the incoming folder any more.');
          path = f.path; name = f.name;
        } else {
          // A song streams in many parts: where it is is looked up once a minute, not for each part.
          const key = c.profile + '/' + c.collection + '/' + c.track, known = located.get(key);
          if (known && known.until > Date.now()) ({ path, name } = known);
          else {
            const seen = { ...(need().folders ?? {}) };
            const f = await (lookingUp.get(key) ?? (() => { const p = trackPath(c.profile!, c.collection!, c.track!, need()); lookingUp.set(key, p); void p.catch(() => {}).finally(() => lookingUp.delete(key)); return p; })());
            if (f.folder) await keepFound(f.folder.id, f.folder.path, seen);
            path = f.path; name = f.name;
            located.set(key, { path, name, until: Date.now() + 60_000 });
            if (located.size > 200) located.delete(located.keys().next().value!);
          }
        }
        const total = await bridge.fileSize(path), start = Math.max(0, Math.min(c.start, total)), len = Math.max(0, Math.min(c.len, 8 * 1024 * 1024, total - start));
        const parts: Uint8Array[] = [];
        for (let at = 0; at < len;) { const b = new Uint8Array(await bridge.fileRead(path, start + at, Math.min(1024 * 1024, len - at), true)); if (!b.length) break; parts.push(b); at += b.length; }
        const bytes = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0;
        for (const p of parts) { bytes.set(p, at); at += p.length; }
        await answer(c.n, { total, type: typeOf(name) }, bytes, { name });
      } else if (c.t === 'thumbs') {
        need();
        const found: [string, number][] = [], parts: Uint8Array[] = [];
        for (const id of c.tracks.slice(0, 200)) {
          // Waveforms (ADR 0085): kept, or made now from the kept full analysis.
          const b = c.wave ? await cache.wave(c.profile, c.collection, id) ?? await cache.waveFromDetails(c.profile, c.collection, id) : await cache.thumb(c.profile, c.collection, id);
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
        await answer(c.n, { ...await cache.kept(c.profile, c.collection), art: await cache.artKept() }, null);
      } else if (c.t === 'art') {
        // Songs' covers (ADR 0082): kept, or read from the song's tags now (and kept for next time).
        const conf = need(), px = c.px === 320 ? 320 : 64;
        const found: [string, string, number][] = [], parts: Uint8Array[] = [];
        for (const it of c.items.slice(0, 60)) {
          let hash = it.hash ?? '', b = hash ? await cache.art(hash, px) : null;
          if (!b) { hash = await cache.coverHash(c.profile, c.collection, it.track, conf).catch(() => ''); b = hash ? await cache.art(hash, px) : null; }
          found.push([it.track, hash, b?.length ?? 0]);
          if (b) parts.push(b);
        }
        const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0;
        for (const p of parts) { all.set(p, at); at += p.length; }
        await answer(c.n, found, all);
      } else if (c.t === 'find-art') {
        // Covers from public services (ADR 0086): known, or looked up now (the device asks again).
        const px = c.px === 320 ? 320 : 64;
        const found: [string, string, number][] = [], parts: Uint8Array[] = [];
        for (const it of c.items.slice(0, 60)) {
          const q = { artist: it.artist ?? '', album: it.album ?? '', title: it.title ?? '' };
          if (c.refuse) { await lookup.refuse(q); found.push([it.id, '', 0]); continue; }
          const hash = await lookup.known(q);
          if (hash === undefined) { lookup.want(q); found.push([it.id, '?', 0]); continue; }
          const b = hash && hash !== 'x' ? await cache.art(hash, px) : null;
          found.push([it.id, b ? hash : '', b?.length ?? 0]);
          if (b) parts.push(b);
        }
        const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0;
        for (const p of parts) { all.set(p, at); at += p.length; }
        await answer(c.n, found, all);
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
      } else if (c.t === 'analysis') {
        // The analysis of this computer's songs (ADR 0103): asked about, paused, songs asked for now; the tab on
        // this computer takes the results in (and says which).
        if (c.take) analysis.delegate();
        // Paused from a GLUE tab: kept in the settings, like a pause there (the settings window shows it).
        if (c.pause !== undefined && cfg && !!cfg.analysisPaused !== c.pause) { cfg = await bridge.patchConfig(() => ({ analysisPaused: c.pause })).catch(() => cfg) ?? cfg; analysis.setPaused(!!c.pause, () => cfg); }
        if (c.now?.length) analysis.now(c.profile, c.collection, c.now, c.names ?? {}, () => cfg);
        if (c.taken?.length) await analysis.taken(c.profile, c.collection, c.taken);
        void analysis.run(() => cfg);
        await answer(c.n, { state: analysis.state, waiting: analysis.waitingIn(c.profile, c.collection).slice(0, 200) }, null);
      } else if (c.t === 'local') {
        // The website on this computer: how to reach GLUE Home without GLUE Cloud (ADR 0048).
        // The read-only token too: a GLUE tab here reads, and asks the engine for every change (ADR 0104).
        await answer(c.n, { port: await bridge.localPort(), token: cfg?.localToken ?? null, readToken: cfg?.readToken ?? null }, null);
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
        tell({ t: 'event', kind: 'incoming' });
        report(state, text);
      }
    }, c.n, c.t);
  };
}

/** Find the shared collections' music folders by themselves (at start, and when the settings change);
    what's found is remembered, so songs play at once. */
let finding: Promise<void> | null = null, again = false;
let sharedTimer: ReturnType<typeof setTimeout> | undefined;
/** Sync the shared collections in a moment (several nudges at once make one). */
function sharedSoon(ms = 1500) {
  clearTimeout(sharedTimer);
  sharedTimer = setTimeout(() => { if (cfg?.running !== false && cfg) void syncSharedHere(cfg, apiOf(cfg)).then(n => { if (n) event('Took in ' + n + ' change' + (n === 1 ? '' : 's') + ' from your other devices'); }).catch(e => console.warn('GLUE Home: couldn’t sync the shared collections', e)); }, ms);
}

async function findFolders() {
  if (finding) { again = true; return; }
  finding = (async () => {
    do {
      again = false;
      if (!cfg?.glue) { library = undefined; report(state, text); continue; }
      library = { searching: true, found: 0, missing: [] }; report(state, text);
      const before = { ...(cfg.folders ?? {}) };
      const r = await locateAll(cfg).catch(() => ({ folders: {} as Record<string, string>, missing: [] }));
      // Only what the search found anew, and only where nothing changed meanwhile: a folder picked while
      // it searched (the website's "Add folder") is never put back to what it was.
      const next = await bridge.patchConfig(cur => { const f = newlyFound(before, r.folders, cur.folders ?? {}); return f ? { folders: f } : null; }).catch(() => null);
      if (next) cfg = next;
      library = { searching: false, found: Object.keys(r.folders).length, missing: r.missing };
      report(state, text);
      // Then the mini spectrograms and analyses it doesn't have yet, gently in the background.
      // (after the library's own analysis: it makes these too.)
      void cache.background(() => cfg, () => cfg?.running === false || !!receiving || serving > 0 || analysis.state.running > 0 || analysis.state.left > 0, () => report(state, text));
    } while (again);
  })().finally(() => { finding = null; });
}

// ---- wiring ---------------------------------------------------------------------------------------
/** A request to the library engine (ADR 0104), from a GLUE tab on this computer. */
type Rpc =
  | { op: 'hello' } | { op: 'wait'; since: number } | { op: 'status' } | { op: 'open'; p: string; c: string }
  | { op: 'edit'; p: string; c: string; ops: import('../../src/store/collection').StoreOp[] }
  | { op: 'analyse'; p: string; c: string; ids: string[]; names?: Record<string, string> }
  | { op: 'pause'; on: boolean }
  | { op: 'restamp'; p: string; c: string; id: string; was: { size: number | null; mtime: number | null }; now: { size: number; mtime: number } }
  | { op: 'job'; kind: 'remove-tracks'; p: string; c: string; ids: string[] }
  | { op: 'where'; id: string; name: string; sample: string }
  | { op: 'whereFile'; name: string; size: number; roots: string[] };
async function rpc(b: Rpc): Promise<unknown> {
  const c = cfg;
  if (!c) throw new Error('GLUE Home isn’t set up yet');
  switch (b.op) {
    // `computer`: which computer this is (ADR 0108), for a GLUE tab here to see the library as.
    case 'hello': return { engine: 1, version: await version().catch(() => ''), rev: engine.status().rev, computer: c.computer ?? null };
    case 'wait': return engine.wait(Number(b.since) || 0);
    case 'open': engine.drop(b.p, b.c); return { ok: true };
    case 'status': return { ...engine.status(), analysis: analysis.state };
    case 'edit': {
      const r = await engine.edit(c, b.p, b.c, b.ops);
      if (r.added) analysis.added(() => cfg);   // songs new to it (a scan): looked for now
      return r;
    }
    // A GLUE tab here wrote a song's tags (ADR 0110): what's kept of it follows the file.
    case 'restamp': await cache.restamp(b.p, b.c, b.id, b.was, b.now); return { ok: true };
    case 'analyse': analysis.now(b.p, b.c, b.ids, b.names ?? {}, () => cfg); return { ok: true };
    case 'pause':
      if (!!c.analysisPaused !== !!b.on) { cfg = await bridge.patchConfig(() => ({ analysisPaused: !!b.on })).catch(() => cfg) ?? cfg; analysis.setPaused(!!b.on, () => cfg); }
      return { paused: !!b.on };
    case 'job': await engine.addJob(() => cfg, { kind: b.kind, p: b.p, c: b.c, ids: b.ids }); return { queued: true };
    // A song dropped onto a GLUE tab here (ADR 0125): where it is, and the collection's music folder it's in, if one.
    case 'whereFile': {
      const folders = Object.entries(c.folders ?? {}).filter(([id]) => b.roots.includes(id));
      const at = await bridge.findFile(b.name, b.size, folders.map(f => f[1])).catch(() => null);
      if (!at) return { path: null };
      const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, ''), low = (p: string) => /^[a-z]:\//i.test(p) ? p.toLowerCase() : p;
      for (const [id, dir] of folders) {
        const d = norm(dir), f = norm(at);
        if (low(f).startsWith(low(d) + '/')) return { path: at, folder: { id, relPath: f.slice(d.length + 1) } };
      }
      return { path: at };
    }
    // A folder dropped onto a GLUE tab here (the browser doesn't say where it is): found, and remembered as `id`.
    case 'where': {
      // Dropped just now (ADR 0134): a brief search, then the website has GLUE Home's dialog ask (a network folder is on
      // no drive here, and a long search showed nothing for seconds).
      const at = await locate({ id: b.id, name: b.name, absPath: null, handleKey: '', addedAt: '' }, b.sample ? { relPath: b.sample, importPath: null } : null, c, { secs: 5 });
      return { path: at };
    }
    default: throw new Error('GLUE Home doesn’t know that request');
  }
}

/** Which computer this is (ADR 0108): asked of GLUE Cloud (and this disk's music folders); saved when it
    changes, and then everything here reads the library as that computer again (and puts right what was written
    under another id). An unreachable GLUE Cloud changes nothing. */
let learning: Promise<void> | null = null;
function learnComputer() {
  const c0 = cfg;
  if (learning || !c0?.deviceId || !c0.token) return;
  learning = (async () => {
    const who = await whoAmI(c0, apiOf(c0)).catch(() => null);
    if (!who || (who.computer === (cfg?.computer ?? null) && who.why === (cfg?.computerWhy ?? ''))) return;
    await setComputer(who.computer, who.why);
  })().finally(() => { learning = null; });
}
async function setComputer(computer: string | null, why: string) {
  const was = cfg?.computer ?? null;
  cfg = await bridge.patchConfig(() => ({ computer, computerWhy: why })).catch(() => cfg) ?? cfg;
  if (computer === was) { report(state, text); return; }
  engine.forget();
  event(computer ? 'This computer is known (' + why + '): its songs are read and written as its own' : 'Which computer this is isn’t known (' + why + '): nothing is written for it');
  report(state, text);
  if (computer) { void analysis.run(() => cfg); sharedSoon(); }
}

/** New settings (joined an account, another incoming folder, a folder picked): acted on, reconnecting when
    the account changed. */
async function listenConfig() {
  await bridge.onConfig(c => {
    const before = cfg;
    cfg = c;
    if (before?.glue !== c.glue || JSON.stringify(before?.serve ?? {}) !== JSON.stringify(c.serve ?? {}) || JSON.stringify(before?.folders ?? {}) !== JSON.stringify(c.folders ?? {})) void findFolders();
    if (!!before?.analysisPaused !== !!c.analysisPaused) analysis.setPaused(!!c.analysisPaused, () => cfg);
    if (!before || before.deviceId !== c.deviceId || before.token !== c.token || isRunning(before) !== isRunning(c) || (before.api ?? '') !== (c.api ?? '')) start();
    else report(state, text);
  });
}
/** A music folder found by its name while serving (it wasn't where the settings said): kept, unless the
    settings changed that folder meanwhile (`seen`: the folders when the search started). */
async function keepFound(id: string, at: string, seen: Record<string, string>) {
  const next = await bridge.patchConfig(cur => (cur.folders ?? {})[id] === seen[id] ? { folders: { ...(cur.folders ?? {}), [id]: at } } : null).catch(() => null);
  if (next) cfg = next;
}
// A folder found by looking (an analysis, a dropped folder): remembered, unless the settings put it elsewhere meanwhile.
found.f = async (id, at) => { const seen = { ...(cfg?.folders ?? {}) }; if (!seen[id]) await keepFound(id, at, seen); };

async function boot() {
  cfg = await bridge.config();
  // Settings saved by others (the settings window, the local link's folder dialog) are heard from the start.
  await listenConfig();
  // The token that lets the website on this computer use the local link.
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (cfg && !cfg.localToken) cfg = await bridge.patchConfig(cur => cur.localToken ? null : { localToken: token }).catch(() => cfg) ?? cfg;
  // And the read-only one, for a GLUE tab while GLUE Home is the library's engine (ADR 0104).
  const readToken = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (cfg && !cfg.readToken) cfg = await bridge.patchConfig(cur => cur.readToken ? null : { readToken }).catch(() => cfg) ?? cfg;
  // The library's engine (ADR 0104): a GLUE tab's requests, from the local link.
  await bridge.onRpc(m => void (async () => {
    let out: unknown;
    try { out = await rpc(JSON.parse(m.body)); } catch (e) { out = { error: (e as Error).message || String(e) }; }
    await bridge.rpcReply(m.id, JSON.stringify(out)).catch(() => {});
  })());
  // Songs already waiting without an analysis (arrived while it was off, or before this version).
  void (async () => { for (const f of await bridge.incomingList().catch(() => [])) await cache.analyseIncoming(f.name, f.path, f.size).catch(() => {}); })();
  // The website's GLUE folder, when it's in a usual place and none was chosen.
  if (cfg && !cfg.glue) { const g = await bridge.findGlue().catch(() => null); if (g) cfg = await bridge.patchConfig(cur => cur.glue ? null : { glue: g }).catch(() => cfg) ?? cfg; }
  start();
  // Stopped, GLUE Home does nothing: offline, nothing analysed, synced or written, and the local link answers only
  // GLUE Home's own windows, so a GLUE tab here carries on in the browser as if it were quit (2026-10-01: Stop only
  // went offline). Start carries on; Restart also starts the engine and the analysis over.
  await bridge.onControl(async what => {
    if (!cfg) return;
    const running = what !== 'stop';
    if (isRunning(cfg) !== running) cfg = await bridge.patchConfig(() => ({ running })).catch(() => cfg) ?? cfg;
    if (what === 'stop') { stop(); event('Stopped: GLUE in the browser carries on by itself'); return; }
    if (what === 'restart') { engine.forget(); analysis.restart(); }
    start();
    event(what === 'restart' ? 'Restarted' : 'Started');
    void analysis.run(() => cfg); sharedSoon(); void findFolders();
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
  // Events that need music (ADR 0074): a look soon after starting, then every hour; Check now in the settings.
  const remind = async (again = false) => {
    const r = await checkReminders(cfg, new Date(), again).catch(() => null);
    if (r) { reminders = { at: Date.now(), coming: r.coming, sent: r.sent }; report(state, text); }
  };
  await bridge.onRemindNow(() => void remind(true));
  await bridge.onDisconnect(key => { const name = sessions.get(key)?.name ?? 'a device'; refused.set(key, Date.now() + 3600e3); endSession(key); event('Disconnected ' + name + ' (refused for an hour)'); });
  // A browser on this computer joins it (ADR 0091): GLUE Home, which it reached on 127.0.0.1, vouches for it.
  await bridge.onAttach(body => void (async () => {
    const browser = (JSON.parse(body || '{}') as { browser?: string }).browser;
    if (!browser || !cfg?.deviceId || !cfg.token) return;
    const api = apiOf(cfg), t = await access(api, cfg.deviceId, cfg.token);
    const r = await fetch(api + '/v1/computer/attach', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ browser }) });
    if (!r.ok) { console.warn('GLUE Home: couldn’t attach the browser', r.status, await r.text().catch(() => '')); return; }
    // The device it's now: this computer (ADR 0108).
    const j = await r.json().catch(() => ({})) as { device?: string };
    if (j.device) await setComputer(j.device, 'a GLUE tab on this computer');
  })().catch(e => console.warn('GLUE Home: couldn’t attach the browser', e)));
  setInterval(learnComputer, 3600e3);
  setTimeout(() => void remind(), 90_000);
  setInterval(() => void remind(), 3600e3);
  // A collection that went into another (ADR 0102): this cache follows it, soon after starting and hourly.
  const moves = () => void (cfg?.running === false ? Promise.resolve() : followMoves(cfg)).catch(e => console.warn('GLUE Home: the cache didn’t follow a moved collection', e));
  setTimeout(moves, 30_000);
  setInterval(moves, 3600e3);
  // The engine's jobs (ADR 0104): carried on after a restart; a GLUE tab from before the engine (it holds the
  // lease and writes by itself): nothing the engine keeps may go stale meanwhile.
  engine.on.event = event;
  engine.on.changed = servedSoon;
  // What the tab changed goes up to GLUE Cloud within seconds (a burst makes one push, ADR 0106).
  engine.on.edited = () => sharedSoon(2000);
  setTimeout(() => void engine.runJobs(() => cfg), 10_000);
  setInterval(() => { if (cfg?.running !== false) void bridge.leaseHeld().then(held => { if (held) engine.forget(); else void engine.runJobs(() => cfg); }).catch(() => {}); }, 10_000);
  // This computer's songs analysed for the library (ADR 0103): soon after starting, then every minute.
  analysis.setPaused(!!cfg?.analysisPaused, undefined, true);
  analysis.on.changed = servedSoon;
  analysis.on.event = event;
  analysis.on.written = n => { event('Put ' + n + ' analys' + (n === 1 ? 'is' : 'es') + ' into the library'); sharedSoon(); };
  setTimeout(() => { if (cfg?.running !== false) void analysis.run(() => cfg); }, 20_000);
  setInterval(() => { if (cfg?.running !== false) void analysis.run(() => cfg); }, 60_000);
  // Shared collections (ADR 0097): synced here when no GLUE tab is, soon after starting and every minute.
  setTimeout(sharedSoon, 25_000);
  setInterval(sharedSoon, 60_000);
  // The day's backups (ADR 0090), when no GLUE tab here makes them: soon after starting, then hourly.
  const backups = () => { if (cfg?.running !== false) void backupDaily(cfg).catch(e => console.warn('GLUE Home: the daily backup failed', e)); };
  setTimeout(backups, 45_000);
  setInterval(backups, 3600e3);
}
void boot();
