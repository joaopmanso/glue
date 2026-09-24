import { describe, expect, it } from 'vitest';
import { runJob } from '../src/core/audio/analyze';
import { classify } from '../src/core/audio/verdict';
import { MAX_ROWS, decodeDetails, encodeDetails, hasDetails, loadDetails, writeDetails } from '../src/store/details';
import type { FileInfo } from '../src/core/types';
import { MemDir, asDir } from './memfs';

const info = { container: 'FLAC', codec: 'FLAC', lossless: true, sampleRate: 96000, bits: 24, channels: 2, duration: 10, bitrate: 0, bitrateMode: '', encoder: '', vendor: '', tags: { TITLE: 'x' }, notes: [], clues: [] } as FileInfo;

describe('stored track analysis (ADR 0023, 0024)', () => {
  const res = runJob({ type: 'demo' }, () => {});
  it('round-trips: same verdict, tempo, key; the spectrogram at ≤512 rows, within 0.4 dB of the loudest cell', async () => {
    const d = await encodeDetails(info, res, { size: 10, mtime: 5 });
    expect(d.bin.length).toBeLessThan(res.ltas.length * 4 + res.cols * MAX_ROWS);   // compressed
    const back = await decodeDetails(JSON.parse(JSON.stringify(d.header)), d.bin);
    const f = Math.ceil(res.rows / MAX_ROWS);
    expect(back.res.rows).toBe(Math.ceil(res.rows / f));
    expect(Array.from(back.res.ltas)).toEqual(Array.from(res.ltas));
    let worst = 0;
    for (let c = 0; c < res.cols; c++) for (let r = 0; r < back.res.rows; r++) {
      let m = -Infinity;
      for (let k = r * f; k < Math.min(res.rows, r * f + f); k++) m = Math.max(m, res.spec[c * res.rows + k]);
      if (m > -204) worst = Math.max(worst, Math.abs(back.res.spec[c * back.res.rows + r] - Math.min(0, m)));
    }
    expect(worst).toBeLessThanOrEqual(0.41);
    expect(back.res.music).toEqual(res.music);
    expect(classify(back.info, back.res).label).toBe(classify(info, res).label);
  });
  it('is ignored once the file changes', async () => {
    const mem = new MemDir(), dir = asDir(mem);
    await writeDetails(dir, 'c1', 'ab12', await encodeDetails(info, res, { size: 10, mtime: 5 }));
    expect(await hasDetails(dir, 'c1', 'ab12', { size: 10, mtime: 5 })).toBe(true);
    expect(await loadDetails(dir, 'c1', 'ab12', { size: 10, mtime: 5 })).not.toBeNull();
    expect(await loadDetails(dir, 'c1', 'ab12', { size: 11, mtime: 5 })).toBeNull();
    expect(await loadDetails(dir, 'c1', 'nope', { size: 10, mtime: 5 })).toBeNull();
  });
});
