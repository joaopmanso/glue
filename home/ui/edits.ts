/* Edits made on the account's other devices for this computer (ADR 0087): ratings, notes, tags,
   playlists and song info (title, artist, genre…). While a GLUE tab is open here in Home mode it holds
   the lease and takes them in itself (GLUE Home only tells it they're there). With no tab, GLUE Home
   applies them to the GLUE folder with the website's own store code, through its local link's file API
   (the same atomic writes), and writes edited song info into the files.
   It doesn't confirm them to GLUE Cloud: they stay waiting there, so the other devices keep showing
   them until the GLUE tab here next opens, confirms them (nothing left to change) and uploads the
   collection. How far GLUE Home got is kept in its cache (`e/applied.json`). */
import { bridge, type HomeConfig } from './bridge';
import { access } from './cloud';
import { describe } from './library';
import * as cache from './cache';
import { HomeDisk } from '../../src/platform/homeDisk';
import { CollectionStore } from '../../src/store/collection';
import { writeUnwritten } from '../../src/store/writeInfo';
import { apply, type EditOp } from '../../src/core/library/cloudEdits';
import { INCOMING_ROOT, type Profile } from '../../src/store/types';

const APPLIED = 'e/applied.json';
type Pending = { seq: number; collection: string; op: EditOp };
let running: Promise<number> | null = null, companion: string | null = null;
export const editsDone = { applied: 0, at: 0, error: '' };

/** Apply what's waiting (once at a time); the number of changes made. */
export function applyEdits(cfg: HomeConfig | null, api: string): Promise<number> {
  return (running ??= once(cfg, api).finally(() => { running = null; }));
}

async function once(cfg: HomeConfig | null, api: string): Promise<number> {
  if (!cfg?.deviceId || !cfg.token || !cfg.glue || !cfg.localToken) return 0;
  if (await bridge.leaseHeld()) return 0;   // the open tab takes them in
  const port = await bridge.localPort();
  if (!port) return 0;
  const t = await access(api, cfg.deviceId, cfg.token);
  const get = async <T>(path: string) => { const r = await fetch(api + path, { headers: { Authorization: 'Bearer ' + t } }); if (!r.ok) throw new Error('GLUE Cloud: ' + r.status); return r.json() as Promise<T>; };
  // The browser this GLUE Home is the companion of: the edits are addressed to it.
  if (!companion) {
    const me = await get<{ devices: { id: string; companionOf?: string | null }[] }>('/v1/me');
    companion = me.devices.find(d => d.id === cfg.deviceId)?.companionOf ?? null;
  }
  if (!companion) return 0;
  const lib = await describe();
  if (!lib) return 0;
  const seen = JSON.parse(new TextDecoder().decode(await cache.cacheFile(APPLIED) ?? new Uint8Array())  || '{}') as Record<string, number>;
  const disk = new HomeDisk('http://127.0.0.1:' + port, cfg.localToken);
  let roots: Awaited<ReturnType<HomeDisk['roots']>> | null = null;
  let changes = 0;
  for (const p of lib.profiles) {
    const profile = JSON.parse(await bridge.glueRead(`profiles/${p.id}/profile.json`).catch(() => 'null')) as Profile | null;
    if (!profile || profile.cloudSync === false) continue;
    const { ops } = await get<{ ops: Pending[] }>('/v1/sync/ops?device=' + encodeURIComponent(companion) + '&profile=' + encodeURIComponent(p.id));
    const fresh = ops.filter(o => o.seq > (seen[p.id] ?? 0));
    if (!fresh.length) continue;
    roots ??= await disk.roots();
    if (!roots.glue) return changes;
    const glue = disk.dir(roots.glue), r = roots;
    const byCollection = new Map<string, EditOp[]>();
    for (const o of fresh) (byCollection.get(o.collection) ?? byCollection.set(o.collection, []).get(o.collection)!).push(o.op);
    for (const [cid, list] of byCollection) {
      if (!p.collections.some(c => c.id === cid)) continue;
      const s = await CollectionStore.load(glue, p.id, cid);
      // A tab opened meanwhile: it's the writer now.
      if (await bridge.leaseHeld()) return changes;
      // Many playlists deleted at once: left to a GLUE tab, which asks first (ADR 0089).
      const dels = list.filter(o => o.t === 'list-del').length;
      changes += apply(s, dels > 3 ? list.filter(o => o.t !== 'list-del') : list);
      await s.flush();
      // Edited song info into the files (their new size and date back into the collection).
      await writeUnwritten(s, (tr, tags) => {
        const at = tr.rootId === INCOMING_ROOT ? r.incoming : r.folders[tr.rootId ?? ''];
        if (!at || !tr.relPath) throw new Error('GLUE Home doesn’t know this song’s music folder');
        return disk.tags(at, tr.relPath, tags);
      }, { stop: () => false });
      await s.flush();
    }
    seen[p.id] = fresh[fresh.length - 1].seq;
    await bridge.cacheWrite(APPLIED, new TextEncoder().encode(JSON.stringify(seen)));
  }
  editsDone.applied += changes; editsDone.at = Date.now(); editsDone.error = '';
  return changes;
}
