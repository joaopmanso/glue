/* The tests' stand-in for GLUE Home's native `analyse_song` (home/src-tauri/src/analysis.rs, ADR 0148): the website's
   own analysis (its worker pool) on the mock's disk, writing the same cache files the engine writes, the result last.
   Loaded by e2e/tauri-mock.ts in GLUE Home's service page; never part of GLUE Home itself. */
import { AnalysisPool } from '../src/lib/pool';
import { analysed, type Analysed } from '../src/core/library/analysed';
import { failed } from '../src/core/library/summary';
import { encodeFingerprint } from '../src/store/fingerprints';
import { shardOf } from '../src/store/types';

let pool: AnalysisPool | null = null;
const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

export async function analyseSong(a: { path: string; p: string; c: string; id: string; mtime: number }, bytes: number[], put: (rel: string, b: Uint8Array) => void) {
  const k = (dir: string, ext: string) => `${dir}/${a.p}/${a.c}/${shardOf(a.id)}/${a.id}.${ext}`;
  const name = a.path.split(/[\\/]/).pop()!, size = bytes.length, t0 = performance.now();
  pool ??= new AnalysisPool(2);
  let r: Awaited<ReturnType<AnalysisPool['analyze']>>;
  try { r = await pool.analyze(new File([new Uint8Array(bytes)], name, { lastModified: a.mtime }), a.mtime, 120_000); }
  catch (e) {
    const msg = String((e as Error)?.message || 'It couldn’t be decoded.');
    if (/took too long|worker stopped/.test(msg)) throw msg;
    put(k('s', 'json'), enc({ summary: failed(msg, { size, mtime: a.mtime }), size, mtime: a.mtime, format: null, duration: null, fields: {} } satisfies Analysed));
    return { failed: msg, bytes: size, readMs: 0, analyseMs: performance.now() - t0 };
  }
  if (r.thumb) put(k('t', 'bin'), r.thumb);
  if (r.wave) put(k('w', 'bin'), r.wave);
  if (r.details) { put(k('d', 'bin'), r.details.bin); put(k('d', 'json'), enc(r.details.header)); }
  if (r.art !== undefined) {
    if (r.art) { put(`a/${r.art.hash}-64.jpg`, r.art.small); put(`a/${r.art.hash}-320.jpg`, r.art.large); }
    put(k('c', 'txt'), new TextEncoder().encode(r.art?.hash ?? ''));
  }
  if (r.fp) put(k('p', 'bin'), encodeFingerprint(r.fp));
  put(k('s', 'json'), enc(analysed(r, size, a.mtime)));
  return { bytes: size, readMs: 0, analyseMs: performance.now() - t0, label: r.summary.label };
}
