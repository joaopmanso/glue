import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { keepRange } from '../src/core/audio/trim';
import { mp3Gapless, parseContainer } from '../src/core/formats/parse';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url)));

describe('decoded samples kept as the browser decoder keeps them (ADR 0060)', () => {
  it('MP3 with a LAME tag: delay + 529 at the start, up to frames × spf − padding + 529', () => {
    // A 5-minute LAME file: delay 576, padding 1296, 11486 frames of 1152.
    expect(keepRange({ total: 13231872, sr: 44100, firstTs: 0, duration: 300.0424, mp3: { start: 576 + 529, until: 11486 * 1152 - 1296 + 529 } }))
      .toEqual([1105, 13231105]);
    // No frame count: only the start is trimmed.
    expect(keepRange({ total: 1000, sr: 44100, firstTs: 0, duration: null, mp3: { start: 1105, until: null } })).toEqual([1000, 1000]);
  });
  it('MP4: the edit list’s priming (a negative first timestamp) and the length it gives', () => {
    expect(keepRange({ total: 13231104, sr: 44100, firstTs: -1024 / 44100, duration: 300 })).toEqual([1024, 13231024]);
  });
  it('Ogg: cut to the sample-exact length of its last granule', () => {
    expect(keepRange({ total: 2880648, sr: 48000, firstTs: 0, duration: 60.0135, exact: 60 })).toEqual([0, 2880000]);
  });
  it('anything else: all of it', () => {
    expect(keepRange({ total: 13230000, sr: 44100, firstTs: 0, duration: 300 })).toEqual([0, 13230000]);
    expect(keepRange({ total: 500, sr: 44100, firstTs: 0, duration: null })).toEqual([0, 500]);
  });

  it('reads the LAME tag of an MP3 (and nothing from other formats)', () => {
    const mp3 = fixture('mp3-128k.mp3'), info = parseContainer(mp3), g = mp3Gapless(mp3);
    if (/^(LAME|Lavc|Lavf)/.test(info.encoder)) {
      expect(g).not.toBeNull();
      expect(g!.start).toBeGreaterThanOrEqual(529);
      expect(g!.until === null || g!.until > g!.start).toBe(true);
    } else expect(g).toBeNull();
    for (const name of ['aac-128k.m4a', 'flac-96k-24.flac', 'opus-160k.opus', 'wav-44k-24.wav']) expect(mp3Gapless(fixture(name))).toBeNull();
  });
});
