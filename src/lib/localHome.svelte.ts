/* The local link (ADR 0048): this computer's GLUE Home, straight on http://127.0.0.1, without GLUE
   Cloud. Found at once when the page opens (even offline or before signing in), from what GLUE Home
   told this browser the first time (its port and a token, over the account's channel). */
import { account } from './account.svelte';
import { readPref, writePref } from './prefs';

export interface LocalLink { home: string; port: number; token: string; version: string }
const PREF = 'localHome';

async function hello(port: number, ms = 1200): Promise<{ app: string; version: string; device: string } | null> {
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/hello', { signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

class LocalHome {
  /** Working now: this computer's GLUE Home answers directly. */
  link = $state.raw<LocalLink | null>(null);
  private learning = false;

  /** The link to this GLUE Home, if it's the one on this computer and it answers. */
  for(home: string | null | undefined) { return home && this.link?.home === home ? this.link : null; }
  url(path: string) { const l = this.link!; return 'http://127.0.0.1:' + l.port + path + (path.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(l.token); }
  async get<T>(path: string): Promise<T> {
    const r = await fetch(this.url(path), { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error || 'GLUE Home said no (' + r.status + ')');
    return (r.headers.get('content-type')?.includes('json') ? r.json() : r.arrayBuffer()) as Promise<T>;
  }
  async post<T>(path: string): Promise<T> {
    const r = await fetch(this.url(path), { method: 'POST', signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => ({})) as T & { error?: string };
    if (!r.ok) throw new Error(j.error || 'GLUE Home said no (' + r.status + ')');
    return j;
  }

  /** On page load: the GLUE Home this browser met before, if it's running. */
  async find() {
    const known = JSON.parse(readPref(PREF, 'null') || 'null') as { home: string; port: number; token: string } | null;
    if (!known) return;
    const h = await hello(known.port);
    if (h?.app === 'glue-home' && h.device === known.home) this.link = { ...known, version: h.version };
  }
  /** The first time (and after GLUE Home connected again): ask it over the account's channel. */
  async learn(home: string, ask: (home: string) => Promise<{ port: number; token: string | null }>) {
    if (this.learning || this.link?.home === home) return;
    this.learning = true;
    try {
      const a = await ask(home);
      if (!a.port || !a.token) return;
      const h = await hello(a.port);
      if (h?.app !== 'glue-home' || h.device !== home) return;
      this.link = { home, port: a.port, token: a.token, version: h.version };
      writePref(PREF, JSON.stringify({ home, port: a.port, token: a.token }));
    } catch { /* not now */ } finally { this.learning = false; }
  }
  /** It stopped answering: check again (it may have restarted on another port). */
  async check() { if (this.link && !(await hello(this.link.port))) this.link = null; }
  get deviceName() { const me = account.thisDevice; return (me && account.devices.find(d => d.id === me)?.name) || 'This computer'; }
}

export const localHome = new LocalHome();
