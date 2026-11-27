/* What each deck's controls do over a hand-over (ADR 0199): volume, the isolator's low / mid / high, the one-knob filter
   and the echo send, at any mix beat. Outside a hand-over a song plays as it is. Pure. */
import type { FxStyle, SetItem } from './types';

export interface Ctl { gain: number; low: number; mid: number; high: number; filter: number; echo: number }
const FLAT: Ctl = { gain: 1, low: 1, mid: 1, high: 1, filter: 0, echo: 0 };
const SILENT: Ctl = { ...FLAT, gain: 0 };
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const up = (u: number) => Math.sin(clamp(u) * Math.PI / 2), down = (u: number) => Math.cos(clamp(u) * Math.PI / 2);

/** The outgoing (side 'out') or incoming ('in') song's controls at beat `b` of a hand-over [s, e) in that style. */
export function handOver(style: FxStyle, side: 'out' | 'in', b: number, s: number, e: number, drop?: number): Ctl {
  const len = e - s, u = len > 0 ? (b - s) / len : 1, c: Ctl = { ...FLAT };
  // The middle bar, for a bass swap: the bar line nearest half way.
  const mid = s + Math.round(len / 8) * 4;
  switch (style) {
    case 'cut':
      c.gain = side === 'out' ? (b < e ? 1 : 0) : (b < e ? 0 : 1);
      break;
    case 'blend':
      c.gain = side === 'out' ? down(u) : up(u);
      break;
    case 'bassSwap':
      if (side === 'in') { c.gain = up((b - s) / Math.max(1, mid - s)); c.low = b < mid ? 0 : 1; }
      else { c.low = b < mid ? 1 : 0; c.gain = b < mid ? 1 : down((b - mid) / Math.max(1, e - mid)); }
      break;
    case 'filter':
      if (side === 'out') { c.filter = 0.85 * clamp(u); c.gain = u < 0.75 ? 1 : down((u - 0.75) / 0.25); }
      else { c.filter = -0.85 * (1 - clamp(u / 0.5)); c.gain = up(u / 0.25); }
      break;
    case 'echo':
      // The incoming song comes in over the first quarter; the outgoing one plays on, its echo opening over the last
      // bar, then stops on the last beat and leaves its echoes.
      if (side === 'in') c.gain = up(u / 0.25);
      else { c.echo = clamp((b - (e - 4)) / 4); c.gain = b < e - 1 ? 1 : clamp(e - b); }
      break;
    case 'double': {
      // Both at full once the drops land at `drop`; the outgoing song's bass goes then, and it fades over its last 8 beats.
      const d = s + (drop ?? Math.min(len, 16));
      if (side === 'in') { c.gain = up((b - s) / Math.max(1, Math.min(16, d - s))); c.low = b < d ? 0 : 1; }
      else { c.low = b < d ? 1 : 0; c.gain = b < e - 8 ? 1 : down((b - (e - 8)) / 8); }
      break;
    }
  }
  return c;
}

/** Song `i`'s controls at mix beat `b`: silent outside its span, shaped by its hand-overs in and out. */
export function controlsAt(items: SetItem[], i: number, b: number): Ctl {
  const it = items[i], end = it.start + it.beats;
  if (b < it.start || b >= end) return SILENT;
  let c: Ctl = FLAT;
  const prev = items[i - 1], next = items[i + 1];
  if (prev && b < prev.start + prev.beats) {
    const k = handOver(prev.fx?.style ?? 'blend', 'in', b, it.start, prev.start + prev.beats, prev.fx?.drop);
    c = k;
  }
  if (next && b >= next.start) {
    const k = handOver(it.fx?.style ?? 'blend', 'out', b, next.start, end, it.fx?.drop);
    c = c === FLAT ? k : { gain: c.gain * k.gain, low: Math.min(c.low, k.low), mid: Math.min(c.mid, k.mid), high: Math.min(c.high, k.high), filter: Math.abs(k.filter) > Math.abs(c.filter) ? k.filter : c.filter, echo: Math.max(c.echo, k.echo) };
  }
  return c;
}
