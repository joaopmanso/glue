/* GLUE Home's own cache of the shared songs' mini spectrograms and full analyses (ADR 0046), in the
   app's cache folder: `t/<profile>/<collection>/<shard>/<id>.bin` and `d/…/<id>.json` + `.bin`.
   Filled by the website on this computer (it hands over what it analysed), and by GLUE Home itself
   with the website's own analysis code: in the background, and at once when another computer asks. */
import { bridge, type HomeConfig } from './bridge';
import { shared, describe, trackPath } from './library';
import { AnalysisPool } from '../../src/lib/pool';
import { shardOf, type Track } from '../../src/store/types';
import { DETAILS_VERSION, type DetailsHeader } from '../../src/store/details';
import { incomingKey } from '../../src/core/transfer';

const tKey = (p: string, c: string, id: string) => `t/${p}/${c}/${shardOf(id)}/${id}.bin`;
const dKey = (p: string, c: string, id: string, ext: 'json' | 'bin') => `d/${p}/${c}/${shardOf(id)}/${id}.${ext}`;
const HEX = '0123456789abcdef';

async function read(rel: string): Promise<Uint8Array | null> { try { return new Uint8Array(await bridge.cacheRead(rel)); } catch { return null; } }

export async function thumb(p: string, c: string, id: string) { return read(tKey(p, c, id)); }
export async function details(p: string, c: string, id: string): Promise<{ header: DetailsHeader; bin: Uint8Array } | null> {
  const h = await read(dKey(p, c, id, 'json')), bin = h && await read(dKey(p, c, id, 'bin'));
  if (!h || !bin) return null;
  const header = JSON.parse(new TextDecoder().decode(h)) as DetailsHeader;
  return header.v === DETAILS_VERSION ? { header, bin } : null;
}
export async function putThumb(p: string, c: string, id: string, b: Uint8Array) { await bridge.cacheWrite(tKey(p, c, id), b); }
export async function putDetails(p: string, c: string, id: string, header: DetailsHeader, bin: Uint8Array) {
  await bridge.cacheWrite(dKey(p, c, id, 'bin'), bin);
  await bridge.cacheWrite(dKey(p, c, id, 'json'), new TextEncoder().encode(JSON.stringify(header)));   // last: a header always has its data
}
/** The ids that have a mini spectrogram / a full analysis kept, in one collection. */
export async function kept(p: string, c: string): Promise<{ thumbs: string[]; details: string[] }> {
  const out = { thumbs: [] as string[], details: [] as string[] };
  for (const a of HEX) for (const b of HEX) {
    for (const f of await bridge.cacheList(`t/${p}/${c}/${a + b}`)) if (f.endsWith('.bin')) out.thumbs.push(f.slice(0, -4));
    for (const f of await bridge.cacheList(`d/${p}/${c}/${a + b}`)) if (f.endsWith('.json')) out.details.push(f.slice(0, -5));
  }
  return out;
}

// ---- songs arriving in the incoming folder: analysed at once (ADR 0048) -------------------------------
/** Analyse a song that just arrived (or one there without an analysis yet), so it's ready when the
    website shows it in TO BE SORTED: its summary, mini spectrogram and full analysis. */
export async function analyseIncoming(name: string, path: string, size: number) {
  if (await read(incomingKey(name, 'summary.json'))) return;
  const parts: ArrayBuffer[] = [];
  for (let at = 0; at < size;) { const b = await bridge.fileRead(path, at, 4 * 1024 * 1024); if (!b.byteLength) break; parts.push(b); at += b.byteLength; }
  pool ??= new AnalysisPool(1);
  const r = await pool.analyze(new File(parts, name), 0);
  if (r.thumb) await bridge.cacheWrite(incomingKey(name, 'thumb.bin'), r.thumb);
  if (r.details) { await bridge.cacheWrite(incomingKey(name, 'details.bin'), r.details.bin); await bridge.cacheWrite(incomingKey(name, 'details.json'), new TextEncoder().encode(JSON.stringify(r.details.header))); }
  await bridge.cacheWrite(incomingKey(name, 'summary.json'), new TextEncoder().encode(JSON.stringify({ ...r.summary, format: r.info.container ? { container: r.info.container, codec: r.info.codec, lossless: r.info.lossless, sampleRate: r.info.sampleRate, bits: r.info.bits, bitrate: Math.round(r.info.bitrate || 0), channels: r.info.channels } : null, duration: r.duration })));
}
export async function incomingSummary(name: string) { const b = await read(incomingKey(name, 'summary.json')); return b ? JSON.parse(new TextDecoder().decode(b)) : null; }
export async function cacheFile(key: string) { return read(key); }

