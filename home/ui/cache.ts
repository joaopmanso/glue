/* GLUE Home's own cache of the shared songs' mini spectrograms and full analyses (ADR 0046), in the
   app's cache folder: `t/<profile>/<collection>/<shard>/<id>.bin`, the waveforms in `w/…/<id>.bin`
   (ADR 0085) and `d/…/<id>.json` + `.bin`.
   Filled by GLUE Home's native engine (ADR 0147, 0148, 0154): its analysis queue, in the background, and at once when
   another computer asks. */
import { bridge, type HomeConfig } from './bridge';
import { shared, here } from './library';
import * as engine from './engine';
import { shardOf, type Collection, type Track } from '../../src/store/types';
import type { SharedCollection } from '../../src/core/shared/project';
import { DETAILS_VERSION, type DetailsHeader } from '../../src/store/details';
import { WAVE_BYTES } from '../../src/core/library/thumb';
import { incomingKey } from '../../src/core/transfer';

const tKey = (p: string, c: string, id: string) => `t/${p}/${c}/${shardOf(id)}/${id}.bin`;
const wKey = (p: string, c: string, id: string) => `w/${p}/${c}/${shardOf(id)}/${id}.bin`;
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
export async function wave(p: string, c: string, id: string) { const b = await read(wKey(p, c, id)); return b && b.length === WAVE_BYTES ? b : null; }
export async function putWave(p: string, c: string, id: string, b: Uint8Array) { if (b.length === WAVE_BYTES) await bridge.cacheWrite(wKey(p, c, id), b); }
/** A waveform made from the full analysis kept here (no need to read the song again), kept, or null. Made by GLUE
    Home's engine (ADR 0147). */
export async function waveFromDetails(p: string, c: string, id: string): Promise<Uint8Array | null> {
  try { const w = new Uint8Array(await bridge.waveFromDetails(p, c, id)); return w.length === WAVE_BYTES ? w : null; } catch { return null; }
}
export async function putDetails(p: string, c: string, id: string, header: DetailsHeader, bin: Uint8Array) {
  await bridge.cacheWrite(dKey(p, c, id, 'bin'), bin);
  await bridge.cacheWrite(dKey(p, c, id, 'json'), new TextEncoder().encode(JSON.stringify(header)));   // last: a header always has its data
}
/** The ids that have a mini spectrogram / a waveform / a full analysis kept, in one collection. */
export async function kept(p: string, c: string): Promise<{ thumbs: string[]; waves: string[]; details: string[] }> {
  const out = { thumbs: [] as string[], waves: [] as string[], details: [] as string[] };
  for (const a of HEX) for (const b of HEX) {
    for (const f of await bridge.cacheList(`t/${p}/${c}/${a + b}`)) if (f.endsWith('.bin')) out.thumbs.push(f.slice(0, -4));
    for (const f of await bridge.cacheList(`w/${p}/${c}/${a + b}`)) if (f.endsWith('.bin')) out.waves.push(f.slice(0, -4));
    for (const f of await bridge.cacheList(`d/${p}/${c}/${a + b}`)) if (f.endsWith('.json')) out.details.push(f.slice(0, -5));
  }
  return out;
}

// ---- covers (ADR 0082): for the account's other devices, never GLUE Cloud ----------------------------
// `a/<hash>-<px>.jpg` (an album's songs share one), and per song the hash of its cover ('' for none) in
// `c/<profile>/<collection>/<shard>/<id>.txt`, so its tags are read once.
const aKey = (hash: string, px: 64 | 320) => `a/${hash}-${px}.jpg`;
const cKey = (p: string, c: string, id: string) => `c/${p}/${c}/${shardOf(id)}/${id}.txt`;
const SAFE_HASH = /^[0-9a-f]{8,64}$/;

export async function art(hash: string, px: 64 | 320) { return SAFE_HASH.test(hash) ? read(aKey(hash, px)) : null; }
export async function putArt(hash: string, px: 64 | 320, b: Uint8Array) { if (SAFE_HASH.test(hash)) await bridge.cacheWrite(aKey(hash, px), b); }
/** The hashes of the covers kept (both sizes). */
export async function artKept(): Promise<string[]> {
  const files = new Set(await bridge.cacheList('a').catch(() => [] as string[]));
  return [...files].filter(f => f.endsWith('-64.jpg') && files.has(f.slice(0, -7) + '-320.jpg')).map(f => f.slice(0, -7));
}
/** A song's cover hash ('' none): known, or read from its tags now by GLUE Home's engine (only the tags; it keeps the
    cover and the hash). */
