/* Acoustic fingerprints, kept in the browser's cache next to the stored analyses (ADR 0025).
   One file per track, `fp/<cid>/<shard>/<id>.bin`: word count (u32), the words, then one level byte
   per word. Derived data: rebuilt by re-analysing. */
import type { Fingerprint } from '../core/audio/fingerprint';
import { type Dir, removePath, writeBlob } from './fsx';
import { shardOf } from './types';

const path = (cid: string, id: string) => `fp/${cid}/${shardOf(id)}/${id}.bin`;

export function encodeFingerprint(fp: Fingerprint): Uint8Array {
  const n = fp.words.length, out = new Uint8Array(4 + n * 5);
  new DataView(out.buffer).setUint32(0, n, true);
  new Uint32Array(out.buffer, 4, n).set(fp.words);
  out.set(fp.loud, 4 + n * 4);
  return out;
}
export function decodeFingerprint(b: Uint8Array): Fingerprint | null {
  if (b.length < 4) return null;
  const n = new DataView(b.buffer, b.byteOffset).getUint32(0, true);
  if (b.length < 4 + n * 5) return null;
  const copy = b.slice(4, 4 + n * 4);
  return { words: new Uint32Array(copy.buffer), loud: b.slice(4 + n * 4, 4 + n * 5) };
}

export async function writeFingerprint(dir: Dir, cid: string, id: string, fp: Fingerprint) {
  await writeBlob(dir, path(cid, id), new Blob([encodeFingerprint(fp).slice().buffer]));
}
export async function readFingerprint(dir: Dir, cid: string, id: string): Promise<Fingerprint | null> {
  try {
    const parts = path(cid, id).split('/'), name = parts.pop()!;
    let d = dir;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    return decodeFingerprint(new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer()));
  } catch { return null; }
}
export const removeFingerprint = (dir: Dir, cid: string, id: string) => removePath(dir, path(cid, id));
