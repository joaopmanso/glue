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
  it('unknown format with a lossy wall is never called lossless', () => {
    const info = Object.assign(blankInfo(), { sampleRate: 48000, clues: [] });
    const v = verdictOf(bandLimitedNoise(48000, 6, 16000), 48000, info);
    expect(v.label).toBe('Lossy');
  });
});
