/* GLUE Home's own cache follows a collection that went into another (ADR 0102): the mini spectrograms,
   waveforms, analyses and covers it made for the old collection's songs are the new one's (with the ids
   `adopt` changed, from the old collection's `movedIds`). Once per moved collection. */
import { bridge, type HomeConfig } from './bridge';
import { HomeDisk } from '../../src/platform/homeDisk';
import { listNames, readJSON } from '../../src/store/fsx';
import { shardOf } from '../../src/store/types';

const HEX = '0123456789abcdef';
const KINDS = ['t', 'w', 'd', 'c'];

export async function followMoves(cfg: HomeConfig | null): Promise<number> {
  if (!cfg?.glue || !cfg.localToken) return 0;
  const port = await bridge.localPort();
  if (!port) return 0;
  const disk = new HomeDisk('http://127.0.0.1:' + port, cfg.localToken), roots = await disk.roots();
  if (!roots.glue) return 0;
  const glue = disk.dir(roots.glue);
  let moved = 0;
  for (const pid of await listNames(glue, 'profiles', 'directory').catch(() => [] as string[])) {
    for (const cid of await listNames(glue, `profiles/${pid}/collections`, 'directory').catch(() => [] as string[])) {
      const meta = await readJSON<{ movedTo?: string; movedIds?: Record<string, string> }>(glue, `profiles/${pid}/collections/${cid}/collection.json`).catch(() => null);
      if (!meta?.movedTo) continue;
      const done = `m/${pid}/${cid}.done`;
      if (await bridge.cacheRead(done).then(() => true, () => false)) continue;
      const ids = meta.movedIds ?? {};
      for (const k of KINDS) for (const a of HEX) for (const b of HEX) {
        const at = `${k}/${pid}/${cid}/${a}${b}`;
        for (const n of await bridge.cacheList(at).catch(() => [] as string[])) {
          const dot = n.indexOf('.'), id = dot < 0 ? n : n.slice(0, dot), ext = dot < 0 ? '' : n.slice(dot), nid = ids[id] ?? id;
          const bytes = await bridge.cacheRead(at + '/' + n).catch(() => null);
          if (!bytes) continue;
          await bridge.cacheWrite(`${k}/${pid}/${meta.movedTo}/${shardOf(nid)}/${nid}${ext}`, new Uint8Array(bytes));
          moved++;
        }
      }
      await bridge.cacheWrite(done, new TextEncoder().encode(String(Date.now())));
    }
  }
  return moved;
}
