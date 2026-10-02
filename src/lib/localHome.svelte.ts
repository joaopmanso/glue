/* The local link (ADR 0048): this computer's GLUE Home, straight on http://127.0.0.1, without GLUE
   Cloud. Found at once when the page opens (even offline or before signing in), from what GLUE Home
   told this browser the first time (its port and a token, over the account's channel). */
import { HomeSocket } from '../platform/homeSocket';
import { account } from './account.svelte';
import { readPref, writePref } from './prefs';
import { setHomeLink } from '../platform';
import { homeOs } from './homeApp';

/** `wsPort`: its socket for the background loads (GLUE Home 0.42, ADR 0139). `playPort`: its port for the songs played
    (GLUE Home 0.42.2, ADR 0141), their own 6 connections in the browser. */
export interface LocalLink { home: string; port: number; token: string; version: string; wsPort?: number; playPort?: number }
/** Its other ports, from an answer of GLUE Home ('/hello', '/connect'). */
const ports = (h: { wsPort?: number; playPort?: number }) => ({ ...(h.wsPort ? { wsPort: h.wsPort } : {}), ...(h.playPort ? { playPort: h.playPort } : {}) });
const PREF = 'localHome';

/** Why the last try failed (shown in Devices). */
let why = '';
async function hello(port: number, ms = 1500): Promise<{ app: string; version: string; device: string; wsPort?: number; playPort?: number } | null> {
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/hello', { signal: AbortSignal.timeout(ms) });
    if (!r.ok) { why = 'it answered ' + r.status; return null; }
    return await r.json();
  } catch (e) {
    // Blocked by the browser (Local Network Access not allowed), not running, or no answer in time.
    why = (e as Error).name === 'TimeoutError' ? 'no answer on 127.0.0.1:' + port : 'the browser couldn’t reach 127.0.0.1:' + port + ' (allow “apps and services on this device” for this site)';
    return null;
  }
}

/** The link, from GLUE Home itself (ADR 0115): it answers a GLUE page on this computer. Null: an older GLUE Home. */
async function connect(port: number, ms = 1500): Promise<LocalLink | null> {
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/connect', { signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const j = await r.json() as Partial<LocalLink>;
    return typeof j.token === 'string' && j.token && typeof j.port === 'number' ? { home: j.home ?? '', port: j.port, token: j.token, version: j.version ?? '', ...ports(j) } : null;
  } catch { return null; }
}

/** Any GLUE Home running on this computer, found by asking each of its ports (ADR 0091). Each port that doesn't answer
    is an error in the browser's console, which no page can hide: looks within 10 s of each other share one (ADR 0143). */
let looked: { at: number; found: Promise<{ port: number; device: string } | null> } | null = null;
export function discover(): Promise<{ port: number; device: string } | null> {
  if (looked && Date.now() - looked.at < 10_000) return looked.found;
  const found = Promise.all(Array.from({ length: 10 }, (_, i) => 47400 + i).map(async port => { const h = await hello(port, 2000); return h?.app === 'glue-home' && h.device ? { port, device: h.device } : null; }))
    .then(all => all.find(Boolean) ?? null);
  looked = { at: Date.now(), found };
  return found;
}

class LocalHome {
  /** Working now: this computer's GLUE Home answers directly. */
  link = $state.raw<LocalLink | null>(null);
  /** …and the platform layer uses its disk (Home mode, ADR 0051). */
  private setLink(l: LocalLink | null) {
    const was = !!this.link;
    if (l?.wsPort !== this.link?.wsPort || l?.token !== this.link?.token) homeSocket.close();
    this.link = l; setHomeLink(l);
    if (was !== !!l) this.onChange?.(!!l);
  }
  /** GLUE Home stopped answering (false) or answers again (true). */
  onChange: ((up: boolean) => void) | null = null;
  private finding: Promise<void> | null = null;
  private watching = 0;
  /** While it's away, look for it again every few seconds (it may be restarting, or started later). */
  private watch() {
    if (this.watching) return;
    this.watching = window.setInterval(() => {
      if (this.link) return;
      this.finding = null;
      void this.find();
      if (account.signedIn) this.lookIfAccountHasOne();   // another browser here, signed in (ADR 0115): until found
    }, 5_000);
  }
  private learning = false;
  /** Why there's no link to this computer's GLUE Home, if it's running (for Devices). */
  problem = $state('');