// ---- analysing here --------------------------------------------------------------------------------
let pool: AnalysisPool | null = null;

/** Read a song of this computer's library (in 4 MB steps) and analyse it like the website does. */
async function analyse(p: string, c: string, id: string, cfg: HomeConfig): Promise<{ thumb: Uint8Array | null; header: DetailsHeader | null; bin: Uint8Array | null }> {
  const f = await trackPath(p, c, id, cfg);
  const size = await bridge.fileSize(f.path), parts: ArrayBuffer[] = [];
  for (let at = 0; at < size;) { const b = await bridge.fileRead(f.path, at, 4 * 1024 * 1024); if (!b.byteLength) break; parts.push(b); at += b.byteLength; }
  pool ??= new AnalysisPool(1);
  // A song that never finishes (it won't decode) mustn't hold up every other one: 2 minutes at most.
  const p0 = pool;
  const r = await Promise.race([p0.analyze(new File(parts, f.name), 0), new Promise<never>((_, no) => setTimeout(() => { p0.stop(); if (pool === p0) pool = null; no(new Error('the analysis took too long')); }, 120_000))]);
  if (r.thumb) await putThumb(p, c, id, r.thumb);
  if (r.details) await putDetails(p, c, id, r.details.header, r.details.bin);
  return { thumb: r.thumb, header: r.details?.header ?? null, bin: r.details?.bin ?? null };
}

type Job = { p: string; c: string; id: string; done: ((ok: boolean) => void)[] };
const urgent: Job[] = [];
let running = false;
export const progress = { background: { done: 0, total: 0, running: false } };

/** Now: another computer is waiting (`first`: its track page; else rows on its screen). */
export function soon(p: string, c: string, id: string, cfg: () => HomeConfig | null, first = false): Promise<boolean> {
  return new Promise(res => {
    const i = urgent.findIndex(x => x.p === p && x.c === c && x.id === id);
    const j = i >= 0 ? urgent.splice(i, 1)[0] : { p, c, id, done: [] as ((ok: boolean) => void)[] };
    j.done.push(res);
    if (first) urgent.unshift(j); else urgent.push(j);
    void drain(cfg);
  });
}
async function drain(cfg: () => HomeConfig | null) {
  if (running) return;
  running = true;
  try {
    while (urgent.length) {
      const j = urgent.shift()!, c = cfg();
      let ok = false;
      if (c) { try { await analyse(j.p, j.c, j.id, c); ok = true; } catch (e) { console.warn('GLUE Home: couldn’t analyse', j.id, e); } }
      for (const d of j.done) d(ok);
    }
  } finally { running = false; }
}

/** The background: every shared song that has no mini spectrogram yet, one at a time, gently (it
    steps aside when another computer asks for something, or GLUE Home is sending or receiving). */
export async function background(cfg: () => HomeConfig | null, busy: () => boolean, report: () => void) {
  const c0 = cfg();
  if (!c0?.glue || progress.background.running) return;
  progress.background = { done: 0, total: 0, running: true };
  try {
    const lib = await describe();
    const todo: { p: string; c: string; id: string }[] = [];
    for (const p of lib?.profiles ?? []) for (const col of p.collections) {
      if (!shared(c0, p.id, col.id)) continue;
      const have = new Set((await kept(p.id, col.id)).thumbs);
      for (const a of HEX) for (const b of HEX) {
        let shard: { items: Record<string, Track> } | null = null;
        try { shard = JSON.parse(await bridge.glueRead(`profiles/${p.id}/collections/${col.id}/tracks/${a + b}.json`)); } catch { /* no such shard */ }
        for (const t of Object.values(shard?.items ?? {})) if (t.status === 'linked' && t.rootId && t.relPath && !have.has(t.id)) todo.push({ p: p.id, c: col.id, id: t.id });
      }
    }
    progress.background.total = todo.length; report();
    for (const j of todo) {
      // Another computer's requests go first (they're run here if nothing else runs them).
      while (busy() || urgent.length || running) { if (urgent.length && !running) await drain(cfg); else await new Promise(r => setTimeout(r, 1000)); }
      const c = cfg();
      if (!c || !shared(c, j.p, j.c)) continue;
      if (await thumb(j.p, j.c, j.id)) { progress.background.done++; continue; }   // handed over meanwhile
      running = true;
      try { await analyse(j.p, j.c, j.id, c); } catch { /* not found or not decodable: skipped */ } finally { running = false; }
      if (urgent.length) void drain(cfg);
      progress.background.done++;
      if (progress.background.done % 10 === 0) report();
      await new Promise(r => setTimeout(r, 1500));   // gently: this computer is in use too
    }
  } finally { progress.background.running = false; report(); }
}
