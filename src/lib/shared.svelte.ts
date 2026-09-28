/* The shared collection in this tab (ADR 0094): the open collection, when it's shared, synced with its
   one copy in GLUE Cloud (store/shared/engine): after each save, when another device changed it (the
   signaling room says so), when it opens, and every couple of minutes. Also making a collection shared,
   and adding one of the account's shared collections to this computer. */
import { sync } from './sync.svelte';   // its hooks first: this one chains onto them
import { account } from './account.svelte';
import { lib } from './library.svelte';
import { dupes } from './dupes.svelte';
import { makeShared, moveInto } from '../store/shared/seed';
import { buildBackup } from '../store/backup';
import { writeBlob } from '../store/fsx';
import { resolveClash, syncShared, waitingClashes, type Place, type SharedCloud } from '../store/shared/engine';
import { mergeBoth, type Clash } from '../core/shared/merge3';

export interface SharedInfo { id: string; name: string; seq: number; stats: { tracks?: number } | null; updatedAt: number }
const EVERY = 120_000;

function cloudFor(cid: string): SharedCloud {
  const at = '/v1/shared/' + encodeURIComponent(cid);
  return {
    changes: since => account.request('GET', at + '/changes?since=' + since),
    bundle: paths => account.request<string>('POST', at + '/bundle', { json: { paths }, raw: true }),
    push: body => account.request('POST', at + '/push', { text: body }),
  };
}

class Shared {
  /** The account's shared collections. */
  list = $state<SharedInfo[]>([]);
  status = $state<{ busy: boolean; at: number | null; error: string }>({ busy: false, at: null, error: '' });
  /** Changes that clashed with another device's (the cloud's were kept): for the prompt (phase 3). */
  clashes = $state<Clash[]>([]);
  private running: Promise<void> | null = null;
  private again = false;
  private timer = 0;

  /** This computer's device (a computer is its GLUE Home's, ADR 0091). */
  private me() { return account.thisDevice; }
  private place(): Place | null {
    const s = lib.store, me = this.me();
    if (!s?.shared || !lib.homeHandle || !lib.profile || !me || !account.signedIn || lib.readOnly) return null;
    return { root: lib.homeHandle, pid: lib.profile.id, cid: s.meta.id, me, cloud: cloudFor(s.meta.id) };
  }
  async refreshList() {
    if (!account.signedIn) { this.list = []; return; }
    const r = await account.request<{ collections?: SharedInfo[] }>('GET', '/v1/shared').catch(() => null);
    this.list = Array.isArray(r?.collections) ? r.collections : [];
  }
  /** Shared collections of the account that this profile doesn't have yet. */
  missing() { const have = new Set(lib.profile?.collections.map(c => c.id) ?? []); return this.list.filter(c => !have.has(c.id)); }

  /** Sync the open shared collection now (one at a time; asked again while running: once more after). */
  sync(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    return (this.running = this.once().finally(() => { this.running = null; if (this.again) { this.again = false; void this.sync(); } }));
  }
  private async once() {
    const p = this.place(), s = lib.store;
    if (!p || !s) return;
    this.status = { ...this.status, busy: true, error: '' };
    try {
      await lib.flush();
      const r = await syncShared(p);
      if (lib.store !== s) return;
      if (r.changed.length) await s.reloadFiles(r.changed.filter(f => !f.startsWith('dupes/')));
      if (r.changed.some(f => f.startsWith('dupes/'))) void dupes.loadOthers();   // another computer's duplicates (ADR 0098)
      // Clashes wait for an answer (the box, ADR 0095), kept with the sync state until then.
      this.clashes = await waitingClashes(p);
      this.status = { busy: false, at: Date.now(), error: '' };
    } catch (e) { this.status = { ...this.status, busy: false, error: (e as Error).message }; }
  }

  /** Settle clashes (ADR 0095): this device's value, the other's (already in place), or both joined. */
  async resolve(cs: Clash[], how: 'mine' | 'theirs' | 'both') {
    const p = this.place(), s = lib.store;
    if (!p || !s || !cs.length) return;
    await lib.flush();
    for (const c of cs) {
      const both = how === 'both' ? mergeBoth(c.local, c.remote) : undefined;
      const keepRemote = how === 'theirs' || (how === 'both' && both === undefined);
      await resolveClash(p, c, how === 'mine' ? c.local : both, keepRemote);
    }
    await s.reloadFiles([...new Set(cs.map(c => c.file))]);
    this.clashes = await waitingClashes(p);
    await this.sync();
  }

