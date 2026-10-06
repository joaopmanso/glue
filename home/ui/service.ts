/* GLUE Home's service (ADR 0044), in a hidden window, until the plan's E5 has it in Rust too: GLUE Home's status for
   the tray and the settings window, and its timers (backups, reminders, updates, the shared sync). The account's
   signaling room, the sessions with other devices, songs received and which computer this is are the engine's
   (crates/glue-engine/src/room.rs, identity.rs, ADR 0158): started and stopped from here, and its state shown. Start /
   Stop / Restart come from the tray and the settings window. */
import { bridge, type HomeConfig, type Status } from './bridge';
import { backupDaily } from './backups';
import { followMoves } from './moves';
import { newlyFound } from './library';
import { findUpdate, install } from './updates';
import * as engine from './engine';
import * as verify from './verify';
import { checkReminders } from './reminders';

let cfg: HomeConfig | null = null;
/** The room's state and the sessions, as the engine last said them; `text` can say something else for a moment
    (an update). */
let room: engine.RoomState = { state: 'stopped', text: 'Starting…', sessions: { list: [], max: 5 } };
let text = room.text;
let receiving: Status['receiving'] = null;
let library: Status['library'] = undefined;
let reminders: Status['reminders'] = undefined;
/** What other devices asked since GLUE Home started (ADR 0083), by kind: shown in the settings. */
const served: Record<string, { calls: number; ms: number; bytes: number }> = {};

/** Running unless stopped: settings that never said (Start or Stop never pressed) mean running. */
const isRunning = (c: HomeConfig | null | undefined) => !!c && c.running !== false;
/** What GLUE Home did lately (the settings window shows each new one as a toast), newest first. */
const events: { at: number; text: string }[] = [];
function event(text: string) { events.unshift({ at: Date.now(), text }); if (events.length > 30) events.length = 30; servedSoon(); }
/** What was asked shows in the settings a moment after (at most every 2 s, ADR 0083). */
let servedTimer = 0;
const servedSoon = () => { if (!servedTimer) servedTimer = window.setTimeout(() => { servedTimer = 0; report(); }, 2000); };
/** The status, to the tray and the settings window. `t`: something to say instead of the room's state for now. */
function report(t = text) {
  text = t;
  const s = room.state;
  const status: Status = { state: s, text, running: isRunning(cfg) && s !== 'unpaired' && s !== 'removed', receiving, received: cfg?.received ?? [], library, analysis: engine.background(), analysing: engine.analysisState(), engine: engine.status(), verify: structuredClone(verify.state), events: events.slice(), reminders, served: structuredClone(served), sessions: room.sessions, computer: { id: cfg?.computer ?? null, why: cfg?.computerWhy ?? '' } };
  void bridge.status(status);
  void bridge.trayStatus(text, status.running).catch(() => {});
  const el = document.getElementById('state');
  if (el) el.textContent = text;
}

/** Online in the account's room (the engine's), or say why not; Stop: out of it, every session closed. */
const start = () => engine.roomStart();
const stop = () => engine.roomStop();

// ---- playing this computer's songs on another, and the library's other answers (ADR 0045, 0150, 0156) ------
// Answered by GLUE Home's engine (crates/glue-engine/src/answers.rs) as its connections hand them over; each counted
// here for the settings (`rtc-served`, ADR 0083). Songs received are the engine's too (room.rs, ADR 0158).

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
      if (!cfg?.glue) { library = undefined; report(); continue; }
      library = { searching: true, found: 0, missing: [] }; report();
      const before = { ...(cfg.folders ?? {}) };
      const r = await engine.locateAll().catch(() => ({ folders: {} as Record<string, string>, missing: [] }));
      // Only what the search found anew, and only where nothing changed meanwhile: a folder picked while
      // it searched (the website's "Add folder") is never put back to what it was.
      const next = await bridge.patchConfig(cur => { const f = newlyFound(before, r.folders, cur.folders ?? {}); return f ? { folders: f } : null; }).catch(() => null);
      if (next) cfg = next;
      library = { searching: false, found: Object.keys(r.folders).length, missing: r.missing };
      report();
      // Then the mini spectrograms and analyses it doesn't have yet, gently in the background.
      // (after the library's own analysis: it makes these too.)
      // (in GLUE Home's engine: it waits while GLUE Home works for another device or analyses the library.)
      engine.backgroundRun();
    } while (again);
  })().finally(() => { finding = null; });
}

