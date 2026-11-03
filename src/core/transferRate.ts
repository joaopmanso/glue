/* How fast a transfer goes and how long it has left (ADR 0193): over the last seconds, not since the start, so a
   connection that changes speed is seen, and with nothing to go on, no guess at all. */
const WINDOW_MS = 20_000, MIN_MS = 2_000;

export class RateMeter {
  private points: { at: number; bytes: number }[] = [];
  /** `bytes`: how many so far, at time `at` (ms). */
  add(at: number, bytes: number) {
    this.points.push({ at, bytes });
    while (this.points.length > 2 && at - this.points[1].at >= WINDOW_MS) this.points.shift();
  }
  /** Bytes a second, null until there are a couple of seconds to go on. Falls as a stall goes on. */
  rate(now: number): number | null {
    const a = this.points[0], b = this.points[this.points.length - 1];
    if (!a || now - a.at < MIN_MS) return null;
    return Math.max(0, b.bytes - a.bytes) / ((now - a.at) / 1000);
  }
}

/** Seconds left, null when there's no knowing (nothing's moving). */
export function secondsLeft(remaining: number, rate: number | null): number | null {
  return rate && rate > 0 ? Math.max(0, remaining) / rate : null;
}

/** "about 40 s left", "about 3 min left", "about 1 h 5 min left": no more exact than an estimate is. */
export function fmtLeft(s: number): string {
  if (s < 60) return 'about ' + Math.max(5, Math.ceil(s / 5) * 5) + ' s left';
  const m = Math.ceil(s / 60);
  if (m < 60) return 'about ' + m + ' min left';
  return 'about ' + Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + m % 60 + ' min' : '') + ' left';
}
