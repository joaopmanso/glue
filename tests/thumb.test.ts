import { describe, expect, it } from 'vitest';
import { makeThumb, THUMB_H, THUMB_W } from '../src/core/library/thumb';

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
