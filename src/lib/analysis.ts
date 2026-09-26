/* Client for the analysis worker. Every request has an id, so replies can never reach the wrong
   caller (the old page swapped results when a second file was dropped mid-analysis).
   A file goes to the worker as it is: it reads, parses and decodes it there (ADR 0060). When it can't
   decode a format, it answers NeedsPageDecode and the page decodes it the old way (pageJob). */
import type { AnalysisJob, AnalysisResult, FileInfo, ProgressFn } from '../core/types';
import type { Waveform } from '../core/audio/waveform';
import type { Fingerprint } from '../core/audio/fingerprint';
import type { AnalysisReply, WorkerJob } from '../workers/analysis.worker';
import { runJob } from '../core/audio/analyze';
import { blankInfo, parseContainer } from '../core/formats/parse';

let worker: Worker | null = null, broken = false, nextId = 1;
const pending = new Map<number, { resolve: (r: never) => void; reject: (e: Error) => void; progress: ProgressFn }>();

/** The worker couldn't decode this file here: the page must (pageJob), with what it found in the file. */
export class NeedsPageDecode extends Error {
  constructor(readonly info: FileInfo) { super('This file is decoded on the page.'); }
}

function getWorker(): Worker | null {
  if (worker || broken) return worker;
  try {
    worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AnalysisReply>) => {
      const d = e.data, p = pending.get(d.id);
      if (!p) return;
      if (d.kind === 'progress') p.progress(d.stage, d.p);
      else if (d.kind === 'done' || d.kind === 'wave' || d.kind === 'fp' || d.kind === 'pcm') { pending.delete(d.id); (p.resolve as (r: unknown) => void)(d.out); }
      else if (d.kind === 'decode') { pending.delete(d.id); p.reject(new NeedsPageDecode(d.info)); }
      else if (d.kind === 'error') { pending.delete(d.id); p.reject(new Error(d.message)); }
    };
    worker.onerror = e => {
      e.preventDefault();
      const err = new Error('The analysis worker stopped: ' + (e.message || 'out of memory?'));
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      worker?.terminate(); worker = null;   // a fresh one is created on the next request
    };
  } catch { broken = true; worker = null; }
  return worker;
}

/** What to hand over with a job: its audio buffers (a file is shared, not moved). */
export function transferOf(job: WorkerJob): Transferable[] {
  return job.type === 'pcm' ? [job.buffer] : job.type === 'float' ? job.channels.map(c => c.buffer) : [];
}

function send<T>(msg: Record<string, unknown>, transfer: Transferable[], progress: ProgressFn = () => {}): Promise<T> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('The analysis worker isn’t available.'));
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (r: never) => void, reject, progress });
    w.postMessage({ id, ...msg }, transfer);
  });
}

/** Run one analysis job in the worker (or on the main thread if workers are unavailable). */
export function analyze(job: WorkerJob, progress: ProgressFn): Promise<AnalysisResult> {
  if (!getWorker()) {
    if (job.type === 'file') return Promise.reject(new NeedsPageDecode(job.info ?? blankInfo()));
    return new Promise((res, rej) => setTimeout(() => { try { res(runJob(job, progress)); } catch (e) { rej(e); } }, 30));
  }
  return send<AnalysisResult>({ job }, transferOf(job), progress);
}

/** A worker request with a file, again with the page's decode if the worker couldn't decode it. */
async function withPageDecode<T>(job: Exclude<WorkerJob, { type: 'demo' }>, run: (j: Exclude<WorkerJob, { type: 'demo' }>) => Promise<T>): Promise<T> {
  try { return await run(job); }
  catch (e) {
    if (!(e instanceof NeedsPageDecode) || job.type !== 'file') throw e;
    return run(await pageJob(job.file, e.info));
  }
}

/** The Prepare tab's waveform of a track's audio (in the worker). */
export function waveformOf(job: Exclude<WorkerJob, { type: 'demo' }>): Promise<Waveform> {
  return withPageDecode(job, j => send<Waveform>({ wave: j }, transferOf(j)));
}

/** A song's fingerprint only (in the worker). */
export function fingerprintOf(job: Exclude<WorkerJob, { type: 'demo' }>): Promise<Fingerprint> {
  return withPageDecode(job, j => send<Fingerprint>({ fp: j }, transferOf(j)));
}

/** A file's audio as the worker decodes it (diagnostics, lib/decodeCheck). */
export function decodedByWorker(file: Blob): Promise<Exclude<AnalysisJob, { type: 'demo' }>> {
  return send({ pcm: { type: 'file', file } }, []);
}

/** A file's audio decoded on the page, the way it was before workers decoded (ADR 0019): raw PCM
    when GLUE reads the format itself (WAV, AIFF), else the browser's decoder at the file's rate.
    For the formats a worker can't decode. `info`: what's known already (fills in the channels). */
export async function pageJob(file: Blob, info: FileInfo | null = null): Promise<Exclude<AnalysisJob, { type: 'demo' }>> {
  const buf = await file.arrayBuffer();
  if (!info) { try { info = parseContainer(new Uint8Array(buf)); } catch { info = blankInfo(); } }
  if (info.pcm) return { type: 'pcm', buffer: buf, pcm: info.pcm, sr: info.sampleRate };
  const ab = await decodeAudio(buf, info.decodeRate || info.sampleRate || 48000);
  const channels: Float32Array[] = [];
  for (let c = 0; c < ab.numberOfChannels; c++) channels.push(new Float32Array(ab.getChannelData(c)));
  if (!info.channels) info.channels = ab.numberOfChannels;
  return { type: 'float', channels, sr: ab.sampleRate, bits: info.lossless ? info.bits : 0 };
}

/** Decode with the browser at a given rate (main thread only: OfflineAudioContext isn't in workers). */
export async function decodeAudio(buf: ArrayBuffer, rate: number): Promise<AudioBuffer> {
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  let ctx: OfflineAudioContext;
  try { ctx = new Ctx(1, 1, rate); } catch { ctx = new Ctx(1, 1, 48000); }
  return await new Promise<AudioBuffer>((resolve, reject) => {
    const p = ctx.decodeAudioData(buf, resolve, e => reject(e || new Error('decode failed')));
    if (p && p.then) p.then(resolve, e => reject(e || new Error('decode failed')));
  });
}
