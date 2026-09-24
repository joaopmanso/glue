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
