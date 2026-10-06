/* GLUE Home's service (ADR 0044), in a hidden window: online in the account's signaling room while
   it's running, and receiving songs sent from the website into the incoming folder. Start / Stop /
   Restart come from the tray and the settings window. */
import { API, bridge, type HomeConfig, type Received, type Status } from './bridge';
import { access, stayOnline } from './cloud';
import { ICE_SERVERS, isHandshake, type Handshake, type StreamReply } from '../../src/core/transfer';
import * as cache from './cache';
import { backupDaily } from './backups';
import { followMoves } from './moves';
import { newlyFound } from './library';
import { findUpdate, install, version } from './updates';
import { admit, maxOf, sessionKey } from './sessions';
import * as engine from './engine';
import * as verify from './verify';
import { checkReminders } from './reminders';
import { whoAmI } from './identity';
import * as ice from './ice';

let cfg: HomeConfig | null = null;
let room: ReturnType<typeof stayOnline> | null = null;
let state: Status['state'] = 'stopped', text = 'Starting…';
let receiving: Status['receiving'] = null;
let library: Status['library'] = undefined;
let reminders: Status['reminders'] = undefined;
/** The connections, by handshake id (GLUE Home's own, in Rust: ADR 0150): who they're with. */
const conns = new Map<string, { from: string; key: string }>();
/** A connection not open by then is let go (ADR 0132). */
const SETUP_MS = 30_000;
/** Sessions (ADR 0133): one per device's tab, at most `maxSessions` (the settings; 5 unless changed). A device whose
    tab connects again replaces its own; a new one when full is refused, with why. */
interface Session { key: string; from: string; name: string; since: number; last: number; calls: number; id: string; open: boolean }
const sessions = new Map<string, Session>();
/** Disconnected in the settings: refused for an hour (its tab would only connect again). */
const refused = new Map<string, number>();
const maxSessions = () => maxOf(cfg?.maxSessions);
let myVersion = '';
void version().then(v => (myVersion = v)).catch(() => {});
/** What happened here, said to every session at once (ADR 0133): devices stop asking again and again. */
function tell(e: StreamReply) { if (sessions.size) void bridge.rtcTell(e).catch(() => {}); }
/** Songs analysed here, said together half a second later (a batch analyses many). */
const made = new Map<string, Set<string>>();
let madeTimer = 0;
engine.on.made = (p, c, id) => {
  if (!sessions.size) return;
  const k = p + '|' + c;
  (made.get(k) ?? made.set(k, new Set()).get(k)!).add(id);
  if (!madeTimer) madeTimer = window.setTimeout(() => {
    madeTimer = 0;
    for (const [pc, ids] of made) { const [profile, collection] = pc.split('|'); tell({ t: 'event', kind: 'made', profile, collection, tracks: [...ids] }); }
    made.clear();
  }, 500);
};
function endSession(key: string) { const s = sessions.get(key); if (!s) return; sessions.delete(key); conns.delete(s.id); void bridge.rtcClose(s.id).catch(() => {}); servedSoon(); }
const early = new Map<string, (RTCIceCandidateInit | null)[]>();   // candidates that came before their connection
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
  const status: Status = { state, text, running: isRunning(cfg) && s !== 'unpaired' && s !== 'removed', receiving, received: cfg?.received ?? [], library, analysis: engine.background(), analysing: engine.analysisState(), engine: engine.status(), verify: structuredClone(verify.state), events: events.slice(), reminders, served: structuredClone(served), sessions: { list: [...sessions.values()].map(s => ({ key: s.key, name: s.name, since: s.since, last: s.last, calls: s.calls, open: s.open })), max: maxSessions() }, computer: { id: cfg?.computer ?? null, why: cfg?.computerWhy ?? '' } };
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
  for (const id of conns.keys()) void bridge.rtcClose(id).catch(() => {});
  conns.clear(); sessions.clear();
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
      // The relay's credentials (ADR 0081), asked for once a day: the other side's first candidates may come
      // meanwhile (and while the connection is set up), so they wait for it.
      early.set(data.id, []);
      let servers = ice.iceNow();
      if (!servers && cfg?.deviceId && cfg.token) servers = await ice.iceServers(apiOf(cfg), cfg.deviceId, cfg.token);
      const session: Session = { key, from, name, since: Date.now(), last: Date.now(), calls: 0, id: data.id, open: false };
      sessions.set(key, session);
      conns.set(data.id, { from, key });
      servedSoon();
      // Not open in time (the other side gave up, or its candidates never came): let it go.
      const setup = window.setTimeout(() => { if (!session.open) endSession(key); }, SETUP_MS);
      // "disconnected" often passes (a phone moving between Wi-Fi and mobile data): only give up if it stays.
      let gone = 0;
      states.set(data.id, st => {
        clearTimeout(gone);
        if (st === 'connected') { clearTimeout(setup); session.open = true; servedSoon(); }   // the settings show it open
        if (st === 'failed' || st === 'closed') { clearTimeout(setup); if (sessions.get(key) === session) endSession(key); states.delete(data.id); }
        else if (st === 'disconnected') gone = window.setTimeout(() => { if (sessions.get(key) === session) endSession(key); }, 15_000);
      });
      // GLUE Home's own connection (ADR 0150): every channel and byte in Rust; said on each channel as it opens.
      const sdp = await bridge.rtcAnswer(data.id, data.sdp, servers ?? ICE_SERVERS, { version: myVersion, max: maxSessions(), name: cfg?.name ?? 'GLUE Home' });
      for (const c of early.get(data.id) ?? []) await bridge.rtcIce(data.id, c).catch(() => {});
      early.delete(data.id);
      say({ app: 'glue-send', t: 'answer', id: data.id, sdp });
    } catch (e) {
      // Said, not left unanswered: the other side shows why at once instead of waiting for its time-out.
      void bridge.rtcClose(data.id).catch(() => {});
      early.delete(data.id);
      const c = conns.get(data.id);
      conns.delete(data.id);
      if (c && sessions.get(c.key)?.id === data.id) sessions.delete(c.key);
      const why = (e as Error).message || String(e);
      say({ app: 'glue-send', t: 'bye', id: data.id, reason: 'GLUE Home couldn’t take the connection: ' + why });
      event('A connection couldn’t be set up: ' + why);
    }
  } else if (data.t === 'ice') {
    const wait = early.get(data.id);
    if (wait) wait.push(data.candidate ?? null);
    else if (conns.has(data.id)) await bridge.rtcIce(data.id, data.candidate ?? null).catch(() => {});
  }
  else if (data.t === 'bye') { const c = conns.get(data.id); early.delete(data.id); if (c && sessions.get(c.key)?.id === data.id) endSession(c.key); else { conns.delete(data.id); void bridge.rtcClose(data.id).catch(() => {}); } }
}
/** Each connection's state changes (from GLUE Home's own connections), by handshake id. */
const states = new Map<string, (state: string) => void>();

