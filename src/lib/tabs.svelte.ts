/* One GLUE tab (ADR 0044): GLUE Home's tray icon opens the library in the browser. When a GLUE tab
   is open already, the new one asks it to come forward (browsers only let a page focus itself in some
   cases, so it also flashes its title) and closes itself; if the browser won't let it close, it
   offers to take over, and the other tab saves, lets go of the GLUE folder and steps aside. */
import { lib } from './library.svelte';

type Msg = { t: 'ping'; from: string } | { t: 'here'; from: string; to: string } | { t: 'focus'; to: string } | { t: 'yield'; from: string } | { t: 'yielded'; to: string };
const me = crypto.randomUUID();
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('glue-tabs') : null;

class Tabs {
  /** This tab stepped aside (another tab has the library), or found one open when it came from GLUE Home. */
  state = $state<'active' | 'elsewhere' | 'yielded'>('active');
  private waiting = new Map<string, (m: Msg) => void>();

  constructor() {
    if (!bc) return;
    bc.onmessage = e => {
      const m = e.data as Msg;
      if (m.t === 'ping' && this.state === 'active') bc.postMessage({ t: 'here', from: me, to: m.from } satisfies Msg);
      else if (m.t === 'focus' && m.to === me) this.highlight();
      else if (m.t === 'yield' && this.state === 'active') void this.stepAside(m.from);
      else if ((m.t === 'here' || m.t === 'yielded') && m.to === me) this.waiting.get(m.t)?.(m);
    };
  }
  private wait(t: 'here' | 'yielded', ms: number) {
    return new Promise<Msg | null>(res => { const timer = setTimeout(() => { this.waiting.delete(t); res(null); }, ms); this.waiting.set(t, m => { clearTimeout(timer); this.waiting.delete(t); res(m); }); });
  }

  /** Opened from GLUE Home (?open=home): if another GLUE tab is open, bring it forward and close
      this one. Returns true when this tab should not start the library. */
  async fromHome(): Promise<boolean> {
    const u = new URL(location.href);
    if (u.searchParams.get('open') !== 'home') return false;
    u.searchParams.delete('open');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    if (!bc) return false;
    bc.postMessage({ t: 'ping', from: me } satisfies Msg);
    const here = await this.wait('here', 400);
    if (!here || here.t !== 'here') return false;
    bc.postMessage({ t: 'focus', to: here.from } satisfies Msg);
    this.state = 'elsewhere';
    window.close();   // allowed for a tab the OS opened with nothing else in its history
    return true;
  }
  /** "Use this tab instead": the other tab saves and lets go first. */
  async takeOver() {
    bc?.postMessage({ t: 'yield', from: me } satisfies Msg);
    await this.wait('yielded', 5000);
    this.state = 'active';
    await lib.boot();
  }
  private async stepAside(to: string) {
    await lib.flush().catch(() => {});
    lib.releaseFolder();
    this.state = 'yielded';
    bc?.postMessage({ t: 'yielded', to } satisfies Msg);
  }
  /** Come forward, and flash the title in case the browser doesn't allow that. */
  private highlight() {
    window.focus();
    const title = document.title;
    let n = 0;
    const t = setInterval(() => { document.title = n % 2 ? title : '● GLUE is here'; if (++n > 9) { clearInterval(t); document.title = title; } }, 600);
  }
}
export const tabs = new Tabs();
