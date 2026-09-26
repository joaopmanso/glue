/* The Prepare tab's waveforms (ADR 0052), kept in the browser's cache next to the stored analyses:
   one file per track, a small JSON header then the arrays. Only valid for the same file (size, date). */
import { writeBlob, type Dir } from './fsx';
import { shardOf } from './types';
import type { Waveform } from '../core/audio/waveform';

const VERSION = 1;
const path = (cid: string, id: string) => `waves/${cid}/${shardOf(id)}/${id}.bin`;
interface Header { v: number; size: number | null; mtime: number | null; rate: number; n: number; envRate: number; envT0: number; envN: number; duration: number }

export async function writeWaveform(dir: Dir, cid: string, id: string, file: { size: number | null; mtime: number | null }, w: Waveform) {
  const h: Header = { v: VERSION, size: file.size, mtime: file.mtime, rate: w.rate, n: w.low.length, envRate: w.envRate, envT0: w.envT0, envN: w.env.length, duration: w.duration };
  const head = new TextEncoder().encode(JSON.stringify(h)), len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, head.length, true);
  await writeBlob(dir, path(cid, id), new Blob([len, head, w.low, w.mid, w.high, w.peak, w.env] as BlobPart[]));
}

export async function loadWaveform(dir: Dir, cid: string, id: string, file: { size: number | null; mtime: number | null }): Promise<Waveform | null> {
  try {
    const parts = path(cid, id).split('/'), name = parts.pop()!;
    let d = dir;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    const b = new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer());
    const hl = new DataView(b.buffer).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + hl))) as Header;
    if (h.v !== VERSION || h.size !== file.size || h.mtime !== file.mtime) return null;
    let at = 4 + hl;
    const take = (n: number) => { const a = b.slice(at, at + n); at += n; return a; };
    const low = take(h.n), mid = take(h.n), high = take(h.n), peak = take(h.n), env = take(h.envN);
    return { rate: h.rate, low, mid, high, peak, env, envRate: h.envRate, envT0: h.envT0, duration: h.duration };
  } catch { return null; }
}