/** A song arrived from another device (written by GLUE Home's own connection, ADR 0150): analysed at once, so it's
    ready in TO BE SORTED (ADR 0048), and remembered in the settings' list. */
async function received(f: { name: string; path: string; size: number }) {
  // TO BE SORTED changed: said once it's analysed, so devices show it with its waveform (ADR 0133).
  void cache.analyseIncoming(f.name, f.path).catch(e => console.warn('GLUE Home: couldn’t analyse', f.name, e)).finally(() => tell({ t: 'event', kind: 'incoming' }));
  const r: Received = { name: f.name, path: f.path, from: 'another device', at: Date.now(), size: f.size };
  if (cfg) cfg = await bridge.patchConfig(cur => ({ received: [r, ...(cur.received ?? [])].slice(0, 30) })).catch(() => cfg) ?? cfg;
  event('Received ' + f.name + ' from ' + r.from);
  report(state, text);
}

// ---- playing this computer's songs on another, and the library's other answers (ADR 0045, 0150, 0156) ------
// Answered by GLUE Home's engine (crates/glue-engine/src/answers.rs) as its connections hand them over; each counted
// here for the settings (`rtc-served`, ADR 0083).

/** Find the shared collections' music folders by themselves (at start, and when the settings change);
    what's found is remembered, so songs play at once. */
let finding: Promise<void> | null = null, again = false;
let sharedTimer: ReturnType<typeof setTimeout> | undefined;
/** Sync the shared collections in a moment (several nudges at once make one). */
function sharedSoon(ms = 1500) {
  clearTimeout(sharedTimer);
  sharedTimer = setTimeout(() => { if (cfg?.running !== false && cfg) void engine.syncShared().then(n => { if (n) event('Took in ' + n + ' change' + (n === 1 ? '' : 's') + ' from your other devices'); }).catch(e => console.warn('GLUE Home: couldn’t sync the shared collections', e)); }, ms);
}

async function findFolders() {
  if (finding) { again = true; return; }
  finding = (async () => {
    do {
      again = false;
      if (!cfg?.glue) { library = undefined; report(state, text); continue; }
      library = { searching: true, found: 0, missing: [] }; report(state, text);
      const before = { ...(cfg.folders ?? {}) };
      const r = await engine.locateAll().catch(() => ({ folders: {} as Record<string, string>, missing: [] }));
      // Only what the search found anew, and only where nothing changed meanwhile: a folder picked while
      // it searched (the website's "Add folder") is never put back to what it was.
      const next = await bridge.patchConfig(cur => { const f = newlyFound(before, r.folders, cur.folders ?? {}); return f ? { folders: f } : null; }).catch(() => null);
      if (next) cfg = next;
      library = { searching: false, found: Object.keys(r.folders).length, missing: r.missing };
      report(state, text);
      // Then the mini spectrograms and analyses it doesn't have yet, gently in the background.
      // (after the library's own analysis: it makes these too.)
      // (in GLUE Home's engine: it waits while GLUE Home works for another device or analyses the library.)
      engine.backgroundRun();
    } while (again);
  })().finally(() => { finding = null; });
}

