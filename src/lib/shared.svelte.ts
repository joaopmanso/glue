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
import { cacheDir, homeMode } from '../platform';
import { localHome } from './localHome.svelte';
import { engineClient } from './engine.svelte';
import { resolveClash, syncShared, waitingClashes, type Place, type SharedCloud, type SyncResult } from '../store/shared/engine';
import { mergeBoth, type Clash } from '../core/shared/merge3';
import { countsOf, holdsMusic as aComputer, sendCounts } from '../core/shared/counts';
import { forgetDeleted } from '../store/shared/forget';
import type { CollectionStore } from '../store/collection';

/** This computer's other devices (ADR 0162): its GLUE Home, and this browser's sign-in when it isn't the computer's. */
function ownDevices(me: string): string[] {
  const out = account.devices.filter(d => d.kind === 'home' && d.companionOf === me).map(d => d.id);
  if (account.thisDevice && account.thisDevice !== me) out.push(account.thisDevice);
  return out;
}
/** A computer's numbers for a collection (ADR 0112): its songs and when it said so, and its last change. */
export interface ComputerStats { songs?: number; at?: number; changed?: number }
/** deleteAfter: cloud sync was turned off and its account copy goes then (ADR 0102). */
export interface SharedInfo { id: string; name: string; seq: number; stats: { tracks?: number; by?: Record<string, ComputerStats> } | null; updatedAt: number; deleteAfter?: number | null }
const at = (cid: string) => '/v1/shared/' + encodeURIComponent(cid);
const GONE = /deleted from your account/;
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
  /** `took`: where the last sync's time went (the chip's tooltip; the console when it was slow). */
  status = $state<{ busy: boolean; at: number | null; error: string; took?: string }>({ busy: false, at: null, error: '' });
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
    if (lib.homeRuns()) return null;
    if (!s?.shared || !lib.homeHandle || !lib.profile || lib.profile.cloudSync === false || !me || !account.signedIn || lib.readOnly) return null;
    return { root: lib.homeHandle, pid: lib.profile.id, cid: s.meta.id, me, cloud: cloudFor(s.meta.id), own: ownDevices(me) };
  }
  /** The account's collections, asked for again (one request at a time). Known once GLUE Cloud answered. */
  refreshList(): Promise<void> {
    if (!account.signedIn) { this.list = []; this.listed = false; return Promise.resolve(); }
    return (this.listing ??= (async () => {
      const r = await account.request<{ collections?: SharedInfo[]; gone?: string[] }>('GET', '/v1/shared').catch(() => null);
      if (!account.signedIn) return;
      this.list = Array.isArray(r?.collections) ? r.collections : [];
      this.listed = !!r;
      if (r) { await this.forgetGone(Array.isArray(r.gone) ? r.gone : []); await this.adoptNames(); }
    })().finally(() => { this.listing = null; }));
  }
  private listing: Promise<void> | null = null;

  /** Deleted from the account on some device (ADR 0112): each of this GLUE folder's profiles that has it keeps
      a backup, then forgets it (its files stay in the GLUE folder). */
  private async forgetGone(gone: string[]) {
    const home = lib.home;
    if (!gone.length || !home || lib.readOnly) return;
    const ids = new Set(gone);
    for (const ref of home.index.profiles) {
      const p = lib.profile?.id === ref.id ? lib.profile : await home.loadProfile(ref.id).catch(() => null);
      for (const c of p?.collections.filter(x => ids.has(x.id)) ?? []) {
        const open = lib.store?.meta.id === c.id && lib.profile?.id === ref.id;
        if (open) await lib.closeCollection();
        const done = await forgetDeleted(home, ref.id, c.id).catch(e => { console.warn('GLUE: couldn’t forget a deleted collection', e); return false; });
        if (lib.profile?.id !== ref.id) continue;
        lib.profile = await home.loadProfile(ref.id);
        if (done) lib.notice = '“' + c.name + '” was deleted from your account. A backup of it is in the GLUE folder’s backups.';
        if (open || !lib.store) { if (lib.profile.collections[0]) await lib.openCollection(lib.profile.lastCollection ?? lib.profile.collections[0].id); else lib.phase = 'collections'; }
      }
    }
  }
  /** Renamed on another device: the name here follows (the account's name is the collection's, ADR 0112). */
  private async adoptNames() {
    const p = lib.profile, home = lib.home;
    if (!p || !home || lib.readOnly) return;
    let changed = false;
    for (const ref of p.collections) {
      const c = this.list.find(x => x.id === ref.id);
      if (!c || c.name === ref.name) continue;
      if (lib.store?.meta.id === ref.id && lib.store.shared) { await lib.renameCollection(c.name); continue; }
      ref.name = c.name; changed = true;
    }
    if (changed) { await home.saveProfile(p); lib.profile = { ...p }; }
  }
  /** A new name, for every device: GLUE Cloud's first, then the collection's own. */
  async rename(id: string, name: string) {
    name = name.trim();
    if (!name) return;
    await account.request('PATCH', at(id), { json: { name } });
    this.list = this.list.map(c => c.id === id ? { ...c, name } : c);
    await this.adoptNames();
  }
  /** One computer's line off a collection's list (the user's ×). */
  async forgetComputer(id: string, computer: string) {
    await account.request('DELETE', at(id) + '/stats/' + encodeURIComponent(computer));
    await this.refreshList();
  }
  /** Deleted for every device (ADR 0112): here too, after a backup. */
  async remove(id: string) {
    await account.request('DELETE', at(id));
    await this.refreshList();
  }
  /** This computer's numbers for the collection, to GLUE Cloud when they changed (the account's list shows them). */
  private counted = new Map<string, { key: string; at: number }>();
  private sendCounts(s: CollectionStore) {
    const c = countsOf(s.tracks.values()), cid = s.meta.id;
    if (aComputer(c, s.meta.roots.length) && sendCounts(this.counted, cid, c)) void account.request('POST', at(cid) + '/stats', { json: c }).then(() => this.refreshList(), () => { this.counted.delete(cid); });   // the lists show them
  }
  /** Files the open collection's store wrote since the last sync, and when every file was last looked at. */
  written = new Set<string>();
  lookedAt = 0;
  /** Shared collections of the account that this profile doesn't have yet. */
  missing() { const have = new Set(lib.profile?.collections.map(c => c.id) ?? []); return this.list.filter(c => !have.has(c.id)); }

  /** Sync the open shared collection now (one at a time; asked again while running: once more after). */
  sync(full = false): Promise<void> {
    if (full) this.lookedAt = 0;
    if (this.running) { this.again = true; return this.running; }
    return (this.running = this.once().finally(() => { this.running = null; if (this.again) { this.again = false; void this.sync(); } }));
  }
  private async once() {
    const p = this.place(), s = lib.store;
    if (!p || !s) return;
    this.status = { ...this.status, busy: true, error: '' };
    const t0 = performance.now(), row = t0 - this.ended < 2000 ? ++this.row : (this.row = 1);
    let t1 = t0, t2 = t0, t3 = t0, ms: SyncResult['ms'] | undefined;
    try {
      await lib.flush();
      t1 = performance.now();
      // Only the files this tab's store wrote since the last sync are looked at (every one now and then, ADR 0107).
      const full = Date.now() - this.lookedAt > 30 * 60e3, hint = full ? undefined : [...this.written];
      if (full) this.lookedAt = Date.now();
      this.written.clear();
      // What the sync wrote here, as it writes it: into the open collection even when the sync fails partway or the
      // collection was opened again meanwhile. Both left the laptop without the desktop's 9,807 new songs until the
      // collection was opened again (2026-10-02, ADR 0143).
      const got: string[] = [];
      try {
        try { ms = (await syncShared(p, hint, got)).ms; } catch (e) { if (hint) for (const x of hint) this.written.add(x); else this.lookedAt = 0; throw e; }
      } finally { t2 = performance.now(); await this.takeIn(s.meta.id, got); t3 = performance.now(); }
      const now = lib.store;
      if (!now || now.meta.id !== s.meta.id) return;
      // Clashes wait for an answer (the box, ADR 0095), kept with the sync state until then.
      this.clashes = await waitingClashes(p);
      this.sendCounts(now);
      const sec = (x: number) => (x / 1000).toFixed(1) + ' s', all = performance.now() - t0;
      const took = sec(all) + ': saving ' + sec(t1 - t0) + ' · from GLUE Cloud ' + sec(ms?.pull ?? 0) + ' · to it ' + sec(ms?.push ?? 0)
        + ' · reading ' + new Set(got).size + ' files ' + sec(t3 - t2) + ' · the rest ' + sec(all - (t3 - t0)) + (full ? ' (every file)' : '') + (row > 1 ? ' · ' + row + ' syncs in a row' : '');
      if (all > 2000) console.info('GLUE: the sync took ' + took);
      this.status = { busy: false, at: Date.now(), error: '', took };
    } catch (e) {
      this.status = { ...this.status, busy: false, error: (e as Error).message };
      if (GONE.test((e as Error).message)) void this.refreshList();   // deleted on another device: forgotten here
    } finally { this.ended = performance.now(); }
  }
  /** Syncs one after the other (within 2 s): "Syncing…" all along, though each was quick. */
  private ended = -1e9;
  private row = 0;

  /** Files a sync wrote, read again by the open collection if it's that one (ADR 0143). */
  private async takeIn(cid: string, files: string[]) {
    const s = lib.store, all = [...new Set(files)];
    if (!s || s.meta.id !== cid || !all.length) return;
    const mine = all.filter(f => !f.startsWith('dupes/'));
    if (mine.length) await s.reloadFiles(mine);
    if (mine.length < all.length) void dupes.loadOthers();   // another computer's duplicates (ADR 0098)
  }

  /** With GLUE Home, the clashes its syncs left (ADR 0162): asked for when it says something changed. */
  async homeClashes() {
    const s = lib.store;
    if (!lib.homeRuns() || !s?.shared) return;
    const got = await engineClient.clashes().catch(() => null);
    if (got && lib.store === s) this.clashes = got;
  }
  /** Settle clashes (ADR 0095): this device's value, the other's (already in place), or both joined. */
  async resolve(cs: Clash[], how: 'mine' | 'theirs' | 'both') {
    const answer = (c: Clash) => { const both = how === 'both' ? mergeBoth(c.local, c.remote) : undefined; return { value: how === 'mine' ? c.local : both, keepRemote: how === 'theirs' || (how === 'both' && both === undefined) }; };
    // With GLUE Home, it syncs: it settles them, and the file comes back through its feed (ADR 0162).
    if (lib.homeRuns()) {
      for (const c of cs) { const a = answer(c); await engineClient.resolveClash(c, a.value, a.keepRemote); }
      this.clashes = await engineClient.clashes().catch(() => this.clashes.filter(x => !cs.includes(x)));
      return;
    }
    const p = this.place(), s = lib.store;
    if (!p || !s || !cs.length) return;
    await lib.flush();
    for (const c of cs) {
      const a = answer(c);
      await resolveClash(p, c, a.value, a.keepRemote);
      this.written.add(c.file);   // written around the store: the next sync looks at it
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
    // The account's first collection, or one made on purpose ("New collection…"): the account's own (ADR 0112).
    if (!this.list.length || lib.madeOnPurpose.has(s.meta.id)) { await this.share(true); return; }
    // Otherwise never a second one quietly: the account's missing here first, else any of them.
    const into = this.list.filter(c => !here.has(c.id)), pool = into.length ? into : this.list;
    const empty = !s.tracks.size && !s.lists.size;
    const name = s.meta.name.trim().toLowerCase();
    const order = [...pool].sort((a, b) => Number(b.name.trim().toLowerCase() === name) - Number(a.name.trim().toLowerCase() === name) || (b.stats?.tracks ?? 0) - (a.stats?.tracks ?? 0));
    // Nothing of its own yet (a new profile): it just takes the account's collection.
    if (empty && into.length) { await this.moveInto(order[0].id, { quiet: true }); return; }
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
      await syncShared({ root, pid: p.id, cid: id, me, cloud: cloudFor(id) });
      const name = account.devices.find(d => d.id === me)?.name ?? 'This computer';
      const st = await moveInto(root, p.id, own, id, me, { profile: p.id, name });
      // Joined only now it worked (ADR 0112): a failure leaves the profile as it was. The old one stays in the GLUE
      // folder (and in the backup), out of the list.
      p.collections = p.collections.filter(x => x.id !== own);
      await lib.home.joinCollection(p, id, c.name);
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

/** Delete one of the account's collections for every device, once its name is typed (ADR 0112). */
export async function askDeleteShared(id: string, name: string) {
  const typed = prompt('Delete “' + name + '” from your account? Every device keeps a backup of it, then forgets it. Your music files aren’t touched.\n\nType its name to delete it:');
  if (typed === null) return;
  if (typed.trim() !== name.trim()) { lib.notice = 'Not deleted: the name didn’t match.'; return; }
  try { await shared.remove(id); }
  catch (e) { lib.notice = 'Couldn’t delete “' + name + '”: ' + (e as Error).message; }
}
// The duplicates are written around the store: every file is looked at.
dupes.onPublished = () => void shared.sync(true);
engineClient.onFeed.push(() => void shared.homeClashes());

// Opened as this computer; synced after saves, when another device pushed, and when it opens.
/** Which computer a shared collection is seen as here (ADR 0108): GLUE Home's, where it's the library's engine;
    else this browser's device; else the one this GLUE folder remembers. Said by GLUE Home or a sign-in, it's
    remembered in the GLUE folder. None: the collection is read, and nothing is written for this computer. */
lib.loadOpts = async () => {
  const home = homeMode() && localHome.link ? await engineClient.computer().catch(() => null) : null;
  const me = home ?? account.thisDevice ?? lib.home?.index.computer ?? null;
  if ((home ?? account.thisDevice) && me && !lib.readOnly) await lib.home?.rememberComputer(me).catch(() => {});
  return { me, name: account.devices.find(d => d.id === me)?.name };
};
const prevFlushed = lib.onFlushed;
lib.onFlushed = pid => { prevFlushed?.(pid); if (lib.store?.shared) { clearTimeout(flushTimer); flushTimer = window.setTimeout(() => void shared.sync(), 1500); } };
let flushTimer = 0;
const prevOpened = lib.onCollectionOpened;
lib.onCollectionOpened = (pid, cid) => {
  prevOpened?.(pid, cid); shared.clashes = []; shared.ask = null;
  // What its store writes is what the next sync looks at; the first one looks at everything.
  const s = lib.store;
  shared.written.clear(); shared.lookedAt = 0;
  if (s) { const prev = s.onWrote; s.onWrote = paths => { prev?.(paths); if (lib.store === s) for (const x of paths) shared.written.add(x); }; }
  if (lib.store?.shared) void shared.sync(); else void shared.ensure();
};
account.onShared(m => { if (m.gone) { void shared.refreshList(); return; } if (lib.store?.shared && lib.store.meta.id === m.collection && m.from !== account.thisDevice) void shared.sync(); if (!lib.profile?.collections.some(c => c.id === m.collection)) void shared.refreshList(); });
const prevSignedIn = account.onSignedIn;
account.onSignedIn = () => { prevSignedIn?.(); void shared.refreshList().then(() => lib.store?.shared ? shared.sync() : shared.ensure()); };
if (typeof window !== 'undefined') {
  shared.start();
  // Whenever what it depends on arrives (signed in, this device known, a collection open), in any order.
  $effect.root(() => { $effect(() => { void account.signedIn; void account.thisDevice; void lib.profile?.cloudSync; const s = lib.store; if (s && !s.shared) untrack(() => void shared.ensure()); }); });
}
