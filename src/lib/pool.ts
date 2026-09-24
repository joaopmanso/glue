/* Background analysis (ADR 0019): several tracks at once. Browser decoding (main thread only) is
   limited to 2 at a time; the heavy part (spectrum, verdict, tempo, key) runs in a pool of workers
   that return summaries only. WAV/AIFF skip the decoder: the worker reads their PCM directly. */
import type { AnalysisJob, FileInfo } from '../core/types';
import type { AnalysisSummary } from '../store/types';
import type { AnalysisReply } from '../workers/analysis.worker';
import { blankInfo, parseContainer } from '../core/formats/parse';
import { scanClues } from '../core/formats/clues';
import { decodeAudio } from './analysis';

import type { DetailsHeader } from '../store/details';
export interface PoolResult { summary: AnalysisSummary; info: FileInfo; duration: number; details: { header: DetailsHeader; bin: Uint8Array } | null; fp: { words: Uint32Array; loud: Uint8Array } | null; thumb: Uint8Array | null }

const MAX_BYTES = 1.2e9;
export const poolSize = () => Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)));

class Slot {
  private w: Worker | null = null;
  private waiting: { resolve: (r: AnalysisReply) => void; reject: (e: Error) => void } | null = null;
  private id = 0;
  run(msg: { job: AnalysisJob; summary: { info: FileInfo; size: number; mtime: number } }, transfer: Transferable[]): Promise<AnalysisReply> {
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
      const buf = await file.arrayBuffer();
      const u8 = new Uint8Array(buf);
      let info: FileInfo;
      try { info = parseContainer(u8); } catch { info = blankInfo(); }
      info.fileName = file.name; info.fileSize = file.size;
      info.clues = scanClues(u8, info);
      if (info.unsupported) throw new Error(info.unsupported);
      let job: AnalysisJob, transfer: Transferable[];
      if (info.pcm) { job = { type: 'pcm', buffer: buf, pcm: info.pcm, sr: info.sampleRate }; transfer = [buf]; }
      else {
        const ab = await withDecoder(() => decodeAudio(buf, info.decodeRate || info.sampleRate || 48000));
        const chs: Float32Array[] = [];
        for (let c = 0; c < ab.numberOfChannels; c++) chs.push(new Float32Array(ab.getChannelData(c)));
        job = { type: 'float', channels: chs, sr: ab.sampleRate, bits: info.lossless ? info.bits : 0 };
        transfer = chs.map(c => c.buffer);
        if (!info.channels) info.channels = ab.numberOfChannels;
      }
      const r = await s.run({ job, summary: { info: { ...info, pcm: undefined }, size: file.size, mtime } }, transfer);
      if (r.kind === 'error') throw new Error(r.message);
      if (r.kind !== 'summary') throw new Error('Unexpected reply from the analysis worker');
      if (!info.sampleRate) info.sampleRate = r.sr;
      if (!info.channels) info.channels = r.channels;
      if (!info.duration) info.duration = r.duration;
      if (!info.bitrate && info.duration && info.lossless === false) info.bitrate = file.size * 8 / info.duration / 1000;
      return { summary: r.out, info, duration: info.duration, details: r.details, fp: r.fp, thumb: r.thumb };
    } finally { this.release(s); }
  }
  stop() { for (const s of this.slots) s.stop(); }
}