  /** The link to this GLUE Home, if it's the one on this computer and it answers. */
  for(home: string | null | undefined) { return home && this.link?.home === home ? this.link : null; }
  url(path: string, port = this.link!.port) { const l = this.link!; return 'http://127.0.0.1:' + port + path + (path.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(l.token); }
  /** A song to play: on GLUE Home's port for songs when it has one (ADR 0141), so nothing else the page asks for holds it up. */
  playUrl(path: string) { return this.url(path, this.link!.playPort || this.link!.port); }
  async get<T>(path: string): Promise<T> {
    const r = await fetch(this.url(path), { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error || 'GLUE Home said no (' + r.status + ')');
    return (r.headers.get('content-type')?.includes('json') ? r.json() : r.arrayBuffer()) as Promise<T>;
  }
  /** `body` goes as plain text (a "simple" request: no CORS preflight). */
  async post<T>(path: string, body?: string): Promise<T> {
    const r = await fetch(this.url(path), { method: 'POST', body, signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => ({})) as T & { error?: string };
    if (!r.ok) throw new Error(j.error || 'GLUE Home said no (' + r.status + ')');
    return j;
  }

  /** On page load: the GLUE Home this browser met before, if it's running. */
  find() { this.watch(); return (this.finding ??= this.findOnce()); }
  private async findOnce() {
    const known = JSON.parse(readPref(PREF, 'null') || 'null') as { home: string; port: number; token: string } | null;
    if (!known) return;
    // GLUE Home hands a GLUE page its link itself (ADR 0115): the current one, even if it restarted elsewhere.
    if (await this.findHere(known.port)) return;
    // An older GLUE Home (no /connect): the link it gave this browser before, if it's still the one answering.
    const h = await hello(known.port);
    if (h?.app === 'glue-home' && h.device === known.home) { this.setLink({ ...known, version: h.version, ...ports(h) }); this.problem = ''; }
  }
  /** The GLUE Home on this computer, asked for its link directly (ADR 0115): any browser here gets it, so Edge
      shows what Chrome shows. Only when there's a reason (this browser met it before, or the account has a GLUE
      Home): asking 127.0.0.1 makes the browser ask a visitor about "apps on this device". */
  async findHere(port?: number): Promise<boolean> {
    if (!homeOs()) return false;   // a phone: no GLUE Home on it
    let c = port ? await connect(port) : null;
    if (!c) { const d = await discover(); if (d) c = await connect(d.port); }
    if (!c) return false;
    this.setLink(c); this.problem = '';
    writePref(PREF, JSON.stringify({ home: c.home, port: c.port, token: c.token }));
    return true;
  }
  private lookedHere = 0;
  private lookedFor: string | null = null;
  /** Signed in to an account with a GLUE Home, and none linked here yet: look on this computer. Every 15 s at most while
      one may be here: this browser's computer's, or one not placed on a computer yet (just installed). The others run
      on other computers: looked for once, and again when which of them are online changes (a second browser on that
      computer joins it, ADR 0091). Looking on every 15 s put 10 errors in the laptop's console each time (the user,
      2026-10-02, ADR 0143). */
  lookIfAccountHasOne() {
    const homes = account.devices.filter(d => d.kind === 'home');
    if (this.link || !homes.length || Date.now() - this.lookedHere < 15_000) return;
    const maybeHere = homes.some(h => !h.companionOf || h.companionOf === account.thisDevice);
    const online = homes.filter(h => account.online.has(h.id)).map(h => h.id).sort().join();
    if (!maybeHere && this.lookedFor === online) return;
    this.lookedHere = Date.now(); this.lookedFor = online;
    void this.findHere();
  }
  /** The first time (and after GLUE Home connected again): ask it over the account's channel. */
  async learn(home: string, ask: (home: string) => Promise<{ port: number; token: string | null }>) {
    if (this.learning || this.link?.home === home) return;
    this.learning = true;
    try {
      const a = await ask(home);
      if (!a.port || !a.token) { this.problem = 'this GLUE Home is too old for a direct link (update it)'; return; }
      // Long enough for the browser's "access apps on this device" question to be answered.
      const h = await hello(a.port, 60_000);
      if (h?.app !== 'glue-home' || h.device !== home) { this.problem = h ? 'another GLUE Home answers on 127.0.0.1:' + a.port : why; return; }
      this.setLink({ home, port: a.port, token: a.token, version: h.version, ...ports(h) });
      this.problem = '';
      writePref(PREF, JSON.stringify({ home, port: a.port, token: a.token }));
    } catch (e) { this.problem = 'it didn’t answer (' + (e as Error).message + ')'; } finally { this.learning = false; }
  }
  /** It stopped answering: check again (it may have restarted on another port). */
  /** Asked twice, patiently (3 s, then 5 s): one slow answer while GLUE Home is busy analysing, or with this page's
      other requests to it queued, isn't it gone (the link dropped every few seconds, 2026-10-01, ADR 0137). */
  async check() {
    const l = this.link;
    if (!l || await hello(l.port, 3000) || await hello(l.port, 5000)) return;
    if (this.link === l) { this.setLink(null); this.problem = why; }
  }
  /** The name of a GLUE Home's computer (its browser's, when it's a companion). */
  computer(home: string) { const h = account.devices.find(d => d.id === home), b = h?.companionOf ? account.devices.find(d => d.id === h.companionOf) : null; return b?.name ?? h?.name ?? (this.for(home) ? this.deviceName : 'GLUE Home'); }
  get deviceName() { const me = account.thisDevice; return (me && account.devices.find(d => d.id === me)?.name) || 'This computer'; }
}

export const localHome = new LocalHome();
/** The socket for the background loads from this computer's GLUE Home (ADR 0139); none before GLUE Home 0.42. */
export const homeSocket = new HomeSocket(() => { const l = localHome.link; return l?.wsPort ? 'ws://127.0.0.1:' + l.wsPort + '/?t=' + encodeURIComponent(l.token) : null; });
// Signed in to an account with a GLUE Home: this browser may be on its computer (Edge next to Chrome, ADR 0115).
if (typeof window !== 'undefined') $effect.root(() => { $effect(() => { void account.devices; void account.online; if (account.signedIn) localHome.lookIfAccountHasOne(); }); });
