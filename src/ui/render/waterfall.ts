/* The live view's 3D mode: recent spectra as ridges running from "now" at the front toward a
   vanishing point on the horizon. Frequency is logarithmic across, level is height and colour.
   Frames are painted back to front, each filled opaque so nearer ridges hide the ones behind. */
import { MONO, type Theme } from './canvas';

export const WF_BANDS = 220;     // log-spaced frequency bands across
export const WF_DEPTH = 110;     // frames from front to horizon
export const WF_FPS = 36;        // frames per second pushed back

/** Frequency of a band edge: log-spaced from 20 Hz to Nyquist. */
export const bandFreq = (b: number, nyq: number) => 20 * Math.pow(nyq / 20, b / WF_BANDS);

/** Which analyser bins make up each band (at least one bin each). */
export function bandBins(binCount: number, sampleRate: number): Int32Array {
  const edges = new Int32Array(WF_BANDS + 1), nyq = sampleRate / 2;
  for (let b = 0; b <= WF_BANDS; b++) edges[b] = Math.min(binCount, Math.max(1, Math.round(bandFreq(b, nyq) / nyq * binCount)));
  for (let b = 1; b <= WF_BANDS; b++) if (edges[b] <= edges[b - 1]) edges[b] = Math.min(binCount, edges[b - 1] + 1);
  return edges;
}

export interface WaterfallFrame { t: Float32Array }   // 0–1 per band

export function drawWaterfall(ctx: CanvasRenderingContext2D, area: { l: number; t: number; w: number; h: number }, frames: WaterfallFrame[],
  lut: Uint8ClampedArray, nyq: number, C: Theme, cutHz: number | null, seconds: number) {
  const { l, t, w, h } = area;
  const horizon = t + h * 0.08, front = t + h - 22, cx = l + w / 2;
  const ampH = h * 0.58, K = 4.2;                                  // K: how fast the far end shrinks
  const scale = (z: number) => 1 / (1 + z * K);
  const X = (xn: number, s: number) => cx + (xn - 0.5) * w * 0.96 * s;
  const ground = (s: number) => horizon + (front - horizon) * s;
  const rgb = (v: number) => { const i = Math.max(0, Math.min(255, Math.round(v * 255))) * 3; return 'rgb(' + lut[i] + ',' + lut[i + 1] + ',' + lut[i + 2] + ')'; };

  // Sky and floor.
  const sky = ctx.createLinearGradient(0, t, 0, front);
  sky.addColorStop(0, '#05070a'); sky.addColorStop(1, '#000');
  ctx.fillStyle = sky; ctx.fillRect(l, t, w, h);

  // Floor grid: frequency lines converging on the horizon, time lines across.
  ctx.lineWidth = 1;
  const ticks = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 40000, 80000].filter(f => f < nyq * 0.98);
  const xnOf = (f: number) => Math.log(f / 20) / Math.log(nyq / 20);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (const f of ticks) {
    const xn = xnOf(f);
    ctx.beginPath(); ctx.moveTo(X(xn, 1), ground(1)); ctx.lineTo(X(xn, scale(1)), ground(scale(1))); ctx.stroke();
  }
  for (let k = 0; k <= 4; k++) {
    const s = scale(k / 4);
    ctx.beginPath(); ctx.moveTo(X(0, s), ground(s)); ctx.lineTo(X(1, s), ground(s)); ctx.stroke();
  }

  // Ridges, far to near.
  const n = frames.length;
  for (let d = n - 1; d >= 0; d--) {
    const z = n > 1 ? d / (WF_DEPTH - 1) : 0, s = scale(z), g = ground(s), fog = 1 - z * 0.8;
    const v = frames[n - 1 - d].t;
    ctx.beginPath();
    ctx.moveTo(X(0, s), g);
    for (let b = 0; b < WF_BANDS; b++) ctx.lineTo(X((b + 0.5) / WF_BANDS, s), g - v[b] * ampH * s);
    ctx.lineTo(X(1, s), g);
    ctx.closePath();
    ctx.fillStyle = '#000'; ctx.fill();                          // hides the ridges behind
    const grad = ctx.createLinearGradient(0, g, 0, g - ampH * s);
    for (let k = 0; k <= 6; k++) grad.addColorStop(k / 6, rgb(k / 6));
    ctx.globalAlpha = fog * 0.9; ctx.fillStyle = grad; ctx.fill();
    // Crest line, brighter near the front.
    ctx.globalAlpha = fog * (d === 0 ? 1 : 0.55);
    ctx.strokeStyle = d === 0 ? '#fff' : rgb(0.85);
    ctx.lineWidth = d === 0 ? 1.4 : 0.8;
    ctx.beginPath();
    for (let b = 0; b < WF_BANDS; b++) { const x = X((b + 0.5) / WF_BANDS, s), y = g - v[b] * ampH * s; if (b) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // The file's measured cutoff: a line into the distance.
  if (cutHz && cutHz < nyq) {
    const xn = xnOf(cutHz);
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(xn, 1), ground(1) + 2); ctx.lineTo(X(xn, scale(1)), ground(scale(1))); ctx.stroke(); ctx.restore();
  }

  // Labels: frequencies along the front edge, time toward the horizon.
  ctx.font = '11px ' + MONO; ctx.fillStyle = C.muted; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  let lastX = -Infinity;
  for (const f of ticks) {
    const x = X(xnOf(f), 1);
    if (x - lastX < 42) continue;
    ctx.fillText(f < 1000 ? String(f) : f / 1000 + 'k', x, front + 6); lastX = x;
  }
  ctx.textAlign = 'left'; ctx.fillText('now', l + 4, front + 6);
  ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
  ctx.fillText('−' + seconds.toFixed(0) + ' s', cx, ground(scale(1)) - 2);
}
