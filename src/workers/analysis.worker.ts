/// <reference lib="webworker" />
import { monoOf, runJob } from '../core/audio/analyze';
import { computeWaveform, type Waveform } from '../core/audio/waveform';
import { fingerprint, type Fingerprint } from '../core/audio/fingerprint';
import { classify } from '../core/audio/verdict';
import { summarize } from '../core/library/summary';
import { encodeDetails, type DetailsHeader } from '../store/details';
import { makeThumb, makeWaveThumb } from '../core/library/thumb';
import type { AnalysisJob, AnalysisResult, FileInfo } from '../core/types';
import type { AnalysisSummary } from '../store/types';
import { blankInfo, parseContainer } from '../core/formats/parse';
import { scanClues } from '../core/formats/clues';
import { decodeHere } from './decode';
import { coverOf, type Cover } from './cover';

/** A job as the worker takes it: audio already decoded, or the file itself, read, parsed and decoded
    here (ADR 0060; `info`: what the page parsed already). */
export type WorkerJob = AnalysisJob | { type: 'file'; file: Blob; info?: FileInfo };
/** Full result (the detail view), or just the summary the library keeps (background analysis; info:
    null when the job is a file, parsed here). */
export type AnalysisRequest =
  | { id: number; job: WorkerJob }
  | { id: number; wave: Exclude<WorkerJob, { type: 'demo' }> }
  | { id: number; fp: Exclude<WorkerJob, { type: 'demo' }> }
  /** Just the decoded audio (diagnostics: the page compares it with its own decode, ADR 0060). */
  | { id: number; pcm: Exclude<WorkerJob, { type: 'demo' }> }
  | { id: number; job: WorkerJob; summary: { info: FileInfo | null; size: number; mtime: number } };
export type AnalysisReply =
  | { id: number; kind: 'progress'; stage: string; p: number }
  | { id: number; kind: 'done'; out: AnalysisResult }
  | { id: number; kind: 'summary'; out: AnalysisSummary; info: FileInfo; duration: number; sr: number; channels: number; details: { header: DetailsHeader; bin: Uint8Array } | null; fp: { words: Uint32Array; loud: Uint8Array } | null; thumb: Uint8Array | null; wave: Uint8Array | null; art?: Cover | null }
  | { id: number; kind: 'wave'; out: Waveform }
  | { id: number; kind: 'fp'; out: Fingerprint }
  | { id: number; kind: 'pcm'; out: Exclude<AnalysisJob, { type: 'demo' }> }
  /** This file can't be decoded here: the page decodes it (NeedsPageDecode) and asks again. */
  | { id: number; kind: 'decode'; info: FileInfo }
  | { id: number; kind: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

class PageDecode extends Error { constructor(readonly info: FileInfo) { super('page decode'); } }
/** A file job becomes decoded audio: WAV / AIFF read directly, anything else decoded here. */
async function materialize<J extends WorkerJob>(job: J): Promise<{ job: Exclude<J, { type: 'file' }>; info: FileInfo | null }> {
  if (job.type !== 'file') return { job: job as Exclude<J, { type: 'file' }>, info: null };
  const f = job.file, buf = await f.arrayBuffer(), u8 = new Uint8Array(buf);
  let info = job.info ?? null;
  if (!info) {
    try { info = parseContainer(u8); } catch { info = blankInfo(); }
    info.fileName = (f as File).name ?? ''; info.fileSize = f.size;
    info.clues = scanClues(u8, info);
  }
  if (info.unsupported) throw new Error(info.unsupported);
  if (info.pcm) return { job: { type: 'pcm', buffer: buf, pcm: info.pcm, sr: info.sampleRate } as Exclude<J, { type: 'file' }>, info };
  const d = await decodeHere(f, info, u8);
  if (!d) throw new PageDecode(info);
  if (!info.channels) info.channels = d.channels.length;
  return { job: { type: 'float', channels: d.channels, sr: d.sr, bits: info.lossless ? info.bits : 0 } as Exclude<J, { type: 'file' }>, info };
}
const plain = (info: FileInfo): FileInfo => ({ ...info, pcm: undefined });

scope.onmessage = async (e: MessageEvent<AnalysisRequest>) => {
  const { id } = e.data;
  try {
    // The Prepare tab's waveform and onset envelope (ADR 0052).
    if ('wave' in e.data) {
      const { mono, sr } = monoOf((await materialize(e.data.wave)).job), out = computeWaveform(mono, sr);
      scope.postMessage({ id, kind: 'wave', out } satisfies AnalysisReply, [out.low.buffer, out.mid.buffer, out.high.buffer, out.peak.buffer, out.env.buffer]);
      return;
    }
    if ('pcm' in e.data) {
      const out = (await materialize(e.data.pcm)).job;
      scope.postMessage({ id, kind: 'pcm', out } satisfies AnalysisReply, out.type === 'pcm' ? [out.buffer] : []);
      return;
    }
    // Just the fingerprint (duplicates), for a song analysed in another browser.
    if ('fp' in e.data) {
      const { mono, sr } = monoOf((await materialize(e.data.fp)).job), out = fingerprint(mono, sr);
      scope.postMessage({ id, kind: 'fp', out } satisfies AnalysisReply, [out.words.buffer, out.loud.buffer]);
      return;
    }
    const m = await materialize(e.data.job), job = m.job;
    let last = 0;
    const out = runJob(job, (stage, p) => {
      const now = Date.now();
      if (now - last > 80) { last = now; scope.postMessage({ id, kind: 'progress', stage, p } satisfies AnalysisReply); }
    }, { fingerprint: 'summary' in e.data });
    if ('summary' in e.data) {
      const { size, mtime } = e.data.summary, info = e.data.summary.info ?? m.info ?? blankInfo();
      if (!info.sampleRate) info.sampleRate = out.sr;
      const s = summarize(info, out, classify(info, out), { size, mtime });
      // The full result, in its stored form, so the track page never has to analyse again (ADR 0024).
      let details: { header: DetailsHeader; bin: Uint8Array } | null = null;
      try { details = await encodeDetails(info, out, { size, mtime }); } catch { details = null; }
      const fp = out.fp ?? null, transfer: Transferable[] = details ? [details.bin.buffer] : [];
      if (fp) transfer.push(fp.words.buffer, fp.loud.buffer);
      const thumb = makeThumb(out), wave = makeWaveThumb(out); transfer.push(thumb.buffer, wave.buffer);
      // The cover, from the file's tags (ADR 0072); not looked for when the page decoded it.
      const src = e.data.job.type === 'file' ? e.data.job.file : null;
      const art = src ? await coverOf(src).catch(() => undefined) : undefined;
      if (art) transfer.push(art.small.buffer, art.large.buffer);
      scope.postMessage({ id, kind: 'summary', out: { ...s, fp: !!fp }, info: plain(info), duration: out.duration, sr: out.sr, channels: out.channels, details, fp, thumb, wave, art } satisfies AnalysisReply, transfer);
      return;
    }
    const transfer: Transferable[] = [out.spec.buffer, out.ltas.buffer];
    if (out.demoPcm) transfer.push(out.demoPcm.buffer);
    scope.postMessage({ id, kind: 'done', out } satisfies AnalysisReply, transfer);
  } catch (err) {
    if (err instanceof PageDecode) { scope.postMessage({ id, kind: 'decode', info: plain(err.info) } satisfies AnalysisReply); return; }
    scope.postMessage({ id, kind: 'error', message: String((err as Error)?.message || err) } satisfies AnalysisReply);
  }
};
