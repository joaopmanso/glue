/* GLUE Home's own cache of the shared songs' mini spectrograms and full analyses (ADR 0046), in the
   app's cache folder: `t/<profile>/<collection>/<shard>/<id>.bin`, the waveforms in `w/…/<id>.bin`
   (ADR 0085) and `d/…/<id>.json` + `.bin`.
   Filled by the website on this computer (it hands over what it analysed), and by GLUE Home itself
   with the website's own analysis code: in the background, and at once when another computer asks. */
import { autoPool, bridge, type HomeConfig } from './bridge';
import { shared, describe, here, trackPath } from './library';
import { AnalysisPool } from '../../src/lib/pool';
import { shardOf, type Collection, type Track } from '../../src/store/types';
import type { SharedCollection } from '../../src/core/shared/project';
import { DETAILS_VERSION, decodeDetails, type DetailsHeader } from '../../src/store/details';
import { makeWaveThumb, WAVE_BYTES } from '../../src/core/library/thumb';
import { incomingKey } from '../../src/core/transfer';
import { coverOf, type Cover } from '../../src/workers/cover';
import { analysed, type Analysed, isTransient } from '../../src/core/library/analysed';
import { failed } from '../../src/core/library/summary';
import { gaveUp } from '../../src/core/library/analysed';
import { encodeFingerprint } from '../../src/store/fingerprints';

const tKey = (p: string, c: string, id: string) => `t/${p}/${c}/${shardOf(id)}/${id}.bin`;
const wKey = (p: string, c: string, id: string) => `w/${p}/${c}/${shardOf(id)}/${id}.bin`;
const dKey = (p: string, c: string, id: string, ext: 'json' | 'bin') => `d/${p}/${c}/${shardOf(id)}/${id}.${ext}`;
const HEX = '0123456789abcdef';
/** The library's analysis of a song (ADR 0103): its summary and the file's facts, for the collection; and
    its fingerprint, for duplicates. Made here, taken in by whoever writes the collection. */
const sKey = (p: string, c: string, id: string) => `s/${p}/${c}/${shardOf(id)}/${id}.json`;
export const pKey = (p: string, c: string, id: string) => `p/${p}/${c}/${shardOf(id)}/${id}.bin`;
export { sKey as resultKey };
/** A song's file changed because its tags were written (ADR 0110): what's kept of it (the details' header,
    the analysis result) follows its new size and date, so it isn't analysed again. Only if they were of the
    file as it was. */
