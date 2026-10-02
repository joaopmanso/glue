/* The native engine's reference for lossy files (ADR 0147): each file in tests/fixtures/lossy (and the lossy
   fixtures) analysed in Edge, by the worker pool as GLUE Home's service page does it, into tests/golden/<name>/
   (summary, info, files, decode). Only with GOLDEN=1 (they're committed; regenerate when the JavaScript analysis
   changes):  GOLDEN=1 npx playwright test e2e/golden.spec.ts
   ALAC isn't here: Edge can't decode it (crates/glue-audio/tests/lossy.rs holds it to the FLAC of the same audio). */
import { test } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const FIX = fileURLToPath(new URL('../tests/fixtures/', import.meta.url)), OUT = fileURLToPath(new URL('../tests/golden/', import.meta.url));
const files: [string, string][] = [
  ...readdirSync(join(FIX, 'lossy')).filter(f => !/alac/.test(f)).map(f => [f, join(FIX, 'lossy', f)] as [string, string]),
  ...['mp3-128k.mp3', 'mp3-cover.mp3', 'aac-128k.m4a'].map(f => [f, join(FIX, f)] as [string, string]),
];

test.skip(!process.env.GOLDEN, 'GOLDEN=1 writes the lossy goldens');

test('lossy goldens for the native engine (ADR 0147)', async ({ page }) => {
  test.setTimeout(300_000);
  const bytes = new Map(files.map(([n, p]) => [n, readFileSync(p)]));
  await page.route('**/__audio/*', r => { const b = bytes.get(decodeURIComponent(r.request().url().split('/').pop()!)); return b ? r.fulfill({ status: 200, body: b }) : r.fulfill({ status: 404 }); });
  await page.goto('./?perf#/analyze');
  await page.waitForFunction(() => 'golden' in ((window as unknown as { __gluePerf?: object }).__gluePerf ?? {}));
  for (const [name] of files) {
    const g = await page.evaluate(n => (window as unknown as { __gluePerf: { golden(u: string): Promise<Record<string, unknown>> } }).__gluePerf.golden('/__audio/' + encodeURIComponent(n)), name);
    const dir = join(OUT, name);
    mkdirSync(dir, { recursive: true });
    const { at: _a, ...summary } = g.summary as Record<string, unknown>;
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
    writeFileSync(join(dir, 'info.json'), JSON.stringify(g.info, null, 1) + '\n');
    writeFileSync(join(dir, 'files.json'), JSON.stringify(g.files, null, 1) + '\n');
    writeFileSync(join(dir, 'decode.json'), JSON.stringify(g.decode, null, 1) + '\n');
  }
});
