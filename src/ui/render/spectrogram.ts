import type { AnalysisResult, Verdict } from '../../core/types';
import { fmtKHz, fmtTime, freqLabel, niceStep, niceTimeStep } from '../../core/format';
import { MONO, fitCanvas, theme, type PlotRect } from './canvas';

export interface SpecView {
  res: AnalysisResult;
  verdict: Verdict | null;
  img: HTMLCanvasElement | null;
  lut: Uint8ClampedArray;
  dbFloor: number;
  markers: boolean;
  playhead: number | null;       // seconds, or null when not playing / not started
  hover: { x: number; y: number } | null;
}

/** Spek-style spectrogram with axes, reference lines, cutoff tag, playhead, hover crosshair, colour bar. */
export function drawSpec(cv: HTMLCanvasElement, v: SpecView): PlotRect {
  const { ctx, w, h } = fitCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const r = v.res, C = theme(), narrow = w < 560;
  const m = { l: 46, r: narrow ? 8 : 64, t: 6, b: 24 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
  ctx.fillStyle = '#000'; ctx.fillRect(m.l, m.t, pw, ph);
  if (v.img) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(v.img, m.l, m.t, pw, ph); }
  const nyq = r.sr / 2, dur = r.duration;
  ctx.font = '11px ' + MONO; ctx.fillStyle = C.muted; ctx.strokeStyle = C.line2; ctx.lineWidth = 1;
  const fs = niceStep(nyq, Math.max(3, Math.floor(ph / 40)));
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let f = 0; f <= nyq + 1; f += fs) {
    const y = Math.round(m.t + ph - f / nyq * ph) + 0.5;
    ctx.fillText(freqLabel(f), m.l - 7, Math.min(m.t + ph - 4, Math.max(m.t + 5, y)));
    ctx.beginPath(); ctx.moveTo(m.l - 4, y); ctx.lineTo(m.l, y); ctx.stroke();
  }
  const ts = niceTimeStep(dur, Math.max(2, Math.floor(pw / 80)));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let t = 0; t <= dur + 1e-6; t += ts) {
    const x = Math.round(m.l + t / dur * pw) + 0.5;
    ctx.fillText(fmtTime(t, ts < 1), Math.min(w - m.r - 14, Math.max(m.l + 12, x)), m.t + ph + 7);
    ctx.beginPath(); ctx.moveTo(x, m.t + ph); ctx.lineTo(x, m.t + ph + 4); ctx.stroke();
  }
  const cut = v.verdict?.cut;
  if (v.markers && cut) {
    ctx.save();
    ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.font = '10px ' + MONO;
    for (const ref of [16000, 20000, 22050, 24000, 44100, 48000]) {
      if (ref >= nyq * 0.97) continue;
      if (Math.abs(ref - cut.fc) < nyq * 0.02) continue;
      const y = Math.round(m.t + ph - ref / nyq * ph) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
      ctx.fillText(freqLabel(ref), m.l + pw - 4, y - 2);
    }
    if (!cut.full || cut.wall) {
      const y = Math.round(m.t + ph - cut.fc / nyq * ph) + 0.5;
      ctx.setLineDash([]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
      const label = (cut.wall ? 'wall ' : 'fades ') + fmtKHz(cut.fc);
      ctx.font = '600 11px ' + MONO;
      const tw = ctx.measureText(label).width;
      const ly = y - 20 < m.t ? y + 4 : y - 20;
      ctx.fillStyle = C.accent; ctx.fillRect(m.l + 6, ly, tw + 10, 16);
      ctx.fillStyle = C.accentInk; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, m.l + 11, ly + 8.5);
    }
    ctx.restore();
  }
  if (v.playhead != null) {
    const px = Math.round(m.l + Math.min(1, v.playhead / dur) * pw) + 0.5;
    ctx.save();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, m.t); ctx.lineTo(px, m.t + ph); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(px - 5, m.t); ctx.lineTo(px + 5, m.t); ctx.lineTo(px, m.t + 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  if (v.hover) {
    const { x, y } = v.hover;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, m.t); ctx.lineTo(Math.round(x) + 0.5, m.t + ph);
    ctx.moveTo(m.l, Math.round(y) + 0.5); ctx.lineTo(m.l + pw, Math.round(y) + 0.5); ctx.stroke(); ctx.restore();
  }
  if (!narrow) {
    const bx = w - m.r + 12, bw = 10, lut = v.lut;
    for (let i = 0; i < ph; i++) {
      const li = Math.round((1 - i / (ph - 1)) * 255) * 3;
      ctx.fillStyle = 'rgb(' + lut[li] + ',' + lut[li + 1] + ',' + lut[li + 2] + ')';
      ctx.fillRect(bx, m.t + i, bw, 1);
    }
    ctx.font = '10px ' + MONO; ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const ds = niceStep(-v.dbFloor, Math.max(3, Math.floor(ph / 44)));
    for (let db = 0; db >= v.dbFloor - 0.01; db -= ds) {
      const y = m.t + (-db) / (-v.dbFloor) * ph;
      ctx.fillText(db === 0 ? '0' : '−' + Math.abs(db), bx + bw + 5, Math.min(m.t + ph - 5, Math.max(m.t + 5, y)));
    }
  }
  return { ...m, pw, ph };
}
