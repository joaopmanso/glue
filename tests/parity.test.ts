/* M1 parity: the ported modules must give the same answers as the original single-file page. */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseContainer } from '../src/core/formats/parse';
import { scanClues } from '../src/core/formats/clues';
import { runJob } from '../src/core/audio/analyze';
import { classify } from '../src/core/audio/verdict';
import type { AnalysisJob, FileInfo } from '../src/core/types';
import { fixture } from './helpers';

// Load the legacy page's pure code (everything before its UI section) as functions.
const html = readFileSync(fileURLToPath(new URL('../legacy/index.html', import.meta.url)), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('/* ============================================================\n   UI'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const legacy: any = new Function(script + '\nreturn { parseContainer, scanClues, runJob, classify };')();

const noop = () => {};
const strip = (o: object) => JSON.parse(JSON.stringify(o));
function summary(v: ReturnType<typeof classify>, music: { bpm: number | null; key: unknown }) {
  return {
    grade: v.grade, label: v.label, headline: v.headline, sub: v.sub, origin: v.origin, depth: v.depth,
    findings: v.findings.map(f => f.sev + ':' + f.title), fc: Math.round(v.cut.fc), wall: v.cut.wall,
    bpm: music.bpm && +music.bpm.toFixed(2), key: music.key,
  };
}
function analyzeBoth(u8: Uint8Array) {
  const a = parseContainer(u8), b: FileInfo = legacy.parseContainer(u8);
  a.clues = scanClues(u8, a); b.clues = legacy.scanClues(u8, b);
  const job = (info: FileInfo): AnalysisJob => ({ type: 'pcm', buffer: u8.slice().buffer, pcm: info.pcm!, sr: info.sampleRate });
  const ra = runJob(job(a), noop), rb = legacy.runJob(job(b), noop);
  return { a, b, va: classify(a, ra), vb: legacy.classify(b, rb), ra, rb };
}

describe('parity with the legacy page', () => {
  for (const name of ['mp3-128k.mp3', 'aac-128k.m4a', 'flac-96k-24.flac', 'opus-160k.opus', 'aiff-44k-24.aiff', 'wav-44k-24.wav']) {
    it('parses ' + name + ' identically', () => {
      const u8 = fixture(name);
      const a = parseContainer(u8), b = legacy.parseContainer(u8);
      expect(strip(a)).toEqual(strip(b));
      expect(scanClues(u8, a)).toEqual(legacy.scanClues(u8, b));
    });
  }
  for (const name of ['aiff-44k-24.aiff', 'wav-44k-24.wav']) {
    it('analyses ' + name + ' identically', () => {
      const { va, vb, ra, rb } = analyzeBoth(fixture(name));
      expect(summary(va, ra.music)).toEqual(summary(vb, rb.music));
    });
  }
  it('generates and judges the example identically', () => {
    const ra = runJob({ type: 'demo' }, noop), rb = legacy.runJob({ type: 'demo' }, noop);
    expect(Array.from(ra.ltas.subarray(0, 4000))).toEqual(Array.from(rb.ltas.subarray(0, 4000)));
    const info = { container: 'FLAC', codec: 'FLAC', lossless: true, sampleRate: 96000, bits: 24, channels: 2, clues: [], tags: {}, notes: [] } as unknown as FileInfo;
    expect(summary(classify(info, ra), ra.music)).toEqual(summary(legacy.classify(info, rb), rb.music));
  }, 30_000);   // synthesises and analyses ~10 s of 96 kHz audio twice
  const real = join(homedir(), 'Downloads', '7th Pyramid - Linguistics.aiff');
  it.runIf(existsSync(real))('analyses the real 48 kHz AIFF identically', () => {
    const { va, vb, ra, rb } = analyzeBoth(new Uint8Array(readFileSync(real)));
    expect(summary(va, ra.music)).toEqual(summary(vb, rb.music));
    expect(va.label).toBe('Lossless');
  }, 120000);
});
