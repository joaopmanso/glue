/* The track table's mini spectrogram (ADR 0031): 192 × 16 bytes (≈3 KB) per track, made from the
   analysis spectrogram. Columns are time, rows frequency (top = high), bands spaced by a power curve
   so the lows get room without losing the top octave (where lossy cutoffs show). */
export const THUMB_W = 192, THUMB_H = 16;
const FLOOR = -110;   // dB shown as black

/** `spec` is column-major (cols × rows, dB), rows linear from 0 to Nyquist, as in the analysis. */
export function makeThumb(r: { spec: Float32Array; cols: number; rows: number }): Uint8Array {
  const out = new Uint8Array(THUMB_W * THUMB_H), { spec, cols, rows } = r;
  if (!cols || !rows) return out;
  const edge = (k: number) => Math.min(rows, Math.round(rows * Math.pow(k / THUMB_H, 1.7)));
  for (let x = 0; x < THUMB_W; x++) {
    const c0 = Math.floor(x * cols / THUMB_W), c1 = Math.max(c0 + 1, Math.floor((x + 1) * cols / THUMB_W));
    for (let k = 0; k < THUMB_H; k++) {
      const r0 = edge(k), r1 = Math.max(r0 + 1, edge(k + 1));
      let m = -Infinity;
      for (let c = c0; c < c1 && c < cols; c++) { const o = c * rows; for (let rr = r0; rr < r1 && rr < rows; rr++) if (spec[o + rr] > m) m = spec[o + rr]; }
      const v = Math.max(0, Math.min(1, (m - FLOOR) / -FLOOR));
      out[(THUMB_H - 1 - k) * THUMB_W + x] = Math.round(Math.pow(v, 1.4) * 255);   // gamma: quiet detail stays dark
    }
  }
  return out;
}

/** The track table's mini waveform (the user's list, 2026-09-27): per column, the level of the lows
    (< 200 Hz), mids and highs (> 2.5 kHz) and of everything, from the analysis spectrogram (each band's
    energy), each scaled to the track's own loudest point with the Prepare waveform's curve. So the
    Overview column can show a waveform without decoding the songs again. 192 columns × 4 bytes. */
export const WAVE_BYTES = THUMB_W * 4;
export function makeWaveThumb(r: { spec: Float32Array; cols: number; rows: number; sr: number }): Uint8Array {
  const out = new Uint8Array(WAVE_BYTES), { spec, cols, rows, sr } = r;
  if (!cols || !rows || !(sr > 0)) return out;
  const nyq = sr / 2, e1 = Math.max(1, Math.round(200 / nyq * rows)), e2 = Math.max(e1 + 1, Math.round(2500 / nyq * rows));
  const bands = [new Float64Array(THUMB_W), new Float64Array(THUMB_W), new Float64Array(THUMB_W), new Float64Array(THUMB_W)];
  const LN = Math.LN10 / 10;   // dB → power: exp(dB · ln10 / 10)
  for (let x = 0; x < THUMB_W; x++) {
    const c0 = Math.floor(x * cols / THUMB_W), c1 = Math.max(c0 + 1, Math.floor((x + 1) * cols / THUMB_W));
    let pl = 0, pm = 0, ph = 0, n = 0;
    for (let c = c0; c < c1 && c < cols; c++, n++) {
      const o = c * rows;
      for (let k = 1; k < rows; k++) { const p = Math.exp(spec[o + k] * LN); if (k < e1) pl += p; else if (k < e2) pm += p; else ph += p; }
    }
    if (!n) continue;
    bands[0][x] = Math.sqrt(pl / n); bands[1][x] = Math.sqrt(pm / n); bands[2][x] = Math.sqrt(ph / n); bands[3][x] = Math.sqrt((pl + pm + ph) / n);
  }
  bands.forEach((b, k) => {
    let max = 0; for (const v of b) if (v > max) max = v;
    if (max > 0) for (let x = 0; x < THUMB_W; x++) out[x * 4 + k] = Math.round(255 * Math.pow(b[x] / max, 0.75));
  });
  return out;
}
