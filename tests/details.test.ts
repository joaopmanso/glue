import { describe, expect, it } from 'vitest';
import { runJob } from '../src/core/audio/analyze';
import { classify } from '../src/core/audio/verdict';
import { decodeDetails, encodeDetails, loadDetails, saveDetails } from '../src/store/details';
import type { FileInfo } from '../src/core/types';
import { MemDir, asDir } from './memfs';

const info = { container: 'FLAC', codec: 'FLAC', lossless: true, sampleRate: 96000, bits: 24, channels: 2, duration: 10, bitrate: 0, bitrateMode: '', encoder: '', vendor: '', tags: { TITLE: 'x' }, notes: [], clues: [] } as FileInfo;

describe('stored track analysis (ADR 0023)', () => {
  const res = runJob({ type: 'demo' }, () => {});
  it('round-trips with the same verdict, tempo, key and a spectrogram within 0.4 dB', () => {
    const { header, bin } = encodeDetails(info, res, { size: 10, mtime: 5 });
    expect(bin.length).toBe(res.ltas.length * 4 + res.spec.length);   // one byte per spectrogram cell
    const back = decodeDetails(JSON.parse(JSON.stringify(header)), bin);
    expect(Array.from(back.res.ltas)).toEqual(Array.from(res.ltas));
    let worst = 0;
    for (let i = 0; i < res.spec.length; i++) if (res.spec[i] > -204) worst = Math.max(worst, Math.abs(back.res.spec[i] - res.spec[i]));
    expect(worst).toBeLessThanOrEqual(0.41);
    expect(back.res.music).toEqual(res.music);
    expect(classify(back.info, back.res).label).toBe(classify(info, res).label);
  });
  it('is ignored once the file changes', async () => {
    const mem = new MemDir(), root = asDir(mem);
    await saveDetails(root, 'c', 'ab12', info, res, { size: 10, mtime: 5 });
    expect(await loadDetails(root, 'c', 'ab12', { size: 10, mtime: 5 })).not.toBeNull();
    expect(await loadDetails(root, 'c', 'ab12', { size: 11, mtime: 5 })).toBeNull();
    expect(await loadDetails(root, 'c', 'nope', { size: 10, mtime: 5 })).toBeNull();
  });
});
