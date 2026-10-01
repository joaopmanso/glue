/* What the rows on screen ask for (ADR 0131): thumbnails, waveforms and covers keep the same two things.
   - `OnScreen`: the rows on screen, counted (one row can show a thing twice). The table draws 12 rows beyond each
     edge, so "on screen" covers a scroll's worth either way.
   - `Retries`: asking again, only while the row is on screen. An answer that couldn't be had (the link to the
     other computer still opening, a time-out) is asked again soon; "not there yet" (its GLUE Home makes it now)
     waits longer. A row that scrolls away cancels its retry; when it comes back, it asks again at once.
   Before this, an ask that failed on a first load was taken as "none" for good, until the rows were scrolled
   away and back (the user, 2026-10-01: the first screen's waveforms often didn't load on the laptop). */

export class OnScreen {
  private n = new Map<string, number>();
  /** True when it just came on screen. */
  hold(k: string): boolean { const c = (this.n.get(k) ?? 0) + 1; this.n.set(k, c); return c === 1; }
  /** True when it just left the screen. */
  drop(k: string): boolean {
    const c = (this.n.get(k) ?? 1) - 1;
    if (c > 0) { this.n.set(k, c); return false; }
    this.n.delete(k);
    return true;
  }
  has(k: string) { return this.n.has(k); }
}

export type Why = 'unreached' | 'notYet';
export class Retries {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private tries = new Map<string, number>();
  /** Ask for `k` again after a pause, if `onScreen(k)` then: `unreached` after 1, 2, 4… up to 15 s, for as long
      as it's on screen; `notYet` after 8, 16… up to 60 s, ten times. */
  later(k: string, why: Why, onScreen: (k: string) => boolean, again: () => void) {
    const n = (this.tries.get(k) ?? 0) + 1;
    this.tries.set(k, n);
    if (why === 'notYet' && n > 10) return;
    const ms = why === 'unreached' ? Math.min(15_000, 1000 * 2 ** (n - 1)) : Math.min(60_000, 8_000 * n);
    this.cancel(k);
    this.timers.set(k, setTimeout(() => { this.timers.delete(k); if (onScreen(k)) again(); }, ms));
  }
  /** It left the screen: no retry while it's away. */
  cancel(k: string) { const t = this.timers.get(k); if (t !== undefined) { clearTimeout(t); this.timers.delete(k); } }
  /** It arrived: its count starts again. */
  done(k: string) { this.cancel(k); this.tries.delete(k); }
  clear() { for (const t of this.timers.values()) clearTimeout(t); this.timers.clear(); this.tries.clear(); }
}