// ---- wiring ---------------------------------------------------------------------------------------
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
  if (computer) { engine.analysisRun(); sharedSoon(); }
}

/** New settings (joined an account, another incoming folder, a folder picked): acted on, reconnecting when
    the account changed. */
async function listenConfig() {
  await bridge.onConfig(c => {
    const before = cfg;
    cfg = c;
    if (before?.glue !== c.glue || JSON.stringify(before?.serve ?? {}) !== JSON.stringify(c.serve ?? {}) || JSON.stringify(before?.folders ?? {}) !== JSON.stringify(c.folders ?? {})) void findFolders();
    if (!!before?.analysisPaused !== !!c.analysisPaused) engine.setPaused(!!c.analysisPaused);
    if (!before || before.deviceId !== c.deviceId || before.token !== c.token || isRunning(before) !== isRunning(c) || (before.api ?? '') !== (c.api ?? '')) start();
    else report(state, text);
  });
}
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
  // Songs already waiting without an analysis (arrived while it was off, or before this version).
  void (async () => { for (const f of await bridge.incomingList().catch(() => [])) await cache.analyseIncoming(f.name, f.path).catch(() => {}); })();
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
    if (what === 'restart') { engine.forget(); engine.analysisRestart(); }
    start();
    event(what === 'restart' ? 'Restarted' : 'Started');
    engine.analysisRun(); sharedSoon(); void findFolders();
  });
  await bridge.onAskStatus(() => report(state, text));
  void findFolders();
  // Updates by itself: a minute after starting, then every six hours, when nothing is being sent.
  const auto = async () => {
    const busy = async () => !!receiving || await bridge.rtcBusy().catch(() => false);
    if (cfg?.autoUpdate === false || await busy()) return;
    const u = await findUpdate().catch(() => null);
    if (!u || await busy()) return;
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
  // GLUE Home's own connections (ADR 0150): what they found, asked and did.
  await bridge.onRtc<{ id: string; candidate: RTCIceCandidateInit | null }>('rtc-ice', ({ id, candidate }) => { const c = conns.get(id); if (c) room?.send(c.from, { app: 'glue-send', t: 'ice', id, candidate }); });
  await bridge.onRtc<{ id: string; state: string }>('rtc-state', ({ id, state }) => states.get(id)?.(state));
  await bridge.onRtc<Status['receiving']>('rtc-receiving', r => { receiving = r; report(state, text); });
  await bridge.onRtc<{ name: string; path: string; size: number }>('rtc-received', f => void received(f));
  await bridge.onRtc<{ what: string; ms: number; bytes: number }>('rtc-served', w => { const row = served[w.what] ??= { calls: 0, ms: 0, bytes: 0 }; row.calls++; row.ms += w.ms; row.bytes += w.bytes; servedSoon(); });
  await bridge.onRtc<{ id: string; calls: number; last: number }>('rtc-activity', a => { const c = conns.get(a.id), s = c && sessions.get(c.key); if (s && s.id === a.id) { s.calls = a.calls; s.last = a.last; servedSoon(); } });
  await bridge.onVerify(n => { if (n > 0) void verify.run(() => cfg, n, () => report(state, text)); else verify.stop(); });
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
  // The engine (ADR 0104, 0153, 0154: in Rust, its jobs and this computer's analysis carried on there): what it says,
  // here.
  engine.on.event = event;
  engine.on.changed = servedSoon;
  engine.on.analysis = servedSoon;
  // What the tab changed, or the analysis put in, goes up to GLUE Cloud within seconds (a burst makes one push, ADR 0106).
  engine.on.edited = () => sharedSoon(2000);
  await engine.listenToEngine();
  // Shared collections (ADR 0097): synced here when no GLUE tab is, soon after starting and every minute.
  setTimeout(sharedSoon, 25_000);
  setInterval(sharedSoon, 60_000);
  // The day's backups (ADR 0090), when no GLUE tab here makes them: soon after starting, then hourly.
  const backups = () => { if (cfg?.running !== false) void backupDaily(cfg).catch(e => console.warn('GLUE Home: the daily backup failed', e)); };
  setTimeout(backups, 45_000);
  setInterval(backups, 3600e3);
}
void boot();