// ---- wiring ---------------------------------------------------------------------------------------

/** New settings (joined an account, another incoming folder, a folder picked): acted on, reconnecting when
    the account changed. */
async function listenConfig() {
  await bridge.onConfig(c => {
    const before = cfg;
    cfg = c;
    if (before?.glue !== c.glue || JSON.stringify(before?.serve ?? {}) !== JSON.stringify(c.serve ?? {}) || JSON.stringify(before?.folders ?? {}) !== JSON.stringify(c.folders ?? {})) void findFolders();
    if (!!before?.analysisPaused !== !!c.analysisPaused) engine.setPaused(!!c.analysisPaused);
    if (!before || before.deviceId !== c.deviceId || before.token !== c.token || isRunning(before) !== isRunning(c) || (before.api ?? '') !== (c.api ?? '')) start();
    else report();
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
  engine.analyseWaiting();
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
  await bridge.onAskStatus(() => report());
  void findFolders();
  // Updates by itself: a minute after starting, then every six hours, when nothing is being sent.
  const auto = async () => {
    const busy = async () => !!receiving || await bridge.rtcBusy().catch(() => false);
    if (cfg?.autoUpdate === false || await busy()) return;
    const u = await findUpdate().catch(() => null);
    if (!u || await busy()) return;
    report('Updating to ' + u.version + '…');
    await install(u).catch(e => report('Update failed: ' + ((e as Error).message || e)));
  };
  setTimeout(() => void auto(), 60_000);
  setInterval(() => void auto(), 6 * 3600e3);
  // Events that need music (ADR 0074): a look soon after starting, then every hour; Check now in the settings.
  const remind = async (again = false) => {
    const r = await checkReminders(cfg, new Date(), again).catch(() => null);
    if (r) { reminders = { at: Date.now(), coming: r.coming, sent: r.sent }; report(); }
  };
  await bridge.onRemindNow(() => void remind(true));
  // GLUE Home's own connections (ADR 0150): a song arriving, and what they were asked (the room and the sessions
  // hear the rest, in Rust: ADR 0158).
  await bridge.onRtc<Status['receiving']>('rtc-receiving', r => { receiving = r; report(); });
  await bridge.onRtc<{ what: string; ms: number; bytes: number }>('rtc-served', w => { const row = served[w.what] ??= { calls: 0, ms: 0, bytes: 0 }; row.calls++; row.ms += w.ms; row.bytes += w.bytes; servedSoon(); });
  await bridge.onVerify(n => { if (n > 0) void verify.run(() => cfg, n, () => report()); else verify.stop(); });
  // Disconnected in the settings: the engine ends the session, and refuses it for an hour.
  await bridge.onDisconnect(key => engine.roomDisconnect(key));
  // Which computer this is (ADR 0108), asked again hourly (and each time the room comes online).
  setInterval(engine.learnComputer, 3600e3);
  setTimeout(() => void remind(), 90_000);
  setInterval(() => void remind(), 3600e3);
  // A collection that went into another (ADR 0102): this cache follows it, soon after starting and hourly.
  const moves = () => void (cfg?.running === false ? Promise.resolve() : followMoves(cfg)).catch(e => console.warn('GLUE Home: the cache didn’t follow a moved collection', e));
  setTimeout(moves, 30_000);
  setInterval(moves, 3600e3);
  // The engine (ADR 0104, 0153, 0154: in Rust, its jobs and this computer's analysis carried on there): what it says,
  // here.
  engine.on.event = event;
  // The room's state and the sessions (ADR 0158); a song received, or which computer this is, changed the settings.
  engine.on.room = r => { room = r; report(r.text); };
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
