/* A set's mixdown into one file (ADR 0199): the mixer (src/core/sets/mixer.ts) run offline, its blocks encoded as
   24-bit WAV or 320 kbps MP3 and written as they come, into the file chosen in the save dialog (its handle, opened here)
   or gathered for a download. Each song is asked of the page when the mix reaches it (its File), decoded here (or by
   the page when this browser can't here), resampled to the mix rate, and let go once it's played.
   With this computer's GLUE Home mixing (ADR 0204, `home`), the frames come from its stream instead; the file is
   written here all the same. */
import { framer } from '../core/sets/stream';
import { Mixer, type Pcm } from '../core/sets/mixer';
import { MIX_RATE, type SetPlan } from '../core/sets/types';
import { pcm24, wavHeader } from '../core/formats/wav';
import { Asker, decodeSong, type SongAnswer, type SongQuestion } from './setDecode';
import { AudioSample, AudioSampleSource, canEncodeAudio, Mp3OutputFormat, Output, StreamTarget, type StreamTargetChunk } from 'mediabunny';
import { registerMp3Encoder } from '@mediabunny/mp3-encoder';

export type MixFormat = 'wav' | 'mp3';
export type ToMixdown =
  /** `home`: GLUE Home's stream of this plan's mix from its start, and its length (frames); absent: mixed here. */
  | { kind: 'start'; plan: SetPlan; format: MixFormat; handle: FileSystemFileHandle | null; home?: { url: string; length: number } }
  | SongAnswer
  | { kind: 'cancel' };
export type FromMixdown =
  | SongQuestion
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'done'; blob: Blob | null; frames: number }
  | { kind: 'error'; message: string; id?: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: FromMixdown) => scope.postMessage(m);

/** Where the bytes go: the chosen file (written in place), or pieces gathered into a Blob. */
interface Sink { write(pos: number, data: Uint8Array): Promise<void>; close(): Promise<Blob | null>; abort(): Promise<void> }
async function fileSink(h: FileSystemFileHandle): Promise<Sink> {
  const w = await h.createWritable();
  return { write: (position, data) => w.write({ type: 'write', position, data: data as Uint8Array<ArrayBuffer> }), close: async () => { await w.close(); return null; }, abort: () => w.abort() };
}
function blobSink(type: string): Sink {
  const parts: BlobPart[] = [], patches: { pos: number; data: Uint8Array }[] = [];
  let size = 0;
  return {
    write: async (pos, data) => {
      if (pos === size) { parts.push(data.length < 65536 ? data.slice() : new Blob([data as Uint8Array<ArrayBuffer>])); size += data.length; }
      else if (pos + data.length <= size) patches.push({ pos, data: data.slice() });   // a header, written again at the end
      else throw new Error('A gap in the file.');
    },
    close: async () => {
      let b = new Blob(parts);
      for (const p of patches) b = new Blob([b.slice(0, p.pos), p.data as Uint8Array<ArrayBuffer>, b.slice(p.pos + p.data.length)]);
      return new Blob([b], { type });
    },
    abort: async () => { parts.length = 0; },
  };
}

const asker = new Asker(post);
let cancelled = false;

/** Where the mix's frames come from: `next` fills up to `max` frames (0 at the end). */
interface Frames { total: number; next(L: Float32Array, R: Float32Array, max: number, at: number): Promise<number> }

/** Mixed here: each song decoded as the mix reaches it, let go after. */
function mixedHere(plan: SetPlan): Frames {
  const pcm = new Map<string, Pcm>(), loading = new Map<string, Promise<Pcm>>();
  const load = (id: string) => { let p = loading.get(id); if (!p) { p = decodeSong(id, asker); p.catch(() => {}); loading.set(id, p); } return p; };
  const m = new Mixer(plan, { get: id => pcm.get(id) ?? null }), AHEAD = MIX_RATE * 30;
  return {
    total: m.length,
    async next(L, R, max, f) {
      const now = m.needed(f, f + max), soon = m.needed(f, f + max + AHEAD);
      for (const id of soon) void load(id);
      for (const id of now) if (!pcm.has(id)) pcm.set(id, await load(id));
      for (const id of [...pcm.keys()]) if (!soon.includes(id)) { pcm.delete(id); loading.delete(id); }
      return m.render(L, R, Math.min(max, m.length - f));
    },
  };
}