export async function restamp(p: string, c: string, id: string, was: { size: number | null; mtime: number | null }, now: { size: number; mtime: number }) {
  const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
  const h = await read(dKey(p, c, id, 'json'));
  if (h) { const header = JSON.parse(new TextDecoder().decode(h)) as DetailsHeader; if (header.fileSize === was.size && header.fileMtime === was.mtime) await bridge.cacheWrite(dKey(p, c, id, 'json'), enc({ ...header, fileSize: now.size, fileMtime: now.mtime })); }
  const r = await result(p, c, id);
  if (r && r.size === was.size && r.mtime === was.mtime) await bridge.cacheWrite(sKey(p, c, id), enc({ ...r, size: now.size, mtime: now.mtime, summary: { ...r.summary, fileSize: now.size, fileMtime: now.mtime } }));
}
export async function result(p: string, c: string, id: string): Promise<Analysed | null> {
  const b = await read(sKey(p, c, id));
  try { return b ? JSON.parse(new TextDecoder().decode(b)) as Analysed : null; } catch { return null; }
}
/** Told of each song analysed here (lib: the library's queue of results to take in). */
export const onAnalysed: { f: ((p: string, c: string, id: string) => void) | null } = { f: null };
/** Songs analysed at a time: as set in GLUE Home (Activity), else bridge.autoPool. */
export const poolSize = (cfg: HomeConfig | null) => Math.max(1, Math.min(32, Math.round(cfg?.analysisWorkers || 0) || autoPool()));

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
/** A waveform made from the full analysis kept here (no need to read the song again), or null. */
export async function waveFromDetails(p: string, c: string, id: string): Promise<Uint8Array | null> {
  const d = await details(p, c, id);
  if (!d) return null;
  try {
    const w = makeWaveThumb((await decodeDetails(d.header, d.bin)).res);
    await putWave(p, c, id, w);
    return w;
  } catch { return null; }
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
async function keepCover(p: string, c: string, id: string, cover: Cover | null) {
  if (cover) { await putArt(cover.hash, 64, cover.small); await putArt(cover.hash, 320, cover.large); }
  await bridge.cacheWrite(cKey(p, c, id), new TextEncoder().encode(cover?.hash ?? ''));
}
/** A song's cover hash ('' none): known, or read from its tags now (only the bytes the tags need). */
export async function coverHash(p: string, c: string, id: string, cfg: HomeConfig): Promise<string> {
  const known = await read(cKey(p, c, id));
  if (known) return new TextDecoder().decode(known);
  const f = await trackPath(p, c, id, cfg);
  const size = await bridge.fileSize(f.path);
  const cover = await coverOf({ size, read: async (s, e) => new Uint8Array(await bridge.fileRead(f.path, s, e - s)) });
  await keepCover(p, c, id, cover);
  return cover?.hash ?? '';
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
  if (r.wave) await bridge.cacheWrite(incomingKey(name, 'wave.bin'), r.wave);
  if (r.details) { await bridge.cacheWrite(incomingKey(name, 'details.bin'), r.details.bin); await bridge.cacheWrite(incomingKey(name, 'details.json'), new TextEncoder().encode(JSON.stringify(r.details.header))); }
  await bridge.cacheWrite(incomingKey(name, 'summary.json'), new TextEncoder().encode(JSON.stringify({ ...r.summary, format: r.info.container ? { container: r.info.container, codec: r.info.codec, lossless: r.info.lossless, sampleRate: r.info.sampleRate, bits: r.info.bits, bitrate: Math.round(r.info.bitrate || 0), channels: r.info.channels } : null, duration: r.duration })));
}
export async function incomingSummary(name: string) { const b = await read(incomingKey(name, 'summary.json')); return b ? JSON.parse(new TextDecoder().decode(b)) : null; }
export async function cacheFile(key: string) { return read(key); }

// ---- analysing here --------------------------------------------------------------------------------
let pool: AnalysisPool | null = null;

/** A song's bytes, read whole (ADR 0138): from GLUE Home's own local link in one request, one open file, the bytes a Blob
    (never through this page's JavaScript a piece at a time). Through Tauri 4 MB at a time it came at about 10 MB/s in
    all from a NAS that gives 47 to 74 (2026-10-01). Through Tauri still when the local link isn't there (a GLUE Home
    window in a test), or answers no. */
let localPort: Promise<number> | null = null;
async function readWhole(path: string, size: number, cfg: HomeConfig): Promise<Blob> {
  const port = await (localPort ??= bridge.localPort().catch(() => 0));
  if (port && cfg.localToken) {
    const r = await fetch('http://127.0.0.1:' + port + '/home/file?path=' + encodeURIComponent(path), { headers: { 'x-glue-token': cfg.localToken } }).catch(() => null);
    // Cut off midway (a network folder dropping): through Tauri, which says how much it read ("isn't reachable").
    const b = r?.ok ? await r.blob().catch(() => null) : null;
    if (b) return b;
  }
  const parts: ArrayBuffer[] = [];
  for (let at = 0; at < size;) { const b = await bridge.fileRead(path, at, 4 * 1024 * 1024); if (!b.byteLength) break; parts.push(b); at += b.byteLength; }
  return new Blob(parts);
}

/** A song given up on (ADR 0144), saved as failed: tried again when asked, or when its file changes. */
export async function giveUp(p: string, c: string, id: string, cfg: HomeConfig, why: string) {
  const f = await trackPath(p, c, id, cfg), size = await bridge.fileSize(f.path);
  await bridge.cacheWrite(sKey(p, c, id), new TextEncoder().encode(JSON.stringify({ summary: failed(gaveUp(why), { size, mtime: f.mtime }), size, mtime: f.mtime, format: null, duration: null, fields: {} } satisfies Analysed)));
  onAnalysed.f?.(p, c, id);
}

/** How long a song's analysis may take (ADR 0144): 2 minutes, or a second a MB. */
export const timeFor = (size: number) => Math.max(120_000, Math.round(size / 1e6) * 1000);

/** Read a song of this computer's library (whole, readWhole) and analyse it like the website does. */
/** `tell`: the result is for the library (false: only this cache's, filled in the background; the library has it). */
export async function analyse(p: string, c: string, id: string, cfg: HomeConfig, tell = true): Promise<{ thumb: Uint8Array | null; header: DetailsHeader | null; bin: Uint8Array | null; bytes: number; readMs: number; analyseMs: number }> {
  const f = await trackPath(p, c, id, cfg);
  const t0 = performance.now();
  step(null, 'reading');
  let now: 'reading' | 'analysing' | null = 'reading';
  try {
    const size = await bridge.fileSize(f.path);
    const whole = await readWhole(f.path, size, cfg), got = whole.size;
    // A network folder that dropped mid-file: tried again later, never decoded (and kept as failed) from a part.
    if (got < size) throw new Error('GLUE Home read only part of ' + f.name + ' (' + got + ' of ' + size + ' bytes): its folder isn’t reachable right now');
    const t1 = performance.now();
    step('reading', 'analysing'); now = 'analysing';
    const want = poolSize(cfg);
    if (pool && pool.size !== want) { const old = pool; pool = null; setTimeout(() => old.stop(), 150_000); }   // what runs there finishes
    pool ??= new AnalysisPool(want);
    // A song that never finishes (it won't decode) mustn't hold up the others: then its worker ends (only its: every
    // other song goes on). 2 minutes, or a second a MB for a big file (ADR 0144): a 10-minute 24-bit/192 kHz FLAC of
    // 543 MB took 75 s on its own, and longer beside the others.
    let r: Awaited<ReturnType<AnalysisPool['analyze']>>;
    try {
      r = await pool.analyze(new File([whole], f.name, { lastModified: f.mtime }), f.mtime, timeFor(size));
    } catch (e) {
      // Out of time or memory, or its worker stopped: tried again later (ADR 0109), never saved as the song's.
      if (/analysis worker stopped/.test(String((e as Error)?.message)) || isTransient(String((e as Error)?.message))) throw e;
      // Said once, like a GLUE tab says it: not tried again until the file changes.
      const msg = String((e as Error)?.message || 'It couldn’t be decoded.').replace(/^(EncodingError: )?(Unable to decode.*|decode failed)$/i, 'It couldn’t be decoded.');
      await bridge.cacheWrite(sKey(p, c, id), new TextEncoder().encode(JSON.stringify({ summary: failed(msg, { size, mtime: f.mtime }), size, mtime: f.mtime, format: null, duration: null, fields: {} } satisfies Analysed)));
      if (tell) onAnalysed.f?.(p, c, id);
      throw e;
    }
    const t2 = performance.now();
    step('analysing', null); now = null;
    if (r.thumb) await putThumb(p, c, id, r.thumb);
    if (r.wave) await putWave(p, c, id, r.wave);
    if (r.details) await putDetails(p, c, id, r.details.header, r.details.bin);
    if (r.art !== undefined) await keepCover(p, c, id, r.art);
    if (r.fp) await bridge.cacheWrite(pKey(p, c, id), encodeFingerprint(r.fp));
    await bridge.cacheWrite(sKey(p, c, id), new TextEncoder().encode(JSON.stringify(analysed(r, size, f.mtime))));   // last: a result has all its parts
    if (tell) onAnalysed.f?.(p, c, id);
    onMade.f?.(p, c, id);
    return { thumb: r.thumb, header: r.details?.header ?? null, bin: r.details?.bin ?? null, bytes: got, readMs: t1 - t0, analyseMs: t2 - t1 };
  } finally { if (now) step(now, null); }
}

/** When another device last streamed a song from here (ADR 0138): the analysis eases off, as for this computer's page. */
export const playing = { at: 0 };

/** A song's parts were made here (any reason): the devices with a session are told (ADR 0133). */
export const onMade: { f: ((p: string, c: string, id: string) => void) | null } = { f: null };

/** The songs being analysed now, by step (ADR 0136): reading the file, or analysing it. Mostly reading means the
    drive or network is the limit; mostly analysing, the processor. GLUE Home's window shows it as a meter. */
export const steps = { reading: 0, analysing: 0, changed: null as (() => void) | null };
const step = (from: 'reading' | 'analysing' | null, to: 'reading' | 'analysing' | null) => { if (from) steps[from]--; if (to) steps[to]++; steps.changed?.(); };

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
      try { await analyse(j.p, j.c, j.id, c, false); } catch { /* not found or not decodable: skipped */ } finally { running = false; }
      if (urgent.length) void drain(cfg);
      progress.background.done++;
      if (progress.background.done % 10 === 0) report();
      await new Promise(r => setTimeout(r, 1500));   // gently: this computer is in use too
    }
  } finally { progress.background.running = false; report(); }
}
