/* The tests' stand-in for GLUE Home's native engine (home/src-tauri/src/analysis.rs, ADR 0147, 0148): `analyse_song`,
   `analyse_incoming`, `cover_hash`, `cover_from_image` and `wave_from_details` done by the website's own code (its
   worker pool, cover reader, waveform) on the mock's disk, writing the same cache files the engine writes. Loaded by
   e2e/tauri-mock.ts in GLUE Home's service page; never part of GLUE Home itself. */
import { AnalysisPool } from '../src/lib/pool';
import { analysed, type Analysed } from '../src/core/library/analysed';
import { failed } from '../src/core/library/summary';
import { encodeFingerprint } from '../src/store/fingerprints';
import { shardOf } from '../src/store/types';
import { coverFromImage as makeCover, coverOf, type Cover } from '../src/workers/cover';
import { decodeDetails } from '../src/store/details';
import { makeWaveThumb } from '../src/core/library/thumb';

type Put = (rel: string, b: Uint8Array) => void;
const keep = (put: Put, c: Cover) => { put(`a/${c.hash}-64.jpg`, c.small); put(`a/${c.hash}-320.jpg`, c.large); };

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

export async function analyseIncoming(name: string, bytes: number[], put: Put) {
  pool ??= new AnalysisPool(2);
  const r = await pool.analyze(new File([new Uint8Array(bytes)], name), 0);
  const k = (what: string) => 'i/' + name + '.' + what;
  if (r.thumb) put(k('thumb.bin'), r.thumb);
  if (r.wave) put(k('wave.bin'), r.wave);
  if (r.details) { put(k('details.bin'), r.details.bin); put(k('details.json'), enc(r.details.header)); }
  put(k('summary.json'), enc({ ...r.summary, format: r.info.container ? { container: r.info.container, codec: r.info.codec, lossless: r.info.lossless, sampleRate: r.info.sampleRate, bits: r.info.bits, bitrate: Math.round(r.info.bitrate || 0), channels: r.info.channels } : null, duration: r.duration }));
}

export async function coverHash(a: { p: string; c: string; id: string }, bytes: number[], put: Put) {
  const cover = await coverOf(new Blob([new Uint8Array(bytes)]));
  if (cover) keep(put, cover);
  put(`c/${a.p}/${a.c}/${shardOf(a.id)}/${a.id}.txt`, new TextEncoder().encode(cover?.hash ?? ''));
  return cover?.hash ?? '';
}

export async function coverFromImage(bytes: number[], put: Put) { const c = await makeCover(new Uint8Array(bytes)); keep(put, c); return c.hash; }

export async function waveFromDetails(a: { p: string; c: string; id: string }, get: (rel: string) => Uint8Array | null, put: Put) {
  const k = (dir: string, ext: string) => `${dir}/${a.p}/${a.c}/${shardOf(a.id)}/${a.id}.${ext}`;
  const h = get(k('d', 'json')), bin = get(k('d', 'bin'));
  if (!h || !bin) return new ArrayBuffer(0);
  const w = makeWaveThumb((await decodeDetails(JSON.parse(new TextDecoder().decode(h)), bin)).res);
  put(k('w', 'bin'), w);
  return w.buffer;
}
