/* Cloud sync in this tab (ADR 0094, 0101): with cloud sync on, every collection is the account's, one copy
   in GLUE Cloud (store/shared/engine), synced after each save, when another device changed it (the
   signaling room says so), when it opens, and every couple of minutes.
   - A collection that isn't the account's yet becomes it when it opens (in place, keeping its id), or,
     when the account already has collections, a box asks once whether its songs go into one of them.
   - Adding one of the account's collections to this computer (the collection menu, or by itself on a
     device with no library of its own, lib/anywhere). */
import { untrack } from 'svelte';
import { account } from './account.svelte';
import { lib } from './library.svelte';
import { dupes } from './dupes.svelte';
import { makeShared, moveInto } from '../store/shared/seed';
import { buildBackup } from '../store/backup';
import { writeBlob } from '../store/fsx';
import { moveCaches } from '../store/shared/caches';
import { cacheDir } from '../platform';
import { resolveClash, syncShared, waitingClashes, type Place, type SharedCloud } from '../store/shared/engine';
import { mergeBoth, type Clash } from '../core/shared/merge3';

/** deleteAfter: cloud sync was turned off and its account copy goes then (ADR 0102). */
export interface SharedInfo { id: string; name: string; seq: number; stats: { tracks?: number } | null; updatedAt: number; deleteAfter?: number | null }
const EVERY = 120_000;