  /** Make the open collection shared: its files into the shared form, then up to GLUE Cloud. */
  async share() {
    const s = lib.store, p = lib.profile, me = this.me();
    if (!s || !p || !lib.homeHandle || !me || s.shared) return;
    const name = account.devices.find(d => d.id === me)?.name ?? 'This computer';
    await account.request('POST', '/v1/shared', { json: { id: s.meta.id, name: s.meta.name } });
    // Closed first: a save still coming (the analysis of a song…) would write the old form over the new.
    await lib.closeCollection();
    try { await makeShared(lib.homeHandle, p.id, s.meta.id, me, { profile: p.id, name }); }
    finally { await lib.openCollection(s.meta.id); }   // reopened: seen through the shared form
    await this.sync();
    await this.refreshList();
    lib.notice = '“' + s.meta.name + '” is shared: your other devices can add it (the collection menu), and see the same songs and playlists.';
  }
  /** The shared collection the open one was merged with on other devices (ADR 0040), for moving into. */
  moveTarget(): SharedInfo | null {
    const s = lib.store, g = sync.localGroup;
    if (!s || s.shared || s.meta.movedTo || !g) return null;
    const theirs = new Set(g.members.filter(m => m.device !== this.me()).map(m => m.collection));
    return this.list.find(c => theirs.has(c.id)) ?? null;
  }
  /** Move the open collection into a shared one (ADR 0096): a backup first; the shared one here; this
      computer's songs, analyses, playlists and DJ libraries into it; the old one kept, no longer synced. */
  async moveInto(id: string) {
    const s = lib.store, p = lib.profile, me = this.me(), root = lib.homeHandle, c = this.list.find(x => x.id === id);
    if (!s || s.shared || !p || !me || !root || !lib.home || !c) return;
    const own = s.meta.id;
    await lib.closeCollection();   // nothing more written to it while it moves (and after)
    this.status = { ...this.status, busy: true, error: '' };
    try {
      await writeBlob(root, `backups/pre-shared-${new Date().toISOString().slice(0, 10)}-${own}.zip`, await buildBackup(root, p, { songs: false }));
      await lib.home.joinCollection(p, id, c.name);
      await syncShared({ root, pid: p.id, cid: id, me, cloud: cloudFor(id) });
      const name = account.devices.find(d => d.id === me)?.name ?? 'This computer';
      const st = await moveInto(root, p.id, own, id, me, { profile: p.id, name });
      // The old one stays in the GLUE folder (and in the backup), out of the list.
      p.collections = p.collections.filter(x => x.id !== own);
      p.lastCollection = id;
      await lib.home.saveProfile(p);
      lib.profile = { ...p };
      await lib.openCollection(id);
      lib.notice = 'Moved into “' + c.name + '”: ' + st.matched.toLocaleString() + ' songs were already there, ' + st.added.toLocaleString() + ' came in; '
        + (st.listsJoined + st.listsAdded).toLocaleString() + ' playlists and folders. A backup of the old one is in the GLUE folder’s backups.';
    } catch (e) { lib.notice = 'Couldn’t move it: ' + (e as Error).message; if (!lib.store) await lib.openCollection(own).catch(() => {}); }
    finally { this.status = { ...this.status, busy: false, at: Date.now() }; }
    await this.sync();
  }

  /** Add one of the account's shared collections to this profile, and open it. */
  async join(id: string) {
    const c = this.list.find(x => x.id === id), p = lib.profile, me = this.me();
    if (!c || !p || !lib.home || !lib.homeHandle || !me) return;
    await lib.home.joinCollection(p, id, c.name);
    lib.profile = { ...p };
    this.status = { ...this.status, busy: true };
    try { await syncShared({ root: lib.homeHandle, pid: p.id, cid: id, me, cloud: cloudFor(id) }); }
    finally { this.status = { ...this.status, busy: false, at: Date.now() }; }
    await lib.openCollection(id);
  }

  start() {
    clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.sync(), EVERY);
  }
}

export const shared = new Shared();
dupes.onPublished = () => void shared.sync();

// Opened as this computer; synced after saves, when another device pushed, and when it opens.
lib.loadOpts = () => ({ me: account.thisDevice, name: account.devices.find(d => d.id === account.thisDevice)?.name });
const prevFlushed = lib.onFlushed;
lib.onFlushed = pid => { prevFlushed?.(pid); if (lib.store?.shared) { clearTimeout(flushTimer); flushTimer = window.setTimeout(() => void shared.sync(), 1500); } };
let flushTimer = 0;
const prevOpened = lib.onCollectionOpened;
lib.onCollectionOpened = (pid, cid) => { prevOpened?.(pid, cid); shared.clashes = []; if (lib.store?.shared) void shared.sync(); };
account.onShared(m => { if (lib.store?.shared && lib.store.meta.id === m.collection && m.from !== account.thisDevice) void shared.sync(); if (!lib.profile?.collections.some(c => c.id === m.collection)) void shared.refreshList(); });
const prevSignedIn = account.onSignedIn;
account.onSignedIn = () => { prevSignedIn?.(); void shared.refreshList(); if (lib.store?.shared) void shared.sync(); };
if (typeof window !== 'undefined') shared.start();
