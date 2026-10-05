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
import { syncShared, type SharedCloud } from '../../src/store/shared/engine';
import { unknownComputer, type SharedCollection } from '../../src/core/shared/project';
import { sendCounts } from '../../src/core/shared/counts';
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
      const glue = disk.dir(roots.glue);
      if (await bridge.leaseHeld()) return changed;   // a tab opened meanwhile: it's the writer now
      // The engine's store first: anything written under another id is put right before this syncs (ADR 0108).
      await engine.ensure(p.id, c.id);
      const place = { root: glue, pid: p.id, cid: c.id, me, cloud: cloudFor(api, token, c.id) };
      // Only the files written here since the last sync are looked at (every one now and then, ADR 0107).
      let hint = await engine.takeWritten(p.id, c.id);
      // What came in, into the engine's store (and a GLUE tab's feed), as it's written: also when the sync fails partway,
      // having written some (ADR 0143).
      const got: string[] = [];
      try { await syncShared(place, hint, got); } catch (e) {
        engine.writtenAgain(p.id, c.id, hint);
        // Deleted from the account on another device (ADR 0112): a backup, then forgotten here.
        if ((e as { status?: number }).status === 410) { await forget(glue, p.id, c.id, meta.name ?? c.id); continue; }
        if (got.length) await engine.reload(p.id, c.id, [...new Set(got)]).catch(() => {});
        throw e;
      }
      const res = { changed: [...new Set(got)] };
      changed += res.changed.length;
      await engine.reload(p.id, c.id, res.changed);
      // This computer's numbers, for the account's list (ADR 0112), when they changed (counted by the engine).
      const k = await engine.counts(p.id, c.id), n = { tracks: k.tracks, songs: k.songs };
      if (k.holds && sendCounts(counted, c.id, n)) await fetch(api + '/v1/shared/' + encodeURIComponent(c.id) + '/stats', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(n) })
        .then(r => { if (!r.ok) counted.delete(c.id); }, () => counted.delete(c.id));
      // Song info edited elsewhere, into this computer's files (the engine writes them, ADR 0153); their new size and
      // date go back up.
      if (!k.unwritten) continue;
      if (await bridge.leaseHeld()) return changed;
      await engine.writeUnwritten(p.id, c.id);
      hint = await engine.takeWritten(p.id, c.id);
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