const holdsMusic = () => { const s = lib.store; if (!s) return false; for (const t of s.tracks.values()) if (!t.remote && t.status === 'linked') return true; return false; };
function cloudFor(cid: string): SharedCloud {
  const at = '/v1/shared/' + encodeURIComponent(cid);
  return {
    changes: since => account.request('GET', at + '/changes?since=' + since),
    bundle: paths => account.request<string>('POST', at + '/bundle', { json: { paths }, raw: true }),
    log: since => account.request('GET', at + '/log?since=' + since),
    // "music": this computer has songs of its own, so the sign-in is one of the account's devices (ADR 0091).
    append: (b, paths, data) => account.request('POST', at + '/append' + (holdsMusic() ? '?music=1' : ''), { text: b + '\t' + JSON.stringify(paths) + '\n' + data }),
    touched: to => account.request('GET', at + '/touched?to=' + to),
    checkpoint: (on, body, done) => account.request('POST', at + '/checkpoint?at=' + on + (done ? '&done=1' : ''), { text: body }),
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
    // Cloud sync off for the profile: its collections stay here as they are, and aren't synced (ADR 0102).
    // GLUE Home's engine is the writer here (ADR 0104): it syncs, not this tab.
    if (lib.analysisElsewhere?.active()) return null;
    if (!s?.shared || !lib.homeHandle || !lib.profile || lib.profile.cloudSync === false || !me || !account.signedIn || lib.readOnly) return null;
    return { root: lib.homeHandle, pid: lib.profile.id, cid: s.meta.id, me, cloud: cloudFor(s.meta.id) };
  }
  /** The account's collections, asked for again (one request at a time). Known once GLUE Cloud answered. */
  refreshList(): Promise<void> {
    if (!account.signedIn) { this.list = []; this.listed = false; return Promise.resolve(); }
    return (this.listing ??= (async () => {
      const r = await account.request<{ collections?: SharedInfo[] }>('GET', '/v1/shared').catch(() => null);
      if (!account.signedIn) return;
      this.list = Array.isArray(r?.collections) ? r.collections : [];
      this.listed = !!r;
    })().finally(() => { this.listing = null; }));
  }
  private listing: Promise<void> | null = null;
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
  async share(quiet = false) {
    const s = lib.store, p = lib.profile, me = this.me();
    if (!s || !p || !lib.homeHandle || !me || s.shared || this.sharing) return;
    this.sharing = true;
    try {
    const name = account.devices.find(d => d.id === me)?.name ?? 'This computer';
    // GLUE Cloud keeps it first (and says so): until then, nothing here changes.
    const made = await account.request<{ id?: string }>('POST', '/v1/shared', { json: { id: s.meta.id, name: s.meta.name } });
    if (made?.id !== s.meta.id) throw new Error('GLUE Cloud didn’t keep it');
    // Closed first: a save still coming (the analysis of a song…) would write the old form over the new.
    await lib.closeCollection();
    try { await makeShared(lib.homeHandle, p.id, s.meta.id, me, { profile: p.id, name }); }
    finally { await lib.openCollection(s.meta.id); }   // reopened: seen through the shared form
    await this.sync();
    await this.refreshList();
    if (!quiet) lib.notice = '“' + s.meta.name + '” is in your account now: every device you sign in to sees the same songs and playlists.';
    } catch (e) {
      const msg = 'Couldn’t sync “' + s.meta.name + '” with your account: ' + (e as Error).message;
      if (quiet) this.status = { ...this.status, error: msg }; else lib.notice = msg;
    }
    finally { this.sharing = false; }
  }
  private sharing = false;
  /** The question for the open collection (the join box): this computer's collection, and the account's
      it could go into (the one with the same name first, then the biggest). */
  ask = $state<{ collection: string; name: string; tracks: number; into: SharedInfo[] } | null>(null);
  private listed = false;
  private notNow = new Set<string>();
  /** Set while lib/anywhere adds the account's collections itself. */
  hold = false;

  /** With cloud sync on, the open collection is the account's (ADR 0101): made so when it isn't. */
  async ensure() {
    if (this.ensuring) return;
    this.ensuring = true;
    try { await this.ensureOnce(); } finally { this.ensuring = false; }
  }
  private ensuring = false;
  private async ensureOnce() {
    const s = lib.store, p = lib.profile;
    if (this.hold) return;
    if (!s || !p || s.shared || s.meta.movedTo || lib.readOnly || !account.signedIn || p.cloudSync === false || !lib.homeHandle || !this.me()) { if (!s?.shared) this.ask = null; return; }
    // What the account has, as GLUE Cloud says (never guessed from a list not loaded yet).
    if (this.listing || !this.listed) await this.refreshList();
    if (!this.listed) return;
    if (lib.store !== s || s.shared) return;
    const here = new Set(p.collections.map(c => c.id));
    if (this.list.some(c => c.id === s.meta.id)) { await this.share(true); return; }   // the account's already (its files come back in)
    const into = this.list.filter(c => !here.has(c.id));
    const empty = !s.tracks.size && !s.lists.size;
    if (!into.length) { await this.share(true); return; }
    const name = s.meta.name.trim().toLowerCase();
    const order = [...into].sort((a, b) => Number(b.name.trim().toLowerCase() === name) - Number(a.name.trim().toLowerCase() === name) || (b.stats?.tracks ?? 0) - (a.stats?.tracks ?? 0));
    // Nothing of its own yet (a new profile): it just becomes the account's collection.
    if (empty) { await this.moveInto(order[0].id, { quiet: true }); return; }
    if (this.notNow.has(s.meta.id)) return;
    this.ask = { collection: s.meta.id, name: s.meta.name, tracks: s.tracks.size, into: order };
  }
  /** The join box's answer: into one of the account's collections, a collection of its own, or later. */
  async answer(how: 'into' | 'own' | 'later', into?: string) {
    const a = this.ask;
    this.ask = null;
    if (!a || lib.store?.meta.id !== a.collection) return;
    if (how === 'later') { this.notNow.add(a.collection); return; }
    if (how === 'own') await this.share();
    else if (into) await this.moveInto(into);
  }
  /** Move the open collection into a shared one (ADR 0096): a backup first; the shared one here; this
      computer's songs, analyses, playlists and DJ libraries into it; the old one kept, no longer synced. */
  async moveInto(id: string, opts: { quiet?: boolean } = {}) {
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
      // Its waveforms, analyses, fingerprints and covers come along (in the background: thousands of files).
      void cacheDir().then(d => d && moveCaches(d, own, id, st.ids)).then(() => { lib.version++; }).catch(e => console.warn('GLUE: the caches didn’t follow the collection', e));
      if (!opts.quiet) lib.notice = 'Put into “' + c.name + '”: ' + st.matched.toLocaleString() + ' songs were already there, ' + st.added.toLocaleString() + ' came in; '
        + (st.listsJoined + st.listsAdded).toLocaleString() + ' playlists and folders. A backup of the old one is in the GLUE folder’s backups.';
    } catch (e) { lib.notice = 'Couldn’t move it: ' + (e as Error).message; if (!lib.store) await lib.openCollection(own).catch(() => {}); }
    finally { this.status = { ...this.status, busy: false, at: Date.now() }; }
    await this.sync();
  }

  /** Cloud sync turned off (or on again) for a profile (ADR 0102): its collections in the account are kept, or
      go in 30 days (`remove`); turning it on again cancels that. */
  async setSync(pid: string, on: boolean, remove = false) {
    await lib.setProfileSync(pid, on);
    if (!account.signedIn) return;
    const p = lib.profile?.id === pid ? lib.profile : await lib.profileInfo(pid);
    const mine = new Set(p?.collections.map(c => c.id) ?? []);
    for (const c of this.list) if (mine.has(c.id) && (on || remove || c.deleteAfter)) await account.request('POST', '/v1/shared/' + encodeURIComponent(c.id) + '/leave', { json: { remove: !on && remove } }).catch(() => {});
    await this.refreshList();
    if (on) void this.ensure();
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
lib.onCollectionOpened = (pid, cid) => { prevOpened?.(pid, cid); shared.clashes = []; shared.ask = null; if (lib.store?.shared) void shared.sync(); else void shared.ensure(); };
account.onShared(m => { if (lib.store?.shared && lib.store.meta.id === m.collection && m.from !== account.thisDevice) void shared.sync(); if (!lib.profile?.collections.some(c => c.id === m.collection)) void shared.refreshList(); });
const prevSignedIn = account.onSignedIn;
account.onSignedIn = () => { prevSignedIn?.(); void shared.refreshList().then(() => lib.store?.shared ? shared.sync() : shared.ensure()); };
if (typeof window !== 'undefined') {
  shared.start();
  // Whenever what it depends on arrives (signed in, this device known, a collection open), in any order.
  $effect.root(() => { $effect(() => { void account.signedIn; void account.thisDevice; void lib.profile?.cloudSync; const s = lib.store; if (s && !s.shared) untrack(() => void shared.ensure()); }); });
}
