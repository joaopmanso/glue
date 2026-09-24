import type { AnalysisResult, Verdict } from '../../core/types';
import { fmtDb, fmtKHz, freqLabel, niceStep } from '../../core/format';
import { MONO, fitCanvas, theme, withAlpha, type PlotRect } from './canvas';

/** Average-spectrum chart: smoothed LTAS line, floor, cutoff, hover tooltip. */
export function drawLtas(cv: HTMLCanvasElement, r: AnalysisResult, v: Verdict, hoverX: number | null): PlotRect {
  const { ctx, w, h } = fitCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const C = theme(), sm = v.cut.sm, n = sm.length, binHz = r.binHz, nyq = r.sr / 2;
  const m = { l: 46, r: 12, t: 12, b: 24 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
  let mx = -Infinity;
  for (let k = Math.max(1, Math.round(30 / binHz)); k < n; k++) if (sm[k] > mx) mx = sm[k];
  const yMax = Math.ceil((mx + 6) / 10) * 10, yMin = Math.max(-190, Math.min(yMax - 40, Math.floor((v.cut.globalFloor - 12) / 10) * 10));
  const Y = (db: number) => m.t + (yMax - Math.max(yMin, Math.min(yMax, db))) / (yMax - yMin) * ph;
  const X = (f: number) => m.l + f / nyq * pw;
  ctx.font = '11px ' + MONO; ctx.lineWidth = 1;
  const ds = niceStep(yMax - yMin, Math.max(3, Math.floor(ph / 36)));
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let db = Math.ceil(yMin / ds) * ds; db <= yMax; db += ds) {
    const y = Math.round(Y(db)) + 0.5;
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
    ctx.fillStyle = C.muted; ctx.fillText(db === 0 ? '0' : (db < 0 ? '−' : '') + Math.abs(db), m.l - 7, y);
  }
  const fs = niceStep(nyq, Math.max(3, Math.floor(pw / 60)));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let f = 0; f <= nyq + 1; f += fs) {
    const x = Math.round(X(f)) + 0.5;
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(x, m.t + ph); ctx.lineTo(x, m.t + ph + 4); ctx.stroke();
    ctx.fillStyle = C.muted; ctx.fillText(freqLabel(f), Math.min(w - m.r - 10, Math.max(m.l + 8, x)), m.t + ph + 7);
  }
  // reference Nyquists
  ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = C.line2;
  for (const ref of [22050, 24000]) {
    if (ref >= nyq * 0.97) continue;
    const x = Math.round(X(ref)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
  }
  ctx.restore();
  // series
  const pts: [number, number][] = [];
  for (let px = 0; px <= pw; px++) {
    const k0 = Math.floor(px / pw * nyq / binHz), k1 = Math.max(k0, Math.floor((px + 1) / pw * nyq / binHz));
    let best = -Infinity;
    for (let k = k0; k <= Math.min(n - 1, k1); k++) if (sm[k] > best) best = sm[k];
    pts.push([m.l + px, Y(best)]);
  }
  const grad = ctx.createLinearGradient(0, m.t, 0, m.t + ph);
  grad.addColorStop(0, withAlpha(C.accent, 0.22));
  grad.addColorStop(1, withAlpha(C.accent, 0.02));
  ctx.beginPath(); ctx.moveTo(pts[0][0], m.t + ph);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], m.t + ph); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  // floor
  const fy = Math.round(Y(v.cut.globalFloor)) + 0.5;
  ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(m.l, fy); ctx.lineTo(m.l + pw, fy); ctx.stroke(); ctx.restore();
  ctx.fillStyle = C.ink2; ctx.font = '10px ' + MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('noise floor ' + fmtDb(v.cut.globalFloor), m.l + pw - 4, fy - 3);
  // cutoff
  if (!v.cut.full || v.cut.wall) {
    const x = Math.round(X(v.cut.fc)) + 0.5;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
    const label = (v.cut.wall ? 'wall ' : 'fades ') + fmtKHz(v.cut.fc);
    ctx.font = '600 11px ' + MONO;
    const tw = ctx.measureText(label).width, left = x + tw + 12 > m.l + pw;
    ctx.fillStyle = C.ink; ctx.textAlign = left ? 'right' : 'left'; ctx.textBaseline = 'top';
    ctx.fillText(label, left ? x - 6 : x + 6, m.t + 4);
  }
  // hover
  if (hoverX != null) {
    const px = Math.max(0, Math.min(pw, hoverX - m.l));
    const f = px / pw * nyq, k = Math.min(n - 1, Math.round(f / binHz)), y = Y(sm[k]), x = m.l + px;
    ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, m.t); ctx.lineTo(Math.round(x) + 0.5, m.t + ph); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.surface; ctx.stroke();
    const t1 = (f / 1000).toFixed(2) + ' kHz', t2 = (sm[k] < 0 ? '−' : '') + Math.abs(sm[k]).toFixed(1) + ' dB';
    ctx.font = '600 11px ' + MONO;
    const bw = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) + 16, bh = 38;
    let bx = x + 10; if (bx + bw > m.l + pw) bx = x - 10 - bw;
    const by = Math.min(m.t + ph - bh - 4, Math.max(m.t + 4, y - bh - 8));
    ctx.fillStyle = C.raised; ctx.strokeStyle = C.line2; ctx.lineWidth = 1;
    ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(t1, bx + 8, by + 6);
    ctx.fillStyle = C.ink2; ctx.font = '11px ' + MONO; ctx.fillText(t2, bx + 8, by + 21);
  }
  return { ...m, pw, ph };
}
