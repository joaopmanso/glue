/* The Prepare tab's waveforms (ADR 0052): a stretch of the track (the deck view, or the whole track as
   the overview), mirrored around the middle, in one of several colour schemes, with the beat grid.
   - rgb:   the three bands as red / green / blue, height from the peak (Rekordbox-like);
   - blue:  one colour from deep blue (lows) to white (highs), height from the peak;
   - bands: the three bands stacked, lows widest (orange), mids, highs (white) on top;
   - mono:  the peak in the accent colour. */
import type { Waveform } from '../../core/audio/waveform';
import { beatsBetween } from '../../core/audio/waveform';
import { theme, withAlpha, MONO } from './canvas';
import type { CuePoint } from '../../core/interop/types';

export type Scheme = 'rgb' | 'blue' | 'bands' | 'mono';
export const SCHEMES: { id: Scheme; name: string }[] = [
  { id: 'rgb', name: 'RGB (3-band)' }, { id: 'blue', name: 'Blue' }, { id: 'bands', name: 'Bands' }, { id: 'mono', name: 'Mono' },
];

export interface GridView { bpm: number; beat0: number; bar: number }
export interface WaveOpts {
  scheme: Scheme;
  /** No background of its own: the page's shows through (the Overview column, in any theme). */
  clear?: boolean;
  t0: number; t1: number;            // the stretch shown (s)
  grid: GridView | null;
  playhead: number | null;           // s
  numbers?: boolean;                 // bar numbers on the grid (the deck view)
  loop?: { a: number; b: number } | null;   // the loop playing now
  cues?: CuePoint[];                         // hot cues (flags with their letter), memory cues, saved loops
}

/** The loudest of each band over the points under one pixel column. */
function column(w: Waveform, a: number, b: number) {
  let l = 0, m = 0, h = 0, p = 0;
  const i0 = Math.max(0, Math.floor(a)), i1 = Math.min(w.low.length, Math.max(i0 + 1, Math.ceil(b)));
  for (let i = i0; i < i1; i++) {
    if (w.low[i] > l) l = w.low[i]; if (w.mid[i] > m) m = w.mid[i]; if (w.high[i] > h) h = w.high[i]; if (w.peak[i] > p) p = w.peak[i];
  }
  return { l, m, h, p };
}

