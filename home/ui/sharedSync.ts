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
import * as engine from './engine';
import * as cache from './cache';
import { writeUnwritten } from '../../src/store/writeInfo';
import { syncShared, type SharedCloud } from '../../src/store/shared/engine';
import { unknownComputer, type SharedCollection } from '../../src/core/shared/project';
import { INCOMING_ROOT } from '../../src/store/types';
import { countsOf, sendCounts } from '../../src/core/shared/counts';
import { forgetDeleted } from '../../src/store/shared/forget';
import { HomeStore } from '../../src/store/home';

let running: Promise<number> | null = null, again = false;
export const sharedDone = { synced: 0, at: 0, error: '' };
/** This computer's numbers last sent, per collection (ADR 0112). */
const counted = new Map<string, { key: string; at: number }>();

function cloudFor(api: string, token: () => Promise<string>, cid: string): SharedCloud {
  const at = api + '/v1/shared/' + encodeURIComponent(cid);
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(at + path, { ...init, headers: { ...(init.headers ?? {}), Authorization: 'Bearer ' + await token() } });
    if (!r.ok) throw Object.assign(new Error('GLUE Cloud: ' + r.status), { status: r.status });
    return r;
  };
  return {
    changes: async since => (await call('/changes?since=' + since)).json(),
    bundle: async paths => (await call('/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) })).text(),
    log: async since => (await call('/log?since=' + since)).json(),
    append: async (b, paths, data) => (await call('/append?music=1', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: b + '\t' + JSON.stringify(paths) + '\n' + data })).json(),
    touched: async to => (await call('/touched?to=' + to)).json(),
    checkpoint: async (at, body, done) => (await call('/checkpoint?at=' + at + (done ? '&done=1' : ''), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body })).json(),
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
      // Cloud sync turned off for the profile: its collections stay as they are (ADR 0102).
      const prof = JSON.parse(await bridge.glueRead(`profiles/${p.id}/profile.json`).catch(() => 'null')) as { cloudSync?: boolean } | null;
      if (prof?.cloudSync === false) continue;
      const meta = JSON.parse(await bridge.glueRead(`profiles/${p.id}/collections/${c.id}/collection.json`).catch(() => 'null')) as SharedCollection | null;
      if (!meta?.shared) continue;
      // As this computer, once GLUE Home knows which it is (ADR 0108); until then, not synced from here.
      if (unknownComputer(cfg.computer)) continue;
      const me = cfg.computer!;
      roots ??= await disk.roots();
      if (!roots.glue) return changed;
      const glue = disk.dir(roots.glue), r = roots;
      if (await bridge.leaseHeld()) return changed;   // a tab opened meanwhile: it's the writer now
      // The engine's store first: anything written under another id is put right before this syncs (ADR 0108).
      await engine.store(cfg, p.id, c.id);
      const place = { root: glue, pid: p.id, cid: c.id, me, cloud: cloudFor(api, token, c.id) };
      // Only the files written here since the last sync are looked at (every one now and then, ADR 0107).
      let hint = engine.takeWritten(p.id, c.id);
      let res: Awaited<ReturnType<typeof syncShared>>;
      try { res = await syncShared(place, hint); } catch (e) {
        engine.writtenAgain(p.id, c.id, hint);
        // Deleted from the account on another device (ADR 0112): a backup, then forgotten here.
        if ((e as { status?: number }).status === 410) { await forget(glue, p.id, c.id, meta.name ?? c.id); continue; }
        throw e;
      }
      changed += res.changed.length;
      // What came in, into the engine's store (and a GLUE tab's feed).
      await engine.reload(cfg, p.id, c.id, res.changed);
      // Song info edited elsewhere, into this computer's files; their new size and date go back up.
      const s = await engine.store(cfg, p.id, c.id);
      // This computer's numbers, for the account's list (ADR 0112), when they changed.
      const n = countsOf(s.tracks.values());
      if (sendCounts(counted, c.id, n)) await fetch(api + '/v1/shared/' + encodeURIComponent(c.id) + '/stats', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(n) })
        .then(r => { if (!r.ok) counted.delete(c.id); }, () => counted.delete(c.id));
      if (![...s.tracks.values()].some(t => t.unwritten && !t.remote)) continue;
      if (await bridge.leaseHeld()) return changed;
      await writeUnwritten(s, (tr, tags) => {
        const at = tr.rootId === INCOMING_ROOT ? r.incoming : r.folders[tr.rootId ?? ''];
        if (!at || !tr.relPath) throw new Error('GLUE Home doesn’t know this song’s music folder');
        return disk.tags(at, tr.relPath, tags);
      }, { stop: () => false, restamp: (tr, was, now) => cache.restamp(p.id, c.id, tr.id, was, now) });
      await s.flush();
      hint = engine.takeWritten(p.id, c.id);
      try { await syncShared(place, hint); } catch (e) { engine.writtenAgain(p.id, c.id, hint); throw e; }
    }
    sharedDone.synced += changed; sharedDone.at = Date.now(); sharedDone.error = '';
  } catch (e) { sharedDone.error = (e as Error).message; throw e; }
  return changed;
}

/** A collection deleted from the account (ADR 0112): the profile backed up, then the collection out of its list;
    its files stay in the GLUE folder. */
async function forget(glue: FileSystemDirectoryHandle, p: string, c: string, name: string) {
  if (await bridge.leaseHeld()) return;   // a tab opened meanwhile: it forgets it
  if (!await forgetDeleted(await HomeStore.open(glue), p, c)) return;
  engine.drop(p, c);
  engine.on.event?.('“' + name + '” was deleted from your account: backed up and put away');
}
