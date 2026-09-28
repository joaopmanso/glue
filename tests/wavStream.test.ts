import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { wavBytes, wavView } from '../src/core/formats/wavStream';
import { parseContainer } from '../src/core/formats/parse';
import { pcmToWav } from '../src/core/formats/wav';

describe('an AIFF streamed as WAV (ADR 0088)', () => {
  const aiff = new Uint8Array(readFileSync(new URL('./fixtures/aiff-44k-24.aiff', import.meta.url)));
  it('gives the same bytes as rewrapping the whole file, for any range, from the file’s start alone', async () => {
    const whole = new Uint8Array(await pcmToWav(aiff, parseContainer(aiff).pcm!, parseContainer(aiff).sampleRate).arrayBuffer());
    const v = wavView(aiff.subarray(0, 4096), aiff.length)!;
    expect(v).not.toBeNull();
    expect(v.total).toBe(whole.length);
    const read = async (a: number, b: number) => aiff.slice(a, b);
    for (const [s, e] of [[0, 1], [0, 43], [0, 100], [40, 50], [44, 44], [45, 1000], [1001, 5003], [whole.length - 7, whole.length + 100]]) {
      expect(Array.from(await wavBytes(v, s, e, read))).toEqual(Array.from(whole.subarray(s, Math.min(e, whole.length - 1) + 1)));
    }
  });
  it('isn’t made for what isn’t an AIFF', () => {
    expect(wavView(new Uint8Array(100), 100)).toBeNull();
  });
});