export function drawWave(ctx: CanvasRenderingContext2D, W: number, H: number, w: Waveform | null, o: WaveOpts) {
  const T = theme(), span = o.t1 - o.t0;
  ctx.clearRect(0, 0, W, H);
  if (!o.clear) { ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, W, H); }
  if (!w || !(span > 0)) return;
  const x = (t: number) => (t - o.t0) / span * W;
  // Loop region behind the wave.
  if (o.loop) { ctx.fillStyle = withAlpha(T.accent.startsWith('#') ? T.accent : '#f5c518', 0.14); ctx.fillRect(x(o.loop.a), 0, x(o.loop.b) - x(o.loop.a), H); }
  // The wave and the grid are drawn in device pixels: in CSS pixels on a 1.25× or 1.5× screen every column straddled
  // device pixels and its edges blended with the next one's, which striped the wave with fixed lighter and darker lines.
  const dpr = ctx.getTransform().a || 1, Wd = Math.round(W * dpr), Hd = Math.round(H * dpr), midd = Hd / 2;
  const xd = (t: number) => (t - o.t0) / span * Wd;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  // The grid behind the wave (it shows in the quiet parts and never washes the wave's colours): beats faint, bar lines
  // strong. Too dense to see: bars only.
  const beats = o.grid && o.grid.bpm > 0 ? (() => {
    const g = o.grid!, beatPx = W / (span * g.bpm / 60), onlyBars = beatPx < 6, out: { x: number; n: number }[] = [];
    for (const b of beatsBetween(g.beat0, g.bpm, Math.max(0, o.t0), o.t1)) {
      const bar = ((b.n - g.bar) % 4 + 4) % 4 === 0;
      if (onlyBars && !bar) continue;
      if (onlyBars && W / (span * g.bpm / 240) < 5 && Math.floor((b.n - g.bar) / 4) % 8 !== 0) continue;
      const bx = Math.round(xd(b.t)) + 0.5;
      ctx.strokeStyle = bar ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, bar ? 0 : Hd * 0.12); ctx.lineTo(bx, bar ? Hd : Hd * 0.88); ctx.stroke();
      if (bar) out.push({ x: bx / dpr, n: Math.floor((b.n - g.bar) / 4) + 1 });
    }
    return out;
  })() : [];
  // Columns are cut from the track, not from the view: column k holds points [k·pts, (k+1)·pts). As the view scrolls
  // they slide along whole; cut from the view, each frame's columns caught different peaks and the wave shimmered.
  const pts = Math.max(1, w.rate * span / Wd);   // waveform points per device-pixel column
  const k0 = Math.max(0, Math.floor(o.t0 * w.rate / pts)), k1 = Math.min(Math.ceil(w.low.length / pts), Math.ceil(o.t1 * w.rate / pts) + 1);
  const room = midd - 2 * dpr;
  for (let k = k0; k < k1; k++) {
    const a = k * pts, px = Math.round(xd(a / w.rate)), bw = Math.max(1, Math.round(xd((a + pts) / w.rate)) - px);
    if (px + bw <= 0 || px >= Wd) continue;
    const c = column(w, a, a + pts);
    const hp = Math.round(c.p / 255 * room);
    if (o.scheme === 'rgb') {
      const s = 255 / Math.max(1, c.l, c.m, c.h);
      ctx.fillStyle = `rgb(${Math.round(c.l * s)},${Math.round(c.m * s)},${Math.round(c.h * s)})`;
      ctx.fillRect(px, midd - hp, bw, hp * 2);
    } else if (o.scheme === 'blue') {
      const f = c.h / Math.max(1, c.l + c.m + c.h) * 1.8, v = Math.min(1, f);
      ctx.fillStyle = `rgb(${Math.round(20 + 200 * v)},${Math.round(90 + 150 * v)},255)`;
      ctx.fillRect(px, midd - hp, bw, hp * 2);
    } else if (o.scheme === 'bands') {
      const hl = Math.round(c.l / 255 * room), hm = Math.round(c.m / 255 * room * 0.8), hh = Math.round(c.h / 255 * room * 0.6);
      ctx.fillStyle = '#ff8a1f'; ctx.fillRect(px, midd - hl, bw, hl * 2);
      ctx.fillStyle = '#ffd35c'; ctx.fillRect(px, midd - hm, bw, hm * 2);
      ctx.fillStyle = o.clear ? T.ink2 || '#f4f4f6' : '#f4f4f6'; ctx.fillRect(px, midd - hh, bw, hh * 2);
    } else {
      ctx.fillStyle = T.accent || '#f5c518';
      ctx.fillRect(px, midd - hp, bw, hp * 2);
    }
  }
  ctx.restore();
  // The bar numbers stay on top (the deck view).
  if (o.numbers && beats.length) {
    ctx.font = '10px ' + MONO; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (const b of beats) ctx.fillText(String(b.n), b.x + 3, 3);
  }
  // Cues: saved loops as bands, then a line and a flag per cue (hot cues lettered A–H).
  for (const c of o.cues ?? []) {
    if (c.end == null || c.end < o.t0 || c.t > o.t1) continue;
    ctx.fillStyle = withAlpha(c.color ?? '#e91a2d', 0.16); ctx.fillRect(x(c.t), 0, x(c.end) - x(c.t), H);
  }
  ctx.font = 'bold 10px ' + MONO; ctx.textBaseline = 'top';
  for (const c of o.cues ?? []) {
    if (c.t < o.t0 || c.t > o.t1) continue;
    const cx = Math.round(x(c.t)) + 0.5, col = c.color ?? '#e91a2d';
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    if (c.num != null) {
      ctx.fillStyle = col; ctx.fillRect(cx, H - 14, 13, 14);
      ctx.fillStyle = '#000'; ctx.fillText('ABCDEFGH'[c.num] ?? '?', cx + 3, H - 12);
    } else {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - 5, H); ctx.lineTo(cx + 5, H); ctx.lineTo(cx, H - 7); ctx.closePath(); ctx.fill();
    }
  }
  if (o.playhead != null) {
    const px = Math.round(x(o.playhead)) + 0.5;
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
}
