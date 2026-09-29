/* A collection's derived data in the cache (not the GLUE folder), moved with the collection when it goes
   into another (ADR 0102): details, the mini waveforms and spectrograms, fingerprints (their single files:
   packs are made again from them) and covers. Songs `adopt` gave another id get theirs. Safe to lose, but
   thousands of analyses take hours to make again. */
import { type Dir, fileAt, listNames, removePath, writeBlob } from '../fsx';
import { shardOf } from '../types';

const SHARDED = ['details', 'thumbs', 'wthumbs', 'fp'];

export async function moveCaches(cache: Dir, from: string, to: string, ids: Map<string, string> | Record<string, string>): Promise<number> {
  const rename = (id: string) => (ids instanceof Map ? ids.get(id) : ids[id]) ?? id;
  let moved = 0;
  for (const kind of SHARDED) {
    for (const shard of await listNames(cache, `${kind}/${from}`, 'directory').catch(() => [] as string[])) {
      for (const name of await listNames(cache, `${kind}/${from}/${shard}`, 'file').catch(() => [] as string[])) {
        if (name === 'pack.bin') continue;
        const dot = name.indexOf('.'), id = dot < 0 ? name : name.slice(0, dot), ext = dot < 0 ? '' : name.slice(dot), nid = rename(id);
        const f = await fileAt(cache, `${kind}/${from}/${shard}/${name}`).catch(() => null);
        if (!f) continue;
        await writeBlob(cache, `${kind}/${to}/${shardOf(nid)}/${nid}${ext}`, f);
        moved++;
      }
    }
    await removePath(cache, `${kind}/${from}`).catch(() => {});
  }
  // Covers are kept by picture, not by song.
  for (const name of await listNames(cache, `art/${from}`, 'file').catch(() => [] as string[])) {
    const f = await fileAt(cache, `art/${from}/${name}`).catch(() => null);
    if (f) { await writeBlob(cache, `art/${to}/${name}`, f); moved++; }
  }
  await removePath(cache, `art/${from}`).catch(() => {});
  await removePath(cache, `dupes/${from}.json`).catch(() => {});   // matched again (ids may have changed)
  return moved;
}
