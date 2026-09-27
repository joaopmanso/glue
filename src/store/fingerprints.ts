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

/* Packs (2026-09-27): one file per shard with all its fingerprints, `fp/<cid>/<shard>/pack.bin`, so a
   collection's fingerprints are a few hundred reads instead of one per song (thousands, a minute or
   two before duplicates showed). "GFP1", count; then per song: id length (u16), id, word count (u32),
   the words, the levels. The single files stay the source; a pack is rewritten from them. */
const packPath = (cid: string, shard: string) => `fp/${cid}/${shard}/pack.bin`;
const MAGIC = 0x31504647;   // "GFP1"

export function encodePack(entries: { id: string; fp: Fingerprint }[]): Uint8Array {
  const enc = new TextEncoder(), ids = entries.map(e => enc.encode(e.id));
  let size = 8;
  entries.forEach((e, i) => { size += 2 + ids[i].length + 4 + e.fp.words.length * 5; });
  const out = new Uint8Array(size), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, entries.length, true);
  let o = 8;
  entries.forEach((e, i) => {
    const n = e.fp.words.length;
    dv.setUint16(o, ids[i].length, true); o += 2;
    out.set(ids[i], o); o += ids[i].length;
    dv.setUint32(o, n, true); o += 4;
    out.set(new Uint8Array(e.fp.words.buffer, e.fp.words.byteOffset, n * 4), o); o += n * 4;
    out.set(e.fp.loud.subarray(0, n), o); o += n;
  });
  return out;
}
export function decodePack(b: Uint8Array): { id: string; fp: Fingerprint }[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out: { id: string; fp: Fingerprint }[] = [];
  if (b.length < 8 || dv.getUint32(0, true) !== MAGIC) return out;
  const dec = new TextDecoder(), count = dv.getUint32(4, true);
  let o = 8;
  for (let k = 0; k < count && o + 6 <= b.length; k++) {
    const len = dv.getUint16(o, true); o += 2;
    const id = dec.decode(b.subarray(o, o + len)); o += len;
    const n = dv.getUint32(o, true); o += 4;
    if (o + n * 5 > b.length) break;
    out.push({ id, fp: { words: new Uint32Array(b.slice(o, o + n * 4).buffer), loud: b.slice(o + n * 4, o + n * 5) } });
    o += n * 5;
  }
  return out;
}
/** Every fingerprint in the collection's packs, a few shards at a time. */
export async function readPacks(dir: Dir, cid: string): Promise<Map<string, Fingerprint>> {
  const out = new Map<string, Fingerprint>();
  let root: Dir;
  try { root = await (await dir.getDirectoryHandle('fp')).getDirectoryHandle(cid); } catch { return out; }
  const shards: Dir[] = [];
  for await (const h of (root as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) if (h.kind === 'directory') shards.push(h as Dir);
  let i = 0;
  const next = async (): Promise<void> => {
    const d = shards[i++];
    if (!d) return;
    try { for (const e of decodePack(new Uint8Array(await (await (await d.getFileHandle('pack.bin')).getFile()).arrayBuffer()))) out.set(e.id, e.fp); } catch { /* no pack yet */ }
    return next();
  };
  await Promise.all(Array.from({ length: 8 }, next));
  return out;
}
export async function writePack(dir: Dir, cid: string, shard: string, entries: { id: string; fp: Fingerprint }[]) {
  await writeBlob(dir, packPath(cid, shard), new Blob([encodePack(entries).slice().buffer]));
}
