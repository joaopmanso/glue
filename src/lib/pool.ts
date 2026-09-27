/* Background analysis (ADR 0019): several tracks at once, in a pool of workers that return summaries
   only. Each gets the file itself and reads, parses and decodes it there (ADR 0060), so the page never
   waits on it. A format the worker can't decode is decoded on the page the old way (at most 2 at a
   time), then analysed in the worker. */
import type { FileInfo } from '../core/types';
import type { AnalysisSummary } from '../store/types';
import type { AnalysisReply, WorkerJob } from '../workers/analysis.worker';
import { pageJob, transferOf } from './analysis';
import { timeAsync } from '../core/perf';

import type { DetailsHeader } from '../store/details';
export interface PoolResult { summary: AnalysisSummary; info: FileInfo; duration: number; details: { header: DetailsHeader; bin: Uint8Array } | null; fp: { words: Uint32Array; loud: Uint8Array } | null; thumb: Uint8Array | null; wave: Uint8Array | null }

const MAX_BYTES = 1.2e9;
export const poolSize = () => Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)));

class Slot {
  private w: Worker | null = null;
  private waiting: { resolve: (r: AnalysisReply) => void; reject: (e: Error) => void } | null = null;
  private id = 0;
  run(msg: { job: WorkerJob; summary: { info: FileInfo | null; size: number; mtime: number } }, transfer: Transferable[]): Promise<AnalysisReply> {
    if (!this.w) {
      this.w = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
      this.w.onmessage = (e: MessageEvent<AnalysisReply>) => { if (e.data.kind !== 'progress' && e.data.id === this.id) { const p = this.waiting; this.waiting = null; p?.resolve(e.data); } };
      this.w.onerror = e => { e.preventDefault(); const p = this.waiting; this.waiting = null; this.w?.terminate(); this.w = null; p?.reject(new Error('The analysis worker stopped (out of memory?)')); };
    }
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.waiting = { resolve, reject }; this.w!.postMessage({ id, ...msg }, transfer); });
  }
  stop() { this.w?.terminate(); this.w = null; }
}

let decoding = 0;
const decodeQueue: (() => void)[] = [];
async function withDecoder<T>(fn: () => Promise<T>): Promise<T> {
  if (decoding >= 2) await new Promise<void>(r => decodeQueue.push(r));
  decoding++;
  try { return await fn(); } finally { decoding--; decodeQueue.shift()?.(); }
}

export class AnalysisPool {
  private slots: Slot[] = [];
  private free: Slot[] = [];
  private waiters: ((s: Slot) => void)[] = [];
  constructor(size = poolSize()) { for (let i = 0; i < size; i++) { const s = new Slot(); this.slots.push(s); this.free.push(s); } }
  get size() { return this.slots.length; }

  private async slot(): Promise<Slot> { return this.free.pop() ?? new Promise(r => this.waiters.push(r)); }
  private release(s: Slot) { const w = this.waiters.shift(); if (w) w(s); else this.free.push(s); }

  async analyze(file: File, mtime: number): Promise<PoolResult> {
    if (file.size > MAX_BYTES) throw new Error('File too large to analyse in the background; open it to analyse.');
    const s = await this.slot();
    try {
      const summary = { info: null, size: file.size, mtime };
      let r = await timeAsync('analysis.worker', () => s.run({ job: { type: 'file', file }, summary }, []));
      if (r.kind === 'decode') {
        // A codec the worker can't decode (ALAC in some browsers, HE-AAC it would decode at another rate).
        const info = r.info, job = await timeAsync('analysis.pagedecode', () => withDecoder(() => pageJob(file, info)));
        r = await timeAsync('analysis.worker', () => s.run({ job, summary: { ...summary, info } }, transferOf(job)));
      }
      if (r.kind === 'error') throw new Error(r.message);
      if (r.kind !== 'summary') throw new Error('Unexpected reply from the analysis worker');
      const info = r.info;
      if (!info.sampleRate) info.sampleRate = r.sr;
      if (!info.channels) info.channels = r.channels;
      if (!info.duration) info.duration = r.duration;
      if (!info.bitrate && info.duration && info.lossless === false) info.bitrate = file.size * 8 / info.duration / 1000;
      return { summary: r.out, info, duration: info.duration, details: r.details, fp: r.fp, thumb: r.thumb, wave: r.wave };
    } finally { this.release(s); }
  }
  stop() { for (const s of this.slots) s.stop(); }
}
