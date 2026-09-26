/* Decoding in the worker (ADR 0060) gives the same audio as the page's decoder: same rate, channels,
   length, and samples. Through ?perf's decodeCheck. The fixtures, plus (with ffmpeg) the formats they
   don't cover: Ogg Vorbis, WebM Opus, ADTS AAC, an MP3 without a LAME tag, a 5-minute LAME MP3. */
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtures = ['mp3-128k.mp3', 'aac-128k.m4a', 'flac-96k-24.flac', 'opus-160k.opus'];
const fixture = (name: string) => readFileSync(fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url)));

function generated(): Map<string, Buffer> {
  const out = new Map<string, Buffer>(), ff = process.env.FFMPEG || 'ffmpeg';
  try { execFileSync(ff, ['-version'], { stdio: 'ignore' }); } catch { return out; }
  const dir = mkdtempSync(join(tmpdir(), 'glue-decode-'));
  const src = ['-f', 'lavfi', '-i', 'anoisesrc=d=20:c=pink:a=0.2', '-f', 'lavfi', '-i', 'sine=f=330:d=20', '-filter_complex', 'amix=inputs=2,aformat=channel_layouts=stereo'];
  const make: [string, string[]][] = [
    ['vorbis.ogg', ['-ar', '48000', '-c:a', 'libvorbis', '-q:a', '5']],
    ['opus.webm', ['-ar', '48000', '-c:a', 'libopus', '-b:a', '128k']],
    ['adts.aac', ['-ar', '44100', '-c:a', 'aac', '-b:a', '192k']],
    ['plain.mp3', ['-ar', '44100', '-b:a', '192k', '-write_xing', '0']],
    ['lame.mp3', ['-ar', '44100', '-b:a', '320k']],
    ['edit.m4a', ['-ar', '48000', '-c:a', 'aac', '-b:a', '256k']],
  ];
  for (const [name, args] of make) {
    const p = join(dir, name);
    try { execFileSync(ff, ['-loglevel', 'error', '-y', ...src, ...args, p]); if (existsSync(p)) out.set(name, readFileSync(p)); } catch { /* an encoder this ffmpeg lacks */ }
  }
  return out;
}

test('the worker decodes like the page: same rate, channels, length and samples', async ({ page }) => {
  test.setTimeout(180_000);
  const files = new Map<string, Buffer>(fixtures.map(n => [n, fixture(n)]));
  for (const [n, b] of generated()) files.set(n, b);
  await page.route('**/__audio/*', r => { const b = files.get(decodeURIComponent(r.request().url().split('/').pop()!)); return b ? r.fulfill({ status: 200, body: b }) : r.fulfill({ status: 404 }); });
  await page.goto('./?perf#/analyze');
  await page.waitForFunction(() => 'decodeCheck' in ((window as unknown as { __gluePerf?: object }).__gluePerf ?? {}));
  const results: Record<string, unknown> = {};
  for (const name of files.keys()) {
    const r = await page.evaluate(n => (window as unknown as { __gluePerf: { decodeCheck(u: string): Promise<{ worker: string; sr?: number[]; frames?: number[]; channels?: number[]; maxDiff?: number }> } }).__gluePerf.decodeCheck('./__audio/' + n), name);
    results[name] = r;
    expect(r.worker, name + ': decoded in the worker').toBe('float');
    expect(r.sr![0], name + ': rate').toBe(r.sr![1]);
    expect(r.channels![0], name + ': channels').toBe(r.channels![1]);
    expect(r.maxDiff!, name + ': samples').toBeLessThan(1e-6);
    // WebM doesn't say where its end padding stops (a few ms at most are kept).
    if (name.endsWith('.webm')) expect(r.frames![0] - r.frames![1], name + ': length').toBeLessThanOrEqual(r.sr![0] * 0.03);
    else expect(r.frames![0], name + ': length').toBe(r.frames![1]);
  }
  console.log(JSON.stringify(results));
});
