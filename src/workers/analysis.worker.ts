/// <reference lib="webworker" />
import { runJob } from '../core/audio/analyze';
import { classify } from '../core/audio/verdict';
import { summarize } from '../core/library/summary';
import { encodeDetails, type DetailsHeader } from '../store/details';
import { makeThumb } from '../core/library/thumb';
import type { AnalysisJob, AnalysisResult, FileInfo } from '../core/types';
import type { AnalysisSummary } from '../store/types';

/** Full result (the detail view), or just the summary the library keeps (background analysis). */
export type AnalysisRequest =
  | { id: number; job: AnalysisJob }
  | { id: number; job: AnalysisJob; summary: { info: FileInfo; size: number; mtime: number } };
export type AnalysisReply =
  | { id: number; kind: 'progress'; stage: string; p: number }
  | { id: number; kind: 'done'; out: AnalysisResult }
  | { id: number; kind: 'summary'; out: AnalysisSummary; duration: number; sr: number; channels: number; details: { header: DetailsHeader; bin: Uint8Array } | null; fp: { words: Uint32Array; loud: Uint8Array } | null; thumb: Uint8Array | null }
  | { id: number; kind: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (e: MessageEvent<AnalysisRequest>) => {
  const { id, job } = e.data;
  try {
    let last = 0;
    const out = runJob(job, (stage, p) => {
      const now = Date.now();
      if (now - last > 80) { last = now; scope.postMessage({ id, kind: 'progress', stage, p } satisfies AnalysisReply); }
    }, { fingerprint: 'summary' in e.data });
    if ('summary' in e.data) {
      const { info, size, mtime } = e.data.summary;
      if (!info.sampleRate) info.sampleRate = out.sr;
      const s = summarize(info, out, classify(info, out), { size, mtime });
      // The full result, in its stored form, so the track page never has to analyse again (ADR 0024).
      let details: { header: DetailsHeader; bin: Uint8Array } | null = null;
      try { details = await encodeDetails(info, out, { size, mtime }); } catch { details = null; }
      const fp = out.fp ?? null, transfer: Transferable[] = details ? [details.bin.buffer] : [];
      if (fp) transfer.push(fp.words.buffer, fp.loud.buffer);
      const thumb = makeThumb(out); transfer.push(thumb.buffer);
      scope.postMessage({ id, kind: 'summary', out: { ...s, fp: !!fp }, duration: out.duration, sr: out.sr, channels: out.channels, details, fp, thumb } satisfies AnalysisReply, transfer);
      return;
    }
    const transfer: Transferable[] = [out.spec.buffer, out.ltas.buffer];
    if (out.demoPcm) transfer.push(out.demoPcm.buffer);
    scope.postMessage({ id, kind: 'done', out } satisfies AnalysisReply, transfer);
  } catch (err) {
    scope.postMessage({ id, kind: 'error', message: String((err as Error)?.message || err) } satisfies AnalysisReply);
  }
};