/** Mixed by GLUE Home: its stream read as the file is written. */
function fromHome(home: { url: string; length: number }): Frames {
  const frames = framer();
  let rd: ReadableStreamDefaultReader<Uint8Array> | null = null, have: { l: Float32Array; r: Float32Array }[] = [], at = 0, done = false;
  return {
    total: home.length,
    async next(L, R, max) {
      if (!rd) {
        const r = await fetch(home.url);
        if (!r.ok || !r.body) throw new Error('GLUE Home didn’t mix it (' + r.status + ')');
        rd = r.body.getReader();
      }
      let n = 0;
      while (n < max) {
        if (!have.length) {
          if (done) break;
          const c = await rd.read();
          if (c.done) { done = true; continue; }
          const p = frames(c.value);
          if (p.l.length) have.push(p);
          continue;
        }
        const p = have[0], k = Math.min(max - n, p.l.length - at);
        L.set(p.l.subarray(at, at + k), n); R.set(p.r.subarray(at, at + k), n);
        n += k; at += k;
        if (at >= p.l.length) { have.shift(); at = 0; }
      }
      return n;
    },
  };
}

async function mixdown(plan: SetPlan, format: MixFormat, handle: FileSystemFileHandle | null, home?: { url: string; length: number }) {
  const sink = handle ? await fileSink(handle) : blobSink(format === 'wav' ? 'audio/wav' : 'audio/mpeg');
  const src = home ? fromHome(home) : mixedHere(plan), total = src.total;
  const BLOCK = MIX_RATE * 2, L = new Float32Array(BLOCK), R = new Float32Array(BLOCK);
  let pos = 0, mp3: { out: Output; src: AudioSampleSource } | null = null;
  try {
    if (format === 'wav') { await sink.write(0, new Uint8Array(44)); pos = 44; }
    else {
      if (!(await canEncodeAudio('mp3').catch(() => false))) registerMp3Encoder();
      const writable = new WritableStream<StreamTargetChunk>({ write: c => sink.write(c.position, c.data) });
      const out = new Output({ format: new Mp3OutputFormat(), target: new StreamTarget(writable) });
      const src = new AudioSampleSource({ codec: 'mp3', bitrate: 320_000 });
      out.addAudioTrack(src);
      await out.start();
      mp3 = { out, src };
    }
    for (let f = 0; f < total;) {
      if (cancelled) throw new Error('cancelled');
      const n = await src.next(L, R, Math.min(BLOCK, total - f), f);
      if (!n) break;
      if (format === 'wav') { const b = pcm24(L, R, n); await sink.write(pos, b); pos += b.length; }
      else {
        const data = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { data[2 * i] = L[i]; data[2 * i + 1] = R[i]; }
        const s = new AudioSample({ data, format: 'f32', numberOfChannels: 2, sampleRate: MIX_RATE, timestamp: f / MIX_RATE });
        await mp3!.src.add(s);
        s.close();
      }
      f += n;
      post({ kind: 'progress', done: f, total });
    }
    if (format === 'wav') await sink.write(0, wavHeader(pos - 44, MIX_RATE, 2, 24));
    else await mp3!.out.finalize();
    post({ kind: 'done', blob: await sink.close(), frames: total });
  } catch (e) {
    await mp3?.out.cancel().catch(() => {});
    await sink.abort().catch(() => {});
    const id = (e as { id?: string }).id;
    post({ kind: 'error', message: (e as Error).message, ...(id ? { id } : {}) });
  }
}

scope.onmessage = (e: MessageEvent<ToMixdown>) => {
  const d = e.data;
  if (d.kind === 'start') { cancelled = false; void mixdown(d.plan, d.format, d.handle, d.home); }
  else if (d.kind === 'cancel') cancelled = true;
  else asker.answer(d);
};
