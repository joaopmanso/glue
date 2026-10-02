import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeFlac, flacHeader } from '../src/core/formats/flac';

// FLAC decoded by GLUE itself (ADR 0144): the browser's decoders failed on the user's 24-bit/192 kHz FLACs. Lossless,
// so the samples must be exactly ffmpeg's: the hashes are of `ffmpeg -i <file> -f s32le -` (interleaved, 32-bit,
// left-justified), made when the fixtures were.
const FIXTURES: [string, string, { sampleRate: number; bits: number; channels: number; frames: number }][] = [
  ['flac-192k-24.flac', 'ed3e0e2f67038d14', { sampleRate: 192000, bits: 24, channels: 2, frames: 96000 }],   // ffmpeg -compression_level 12: LPC, stereo modes
  ['flac-96k-24.flac', 'c6812e24185a3efa', { sampleRate: 96000, bits: 24, channels: 2, frames: 384000 }],
  ['flac-cover.flac', '5dfd15cea1c37f9e', { sampleRate: 44100, bits: 16, channels: 1, frames: 132300 }],     // a picture block first
];

const reader = (b: Uint8Array) => async (start: number, end: number) => b.subarray(start, end);
function s32hash(chans: Float32Array[], bits: number) {
  const n = chans[0].length, out = Buffer.alloc(n * chans.length * 4), up = 2 ** (bits - 1), left = 2 ** (32 - bits);
  for (let i = 0, o = 0; i < n; i++) for (const c of chans) { out.writeInt32LE(Math.round(c[i] * up) * left, o); o += 4; }
  return createHash('sha256').update(out).digest('hex').slice(0, 16);
}

describe('FLAC decoded here (ADR 0144)', () => {
  for (const [name, hash, want] of FIXTURES) it(`${name}: the same samples as ffmpeg`, async () => {
    const b = new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url)));
    const pcm = await decodeFlac(b.length, reader(b));
    expect({ sampleRate: pcm.sampleRate, bits: pcm.bits, channels: pcm.channels.length, frames: pcm.channels[0].length }).toEqual(want);
    expect(s32hash(pcm.channels, pcm.bits)).toBe(hash);
  });

  it('reads a file a part at a time: the same samples as from the whole', async () => {
    const b = new Uint8Array(readFileSync(new URL('./fixtures/flac-96k-24.flac', import.meta.url)));
    const asked: number[] = [];
    // Parts far smaller than the decoder's: every refill path (a frame split across two parts) is used.
    const pcm = await decodeFlac(b.length, async (s, e) => { asked.push(e - s); return b.subarray(s, Math.min(e, s + 50_000)); });
    expect(asked.length).toBeGreaterThan(3);
    expect(s32hash(pcm.channels, pcm.bits)).toBe('c6812e24185a3efa');
  });

  // The user's Blue Train FLACs: 17 MB of zeros between the metadata and the first frame (ffmpeg gave no samples, the
  // browser's decoders none or none in time). The frames are found past them.
  it('finds the first frame past a long gap after the metadata', async () => {
    const b = new Uint8Array(readFileSync(new URL('./fixtures/flac-192k-24.flac', import.meta.url)));
    const start = flacHeader(b)!.start, gap = 20 << 20;
    const g = new Uint8Array(b.length + gap);
    g.set(b.subarray(0, start)); g.set(b.subarray(start), start + gap);
    const pcm = await decodeFlac(g.length, reader(g));
    expect(s32hash(pcm.channels, pcm.bits)).toBe('ed3e0e2f67038d14');
  });

  it('says what isn’t FLAC', () => {
    expect(flacHeader(new Uint8Array(64))).toBeNull();
  });
});
