import { describe, expect, it, vi } from 'vitest';

// Synthesising and analysing seconds of audio: slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });
import { runJob } from '../src/core/audio/analyze';
import { classify } from '../src/core/audio/verdict';
import { blankInfo } from '../src/core/formats/parse';
import type { FileInfo } from '../src/core/types';
import { bandLimitedTones as bandLimitedNoise, bandLimitedNoise as wallNoise, quantize, rolledOff, rnd } from './helpers';

const noop = () => {};
const lossless = (sr: number, bits: number): FileInfo => Object.assign(blankInfo(), { container: 'FLAC', codec: 'FLAC', lossless: true, sampleRate: sr, bits, channels: 2, clues: [] });
const verdictOf = (chs: Float32Array[], sr: number, info: FileInfo) =>
  classify(info, runJob({ type: 'float', channels: chs, sr, bits: info.lossless ? info.bits : 0 }, noop));

describe('verdicts on synthetic signals', () => {
  it('the built-in example: lossy wall + padded bits', () => {
    const res = runJob({ type: 'demo' }, noop), v = classify(lossless(96000, 24), res);
    expect(v.label).toBe('Transcoded');
    expect(v.cut.wall).toBe(true);
    expect(v.cut.fc).toBeGreaterThan(15500); expect(v.cut.fc).toBeLessThan(16600);
    expect(v.depth).toMatchObject({ eff: 16, declared: 24 });
    expect(v.findings.map(f => f.title)).toContain('Only 16 of 24 bits used');
  });
  it('genuine full-band 44.1 kHz lossless', () => {
    const v = verdictOf(quantize(bandLimitedNoise(44100, 6, 20900), 16), 44100, lossless(44100, 16));
    expect(v.grade).toBe('ok');
    expect(v.label).toBe('Lossless');
  });
  it('96 kHz file upsampled from 44.1 kHz', () => {
    const v = verdictOf(quantize(bandLimitedNoise(96000, 6, 21000), 24), 96000, lossless(96000, 24));
    expect(v.grade).toBe('bad');
    expect(v.label).toBe('Upsampled');
    expect(v.headline).toContain('44.1 kHz');
  });
  it('genuine hi-res content past 24 kHz', () => {
    const v = verdictOf(quantize(bandLimitedNoise(96000, 6, 44000), 24), 96000, lossless(96000, 24));
    expect(v.label).toBe('Genuine hi-res');
  });
  it('128 kbps-style 16 kHz wall in a 44.1 kHz WAV', () => {
    const info = Object.assign(lossless(44100, 16), { container: 'WAV', codec: 'PCM' });
    const v = verdictOf(quantize(bandLimitedNoise(44100, 6, 16000), 16), 44100, info);
    expect(v.label).toBe('Transcoded');
    expect(v.headline).toBe('Lossy audio in a WAV wrapper');   // article follows the word ("a WAV")
  });
  // ADR 0033: many masters (artist / label downloads) roll off gently near the top; that isn't lossy.
  it('a 44.1 kHz AIFF whose top end fades out gently (no wall) is lossless', () => {
    const info = Object.assign(lossless(44100, 16), { container: 'AIFF', codec: 'PCM' });
    for (const [start, slope] of [[12000, 8], [16000, 8]]) {
      const v = verdictOf(quantize(rolledOff(44100, 4, start, slope), 16), 44100, info);
      expect(v.cut.wall).toBe(false);
      expect(v.cut.fc).toBeLessThan(20800);            // the old rule called this "Caution: band-limited"
      expect(v.label).toBe('Lossless');
      expect(v.findings.find(f => f.sev === 'warn' || f.sev === 'bad')).toBeUndefined();
      expect(v.findings.map(f => f.title).join()).toContain('Top end rolls off');
    }
  });
  it('a fade that ends far lower is still worth a look', () => {
    const v = verdictOf(quantize(rolledOff(44100, 4, 3000, 9), 16), 44100, lossless(44100, 16));
    expect(v.cut.fc).toBeLessThan(17000);
    expect(v.label).toBe('Caution');
  });
  it('a dark master with quiet content above the fade (hats, cymbals) is lossless; steady hiss up there is not content', () => {
    const dark = () => rolledOff(44100, 4, 3000, 9);
    const hats = dark();   // short, faint full-band bursts four times a second (about −54 dBFS)
    for (const o of hats) for (let s = 0; s < o.length; s += 11025) for (let i = 0; i < 660 && s + i < o.length; i++) o[s + i] += rnd() * 0.002 * Math.exp(-i / 200);
    const v = verdictOf(quantize(hats, 16), 44100, lossless(44100, 16));
    expect(v.cut.wall).toBe(false);
    expect(v.cut.fc).toBeLessThan(17000);                 // the average alone says "band-limited"
    expect(v.label).toBe('Lossless');
    expect(v.cut.reach).toBeGreaterThan(20000);
    expect(v.findings.map(f => f.title).join()).toContain('Quiet content up to');
    const hiss = dark();    // steady high-passed noise, like noise-shaped dither
    const h = rolledOff(44100, 4, 0, 0);
    for (let c = 0; c < 2; c++) { let p = 0; for (let i = 0; i < hiss[c].length; i++) { hiss[c][i] += (h[c][i] - p) * 0.01; p = h[c][i]; } }
    expect(verdictOf(quantize(hiss, 16), 44100, lossless(44100, 16)).label).toBe('Caution');
  });
  it('real encoder walls near the top are still transcodes; shallow high "walls" are only a caution', () => {
    for (const f of [18600, 19400]) expect(verdictOf(quantize(wallNoise(44100, 4, f), 16), 44100, lossless(44100, 16)).label).toBe('Transcoded');
    const steep = verdictOf(quantize(rolledOff(44100, 4, 17000, 20), 16), 44100, lossless(44100, 16));
    expect(steep.label).not.toBe('Transcoded');
  });
  // The user's report (2026-09-27): a steep 17.3 kHz wall with quieter content above it in the loud
  // moments, following the music (a mastering lowpass, then limiting on the kicks), is only a caution.
  // The same wall with nothing but the floor above stays a transcode; specks far under the music in a
  // lossy file are explained as the decoder's rounding.
  const kicks = (sr: number, secs: number, cut: number, hf: number, bits: number | null) => {
    const base = wallNoise(sr, secs, cut), full = rolledOff(sr, secs, 0, 0);
    return base.map((ch, c) => {
      const out = new Float32Array(ch.length);
      let prev = 0;
      for (let i = 0; i < ch.length; i++) {
        // A smooth pulse twice a second (no jumps: they'd splatter above the wall by themselves).
        const t = (i / sr) % 0.5, env = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * t / 0.5), 4), d = full[c][i] - prev;
        prev = full[c][i];
        out[i] = ch[i] * env + (t < 0.03 ? d * hf * env : 0);   // high content only in the kicks' first 30 ms
      }
      return out;
    });
  };
  it('a steep wall with content beyond it in the loud moments, following the music, is only a caution', () => {
    const sr = 44100, info = Object.assign(lossless(sr, 16), { container: 'WAV', codec: 'PCM' });
    const steep = verdictOf(quantize(kicks(sr, 6, 17300, 0.02, 16), 16), sr, info);
    expect(steep.cut.wall).toBe(true);
    expect(steep.label).toBe('Caution');
    expect(steep.findings[0].title).toMatch(/^Steep top end at 17\.\d kHz, with content beyond$/);
    expect(verdictOf(quantize(kicks(sr, 6, 17300, 0, 16), 16), sr, info).label).toBe('Transcoded');
  });
  it('specks far under the music above a lossy file’s wall are explained, and change nothing', () => {
    const sr = 44100, info = Object.assign(blankInfo(), { container: 'MPEG audio', codec: 'MP3', lossless: false, bitrate: 192, sampleRate: sr, channels: 2, clues: [] });
    const v = verdictOf(kicks(sr, 6, 16500, 0.00002, null), sr, info);
    expect(v.label).toBe('Fake bitrate');
    expect(v.findings[0].detail).toContain('decoder’s rounding');
  });
  // The user's report (2026-09-28): a promo WAV with a steep 20.3 kHz wall was a caution. The band just
  // under its wall never drops out; MP3 transcodes keep switching it off in loud moments (25–57 %).
  const withHoles = (sr: number, secs: number, cut: number, share: number) => {
    const whole = wallNoise(sr, secs, cut), dark = wallNoise(sr, secs, 16500), block = Math.round(sr * 0.25), fade = Math.round(sr * 0.005);
    let seed = 7; const pick = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const holes: boolean[] = []; for (let b = 0; b * block < whole[0].length; b++) holes.push(pick() < share);
    return whole.map((ch, c) => ch.map((v, i) => {
      const b = Math.floor(i / block), at = i - b * block, into = holes[b] ? 1 : 0, from = b > 0 && holes[b - 1] ? 1 : 0;
      const w = at < fade ? from + (into - from) * at / fade : into;   // short crossfades: no clicks
      return v * (1 - w) + dark[c][i] * w;
    }));
  };
  it('a steep wall near the top whose band under it never drops out is a mastering lowpass; with drop-outs, a transcode', () => {
    const sr = 44100, info = Object.assign(lossless(sr, 16), { container: 'WAV', codec: 'PCM' });
    const steady = verdictOf(quantize(wallNoise(sr, 6, 20300), 16), sr, info);
    expect(steady.cut.wall).toBe(true);
    expect(steady.label).toBe('Lossless');
    expect(steady.findings.find(f => f.title.startsWith('Steep top end at 20.'))?.sev).toBe('info');
    const holey = verdictOf(quantize(withHoles(sr, 6, 20300, 0.4), 16), sr, info);
    expect(holey.label).toBe('Transcoded');
    expect(holey.findings[0].detail).toMatch(/keeps switching off \(in \d+% of the loud moments\)/);
  });
  it('unknown format with a lossy wall is never called lossless', () => {
    const info = Object.assign(blankInfo(), { sampleRate: 48000, clues: [] });
    const v = verdictOf(bandLimitedNoise(48000, 6, 16000), 48000, info);
    expect(v.label).toBe('Lossy');
  });
});
