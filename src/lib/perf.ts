/* Performance instrumentation in the page (ADR 0058). On with ?perf in the address (before the #) or
   the pref mco.perf = 1; otherwise nothing runs. It keeps, per animation frame, the time since the
   previous frame and the drawing done in it; the long animation frames (what blocked the page); and
   the slow interactions (input to the next paint). PerfHud shows them; e2e/perf.spec.ts reads them
   through window.__gluePerf. */
import { enablePerf, perfStats, record, resetPerf, takeFrameWork } from '../core/perf';
import { readPref } from './prefs';

const KEEP = 1800;   // frames (30 s at 60 Hz)
export interface LongFrame { at: number; ms: number; blocking: number; scripts: string[] }
export interface Interaction { at: number; name: string; ms: number; target: string }

const push = <T>(a: T[], v: T) => { a.push(v); if (a.length > KEEP) a.splice(0, a.length - KEEP); };
/** The p-th percentile (0–100) of some numbers. */
export function pct(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))];
}

function describe(el: EventTarget | null | undefined): string {
  const e = el as HTMLElement | null;
  if (!e || !e.tagName) return '';
  return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
}

class Perf {
  readonly on: boolean;
  /** Per animation frame: the time since the previous frame, and the drawing done in it (ms). */
  gaps: number[] = [];
  work: number[] = [];
  long: LongFrame[] = [];
  events: Interaction[] = [];
  private last = 0;

  constructor() {
    let on = false;
    try { on = new URLSearchParams(location.search).has('perf') || readPref('perf', '') === '1'; } catch { /* no page */ }
    this.on = on;
    if (!on) return;
    enablePerf(true);
    this.observe();
    const tick = (ts: number) => {
      if (this.last) { push(this.gaps, ts - this.last); push(this.work, takeFrameWork()); }
      this.last = ts;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // A hidden tab has no frames: don't count the pause as one long frame.
    document.addEventListener('visibilitychange', () => { this.last = 0; });
    (window as unknown as { __gluePerf: unknown }).__gluePerf = {
      stats: perfStats,
      frames: () => ({ gaps: [...this.gaps], work: [...this.work] }),
      long: () => [...this.long],
      events: () => [...this.events],
      reset: () => this.reset(),
      summary: () => this.summary(),
      /** Resolves once the next frame has been painted, with the time it took from the call. */
      afterPaint: () => { const t0 = performance.now(); return new Promise<number>(r => requestAnimationFrame(() => setTimeout(() => r(performance.now() - t0), 0))); },
      /** A burst of changes like background analysis makes: n analyses re-stored, perSecond of them each second. */
      storm: (n: number, perSecond: number) => import('./perfStorm').then(m => m.storm(n, perSecond)),
    };
  }

  private observe() {
    const types = PerformanceObserver.supportedEntryTypes ?? [];
    if (types.includes('long-animation-frame')) {
      new PerformanceObserver(list => {
        for (const e of list.getEntries() as unknown as { startTime: number; duration: number; blockingDuration: number; scripts: { invoker: string; sourceFunctionName: string; sourceURL: string; duration: number }[] }[]) {
          const scripts = [...e.scripts].sort((a, b) => b.duration - a.duration).slice(0, 3)
            .map(s => `${Math.round(s.duration)}ms ${s.invoker || ''} ${s.sourceFunctionName || ''} ${(s.sourceURL || '').split('/').pop()}`.trim());
          push(this.long, { at: e.startTime, ms: e.duration, blocking: e.blockingDuration, scripts });
        }
      }).observe({ type: 'long-animation-frame', buffered: true });
    } else if (types.includes('longtask')) {
      new PerformanceObserver(list => { for (const e of list.getEntries()) push(this.long, { at: e.startTime, ms: e.duration, blocking: e.duration - 50, scripts: [] }); })
        .observe({ type: 'longtask', buffered: true });
    }
    if (types.includes('event')) {
      new PerformanceObserver(list => {
        for (const e of list.getEntries() as PerformanceEventTiming[]) {
          push(this.events, { at: e.startTime, name: e.name, ms: e.duration, target: describe(e.target) });
          record('input:' + e.name, e.duration);
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    }
  }

  reset() { this.gaps = []; this.work = []; this.long = []; this.events = []; this.last = 0; resetPerf(); }

  summary() {
    return {
      frames: this.gaps.length,
      gapP95: pct(this.gaps, 95), gapMax: Math.max(0, ...this.gaps),
      over50: this.gaps.filter(g => g > 50).length,
      drawP50: pct(this.work, 50), drawP95: pct(this.work, 95), drawMax: Math.max(0, ...this.work),
      longFrames: this.long.length, longMax: Math.max(0, ...this.long.map(l => l.ms)),
      slowInputs: this.events.length, inputMax: Math.max(0, ...this.events.map(e => e.ms)),
    };
  }
}

export const perf = new Perf();
