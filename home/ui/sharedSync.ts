/* GLUE Home syncs its computer's shared collections when no GLUE tab here does (ADR 0097): the website's
   own engine (store/shared/engine) against the GLUE folder, through the local link's file API, under
   the same rule as every other write (only while no tab holds the lease, ADR 0051). Then the song info
   edited on other devices goes into this computer's files, and what that changed (their size and date)
   goes back up. Clashes wait with the sync state in the GLUE folder: the next GLUE tab on this computer
   asks (ADR 0095). */
import { bridge, type HomeConfig } from './bridge';
import { access } from './cloud';
import { describe } from './library';
import { HomeDisk } from '../../src/platform/homeDisk';
import { CollectionStore } from '../../src/store/collection';
import { writeUnwritten } from '../../src/store/writeInfo';
import { syncShared, type SharedCloud } from '../../src/store/shared/engine';
import { meFor, type SharedCollection } from '../../src/core/shared/project';
import { INCOMING_ROOT } from '../../src/store/types';

let running: Promise<number> | null = null, again = false;
export const sharedDone = { synced: 0, at: 0, error: '' };

function cloudFor(api: string, token: () => Promise<string>, cid: string): SharedCloud {
  const at = api + '/v1/shared/' + encodeURIComponent(cid);
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(at + path, { ...init, headers: { ...(init.headers ?? {}), Authorization: 'Bearer ' + await token() } });
    if (!r.ok) throw new Error('GLUE Cloud: ' + r.status);
    return r;
  };
  return {
    changes: async since => (await call('/changes?since=' + since)).json(),
    bundle: async paths => (await call('/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) })).text(),
    push: async body => (await call('/push', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body })).json(),
  };
}

/** Sync every shared collection here (once at a time; asked again while running: once more after). The
    number of files that changed here. */
export function syncSharedHere(cfg: HomeConfig | null, api: string): Promise<number> {
  if (running) { again = true; return running; }
  return (running = once(cfg, api).finally(() => { running = null; if (again) { again = false; void syncSharedHere(cfg, api); } }));
}

async function once(cfg: HomeConfig | null, api: string): Promise<number> {
  if (!cfg?.deviceId || !cfg.token || !cfg.glue || !cfg.localToken) return 0;
  if (await bridge.leaseHeld()) return 0;   // the open tab syncs
  const port = await bridge.localPort(), lib = await describe();
  if (!port || !lib) return 0;
  let tok: { t: string; at: number } | null = null;
  const token = async () => { if (!tok || Date.now() - tok.at > 40 * 60e3) tok = { t: await access(api, cfg.deviceId!, cfg.token!), at: Date.now() }; return tok.t; };
  const disk = new HomeDisk('http://127.0.0.1:' + port, cfg.localToken);
  let roots: Awaited<ReturnType<HomeDisk['roots']>> | null = null;
  let changed = 0;
  try {
    for (const p of lib.profiles) for (const c of p.collections) {
      const meta = JSON.parse(await bridge.glueRead(`profiles/${p.id}/collections/${c.id}/collection.json`).catch(() => 'null')) as SharedCollection | null;
      if (!meta?.shared) continue;
      const me = meFor(meta, p.id, cfg.deviceId);
      if (!me) continue;
      roots ??= await disk.roots();
      if (!roots.glue) return changed;
      const glue = disk.dir(roots.glue), r = roots;
      if (await bridge.leaseHeld()) return changed;   // a tab opened meanwhile: it's the writer now
      const place = { root: glue, pid: p.id, cid: c.id, me, cloud: cloudFor(api, token, c.id) };
      const res = await syncShared(place);
      changed += res.changed.length;
      // Song info edited elsewhere, into this computer's files; their new size and date go back up.
      const s = await CollectionStore.load(glue, p.id, c.id, { me });
      if (![...s.tracks.values()].some(t => t.unwritten && !t.remote)) continue;
      if (await bridge.leaseHeld()) return changed;
      await writeUnwritten(s, (tr, tags) => {
        const at = tr.rootId === INCOMING_ROOT ? r.incoming : r.folders[tr.rootId ?? ''];
        if (!at || !tr.relPath) throw new Error('GLUE Home doesn’t know this song’s music folder');
        return disk.tags(at, tr.relPath, tags);
      }, { stop: () => false });
      await s.flush();
      await syncShared(place);
    }
    sharedDone.synced += changed; sharedDone.at = Date.now(); sharedDone.error = '';
  } catch (e) { sharedDone.error = (e as Error).message; throw e; }
  return changed;
}
