/* The reference results the native engine is held to (ADR 0147): today's TypeScript pipeline, as the analysis worker
   runs it, on the lossless fixtures and the deterministic demo. crates/glue-audio/tests/golden.rs compares the Rust
   engine with these files.
   - GOLDEN=1 npx vitest run tests/golden.test.ts   writes tests/golden/<name>/*.json
   - otherwise this test checks they're current: a change to the JavaScript analysis must regenerate them, and then the
     Rust engine must follow (its golden test fails until it does). */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankInfo, parseContainer } from '../src/core/formats/parse';
import { scanClues } from '../src/core/formats/clues';
import { decodeFlac } from '../src/core/formats/flac';
import { runJob } from '../src/core/audio/analyze';
import { classify } from '../src/core/audio/verdict';
import { summarize } from '../src/core/library/summary';
import type { AnalysisJob, AnalysisResult, FileInfo } from '../src/core/types';

const FIX = join(__dirname, 'fixtures'), OUT = join(__dirname, 'golden');
const FILES = ['wav-44k-24.wav', 'aiff-44k-24.aiff', 'flac-96k-24.flac', 'flac-192k-24.flac', 'flac-cover.flac'];
const MTIME = 1_700_000_000_000;

/** The worker's job for a file (analysis.worker.ts materialize), lossless formats only. */
async function jobOf(name: string): Promise<{ job: AnalysisJob; info: FileInfo }> {
  const u8 = new Uint8Array(readFileSync(join(FIX, name)));
  let info: FileInfo;
  try { info = parseContainer(u8); } catch { info = blankInfo(); }
  info.fileName = name; info.fileSize = u8.length;
  info.clues = scanClues(u8, info);
  if (info.pcm) return { job: { type: 'pcm', buffer: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), pcm: info.pcm, sr: info.sampleRate }, info };
  const d = await decodeFlac(u8.length, async (a, b) => u8.subarray(a, b));
  if (!info.channels) info.channels = d.channels.length;
  return { job: { type: 'float', channels: d.channels, sr: d.sampleRate, bits: info.lossless ? info.bits : 0 }, info };
}

/** What's compared: the file info, the summary, the verdict and the numbers behind it. */
function golden(info: FileInfo, out: AnalysisResult, size: number) {
  if (!info.sampleRate) info.sampleRate = out.sr;
  const v = classify(info, out), s = summarize(info, out, v, { size, mtime: MTIME });
  const { pcm: _p, ...plain } = info;
  const { at: _a, ...summary } = s;
  const { sm: _s, ...cut } = v.cut;
  const colSums: number[] = [];
  for (let c = 0; c < out.cols; c++) { let t = 0; for (let r = 0; r < out.rows; r++) t += out.spec[c * out.rows + r]; colSums.push(t); }
  return {
    'info.json': plain,
    'summary.json': summary,
    'verdict.json': { ...v, cut },
    'result.json': {
      stats: out.stats, music: out.music, sr: out.sr, duration: out.duration, channels: out.channels, containerBits: out.containerBits,
      N: out.N, binHz: out.binHz, cols: out.cols, rows: out.rows, ltas: Array.from(out.ltas), colSums,
    },
  };
}

async function all(): Promise<Record<string, Record<string, unknown>>> {
  const r: Record<string, Record<string, unknown>> = {};
  for (const name of FILES) {
    const { job, info } = await jobOf(name);
    r[name] = golden(info, runJob(job, () => {}), info.fileSize!);
  }
  const demo = runJob({ type: 'demo' }, () => {});
  r['demo'] = golden({ ...blankInfo(), container: 'Example', codec: 'PCM', lossless: true, sampleRate: 96000, bits: 24, channels: 2, example: true }, demo, 0);
  return r;
}

describe('golden results for the native engine (ADR 0147)', () => {
  it(process.env.GOLDEN ? 'writes them' : 'are current', async () => {
    const r = await all();
    for (const [name, files] of Object.entries(r)) {
      const dir = join(OUT, name);
      for (const [f, v] of Object.entries(files)) {
        const text = JSON.stringify(v, null, 1) + '\n', path = join(dir, f);
        if (process.env.GOLDEN) { mkdirSync(dir, { recursive: true }); writeFileSync(path, text); }
        else {
          expect(existsSync(path), path + ' missing: GOLDEN=1 npx vitest run tests/golden.test.ts').toBe(true);
          expect(JSON.parse(readFileSync(path, 'utf8')), name + '/' + f + ' is stale: GOLDEN=1 npx vitest run tests/golden.test.ts, then the Rust engine').toEqual(JSON.parse(text));
        }
      }
    }
  }, 120_000);
});