export async function coverHash(p: string, c: string, id: string): Promise<string> {
  const known = await read(cKey(p, c, id));
  if (known) return new TextDecoder().decode(known);
  const f = await engine.trackPath(p, c, id);
  return bridge.coverHash(f.path, p, c, id);
}

// ---- songs arriving in the incoming folder: analysed at once (ADR 0048) -------------------------------
/** Analyse a song that just arrived (or one there without an analysis yet), so it's ready when the
    website shows it in TO BE SORTED: its summary, mini spectrogram and full analysis, made and kept by GLUE Home's
    engine (`i/<name>.…`). */
export async function analyseIncoming(name: string, path: string) {
  if (await read(incomingKey(name, 'summary.json'))) return;
  await bridge.analyseIncoming(name, path);
}
export async function incomingSummary(name: string) { const b = await read(incomingKey(name, 'summary.json')); return b ? JSON.parse(new TextDecoder().decode(b)) : null; }
export async function cacheFile(key: string) { return read(key); }

// ---- analysing for another device ----------------------------------------------------------------------------------
/** A song of this computer's library analysed now by GLUE Home's engine (ADR 0147, 0148, 0154), its parts into this
    cache. `tell`: the result is for the library (false: only this cache's, filled in the background; the library has
    it). */
export const analyse = (p: string, c: string, id: string, tell = true) => engine.analyseSong(p, c, id, tell);

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
      if (c) { try { await analyse(j.p, j.c, j.id); ok = true; } catch (e) { console.warn('GLUE Home: couldn’t analyse', j.id, e); } }
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
    const lib = await engine.describe();
    const todo: { p: string; c: string; id: string }[] = [];
    for (const p of lib?.profiles ?? []) for (const col of p.collections) {
      if (!shared(c0, p.id, col.id)) continue;
      const k = await kept(p.id, col.id), have = new Set(k.thumbs), waves = new Set(k.waves);
      let meta: Collection | SharedCollection | null = null;
      try { meta = JSON.parse(await bridge.glueRead(`profiles/${p.id}/collections/${col.id}/collection.json`)); } catch { /* none */ }
      const h = here(meta, p.id, col.id, c0.computer);
      for (const a of HEX) for (const b of HEX) {
        let shard: { items: Record<string, Track> } | null = null;
        try { shard = JSON.parse(await bridge.glueRead(`profiles/${p.id}/collections/${col.id}/tracks/${a + b}.json`)); } catch { /* no such shard */ }
        for (const t of Object.values(shard?.items ?? {}).map(h.track)) if (t.status === 'linked' && t.rootId && t.relPath && (!have.has(t.id) || !waves.has(t.id))) todo.push({ p: p.id, c: col.id, id: t.id });
      }
    }
    progress.background.total = todo.length; report();
    for (const j of todo) {
      // Another computer's requests go first (they're run here if nothing else runs them).
      while (busy() || urgent.length || running) { if (urgent.length && !running) await drain(cfg); else await new Promise(r => setTimeout(r, 1000)); }
      const c = cfg();
      if (!c || !shared(c, j.p, j.c)) continue;
      // Handed over meanwhile, or only the waveform missing: made from the kept analysis if it can be.
      if (await thumb(j.p, j.c, j.id) && (await wave(j.p, j.c, j.id) || await waveFromDetails(j.p, j.c, j.id))) { progress.background.done++; continue; }
      running = true;
      try { await analyse(j.p, j.c, j.id, false); } catch { /* not found or not decodable: skipped */ } finally { running = false; }
      if (urgent.length) void drain(cfg);
      progress.background.done++;
      if (progress.background.done % 10 === 0) report();
      await new Promise(r => setTimeout(r, 1500));   // gently: this computer is in use too
    }
  } finally { progress.background.running = false; report(); }
}
