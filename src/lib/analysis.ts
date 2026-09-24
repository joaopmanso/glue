/* Client for the analysis worker. Every request has an id, so replies can never reach the wrong
   caller (the old page swapped results when a second file was dropped mid-analysis). */
import type { AnalysisJob, AnalysisResult, ProgressFn } from '../core/types';
import type { AnalysisReply } from '../workers/analysis.worker';
import { runJob } from '../core/audio/analyze';

let worker: Worker | null = null, broken = false, nextId = 1;
const pending = new Map<number, { resolve: (r: AnalysisResult) => void; reject: (e: Error) => void; progress: ProgressFn }>();

function getWorker(): Worker | null {
  if (worker || broken) return worker;
  try {
    worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AnalysisReply>) => {
      const d = e.data, p = pending.get(d.id);
      if (!p) return;
      if (d.kind === 'progress') p.progress(d.stage, d.p);
      else if (d.kind === 'done') { pending.delete(d.id); p.resolve(d.out); }
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

/** Run one analysis job in the worker (or on the main thread if workers are unavailable). */
export function analyze(job: AnalysisJob, progress: ProgressFn): Promise<AnalysisResult> {
  const w = getWorker();
  if (!w) return new Promise((res, rej) => setTimeout(() => { try { res(runJob(job, progress)); } catch (e) { rej(e); } }, 30));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    const transfer: Transferable[] = job.type === 'pcm' ? [job.buffer] : job.type === 'float' ? job.channels.map(c => c.buffer) : [];
    w.postMessage({ id, job }, transfer);
  });
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
