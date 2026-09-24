/// <reference lib="webworker" />
import { runJob } from '../core/audio/analyze';
import type { AnalysisJob, AnalysisResult } from '../core/types';

export type AnalysisRequest = { id: number; job: AnalysisJob };
export type AnalysisReply =
  | { id: number; kind: 'progress'; stage: string; p: number }
  | { id: number; kind: 'done'; out: AnalysisResult }
  | { id: number; kind: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, job } = e.data;
  try {
    let last = 0;
    const out = runJob(job, (stage, p) => {
      const now = Date.now();
      if (now - last > 80) { last = now; scope.postMessage({ id, kind: 'progress', stage, p } satisfies AnalysisReply); }
    });
    const transfer: Transferable[] = [out.spec.buffer, out.ltas.buffer];
    if (out.demoPcm) transfer.push(out.demoPcm.buffer);
    scope.postMessage({ id, kind: 'done', out } satisfies AnalysisReply, transfer);
  } catch (err) {
    scope.postMessage({ id, kind: 'error', message: String((err as Error)?.message || err) } satisfies AnalysisReply);
  }
};
