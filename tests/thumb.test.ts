import { describe, expect, it } from 'vitest';
import { makeThumb, THUMB_H, THUMB_W, makeWaveThumb, WAVE_BYTES } from '../src/core/library/thumb';

describe('mini spectrogram thumbnails (ADR 0031)', () => {
  it('is 192 × 16 bytes, high frequencies on top, time left to right', () => {
    const cols = 1600, rows = 512, spec = new Float32Array(cols * rows).fill(-150);
    // A loud low band during the first half only; nothing above.
    for (let c = 0; c < cols / 2; c++) for (let r = 0; r < 20; r++) spec[c * rows + r] = -10;
    const t = makeThumb({ spec, cols, rows });
    expect(t.length).toBe(THUMB_W * THUMB_H);
    const at = (x: number, y: number) => t[y * THUMB_W + x];
    expect(at(10, THUMB_H - 1)).toBeGreaterThan(200);        // bottom row, early: loud
    expect(at(THUMB_W - 10, THUMB_H - 1)).toBe(0);           // bottom row, late: silent
    expect(at(10, 0)).toBe(0);                               // top row: nothing up there
  });
  it('works from the stored (512-row) and the full (1024-row) spectrogram alike', () => {
    const mk = (rows: number) => { const s = new Float32Array(100 * rows).fill(-60); return makeThumb({ spec: s, cols: 100, rows }); };
    expect(Array.from(mk(512))).toEqual(Array.from(mk(1024)));
  });
});

describe('the Overview column’s mini waveform (2026-09-27)', () => {
  it('shows each band where it sounds, scaled to the track’s loudest', () => {
    // 400 columns × 512 bins up to 24 kHz: lows (100 Hz) in the first half, highs (8 kHz) in the second.
    const cols = 400, rows = 512, sr = 48000, spec = new Float32Array(cols * rows).fill(-140);
    const bin = (hz: number) => Math.round(hz / (sr / 2) * rows);
    for (let c = 0; c < cols; c++) spec[c * rows + (c < 200 ? bin(100) : bin(8000))] = -6;
    const w = makeWaveThumb({ spec, cols, rows, sr });
    expect(w.length).toBe(WAVE_BYTES);
    const at = (x: number, k: number) => w[x * 4 + k];
    expect(at(10, 0)).toBe(255); expect(at(10, 2)).toBeLessThan(5);      // lows, no highs
    expect(at(90, 2)).toBeLessThan(5); expect(at(100, 2)).toBe(255);    // highs from the middle (column 96)
    expect(at(10, 3)).toBe(255); expect(at(100, 3)).toBe(255);         // the level: both loud
    expect(makeWaveThumb({ spec, cols: 0, rows, sr }).every(v => v === 0)).toBe(true);
  });
});
