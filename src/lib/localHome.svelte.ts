/* The local link (ADR 0048): this computer's GLUE Home, straight on http://127.0.0.1, without GLUE
   Cloud. Found at once when the page opens (even offline or before signing in), from what GLUE Home
   told this browser the first time (its port and a token, over the account's channel). */
import { account } from './account.svelte';
import { readPref, writePref } from './prefs';
import { setHomeLink } from '../platform';

export interface LocalLink { home: string; port: number; token: string; version: string }
const PREF = 'localHome';

/** Why the last try failed (shown in Devices). */
let why = '';
async function hello(port: number, ms = 1500): Promise<{ app: string; version: string; device: string } | null> {
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

class LocalHome {
  /** Working now: this computer's GLUE Home answers directly. */
  link = $state.raw<LocalLink | null>(null);
  /** …and the platform layer uses its disk (Home mode, ADR 0051). */
  private setLink(l: LocalLink | null) {
    const was = !!this.link;
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
    }, 5_000);
  }
  private learning = false;
  /** Why there's no link to this computer's GLUE Home, if it's running (for Devices). */
  problem = $state('');

  /** The link to this GLUE Home, if it's the one on this computer and it answers. */
  for(home: string | null | undefined) { return home && this.link?.home === home ? this.link : null; }
  url(path: string) { const l = this.link!; return 'http://127.0.0.1:' + l.port + path + (path.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(l.token); }
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
    const h = await hello(known.port);
    if (h?.app === 'glue-home' && h.device === known.home) { this.setLink({ ...known, version: h.version }); this.problem = ''; }
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
      this.setLink({ home, port: a.port, token: a.token, version: h.version });
      this.problem = '';
      writePref(PREF, JSON.stringify({ home, port: a.port, token: a.token }));
    } catch (e) { this.problem = 'it didn’t answer (' + (e as Error).message + ')'; } finally { this.learning = false; }
  }
  /** It stopped answering: check again (it may have restarted on another port). */
  async check() { if (this.link && !(await hello(this.link.port))) { this.setLink(null); this.problem = why; } }
  /** The name of a GLUE Home's computer (its browser's, when it's a companion). */
  computer(home: string) { const h = account.devices.find(d => d.id === home), b = h?.companionOf ? account.devices.find(d => d.id === h.companionOf) : null; return b?.name ?? h?.name ?? (this.for(home) ? this.deviceName : 'GLUE Home'); }
  get deviceName() { const me = account.thisDevice; return (me && account.devices.find(d => d.id === me)?.name) || 'This computer'; }
}

export const localHome = new LocalHome();
