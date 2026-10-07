/* Collections: opening, closing, saving; songs shown but not saved (TO BE SORTED).
   Part of `lib` (src/lib/library.svelte.ts): its methods, `this` being the library. */
import { record } from '../../core/perf';
import { CollectionStore } from '../../store/collection';
import { tidyTracks } from '../../store/merge';
import type { AnalysisSummary, List, Track } from '../../store/types';
import { autoBackup } from '../../store/backup';
import type { Library } from '../library.svelte';

export const collections = {
  group(this: Library, key: string) { let g = this.groups.get(key); if (!g) this.groups.set(key, g = new Set()); return g; },
  dropGroup(this: Library, key: string) {
    const s = this.store, g = this.groups.get(key);
    if (!s || !g) return;
    s.dropShown(g);
    g.clear();
  },
  /** Show tracks and lists that aren't this collection's own (never saved). */
  showGroup(this: Library, key: string, tracks: Track[], lists: List[], analysis?: Map<string, AnalysisSummary>) {
    const s = this.store;
    if (!s) return;
    this.dropGroup(key);
    const g = this.group(key);
    for (const t of tracks) g.add(t.id);
    for (const l of lists) g.add(l.id);
    s.putShown(tracks, lists, analysis);
    this.version++;
  },
  /** This device's own tracks and playlists (without other devices' ones). */
  ownTracks(this: Library): Track[] { const s = this.store; return s ? [...s.tracks.values()].filter(t => !s.ephemeral.has(t.id)) : []; },

  /** `own`: made on purpose ("New collection…"): with cloud sync, the account's own new collection, never put
      into another one (ADR 0112). */
  async createCollection(this: Library, name: string, own = false) {
    if (!this.home || !this.profile) return;
    const c = await this.home.createCollection(this.profile, name);
    if (own) this.madeOnPurpose.add(c.id);
    this.profile = { ...this.profile };
    await this.openCollection(c.id);
  },
  async openCollection(this: Library, cid: string) {
    if (!this.home || !this.profile || !this.homeDir) return;
    await this.closeCollection();
    const t0 = performance.now();
    const s = await CollectionStore.load(this.homeDir, this.profile.id, cid, await this.loadOpts?.() ?? {});
    s.onChange = () => { this.version++; };
    // A sync brought files in (a shared collection, ADR 0094): redraw, nothing to save or send.
    // A sync brought songs: one another computer has may be one this computer has too (ADR 0130).
    s.onReloaded = () => { this.version++; void this.joinCopies(); };
    s.onDirty = () => this.scheduleFlush();
    this.store = s;
    if (this.profile.lastCollection !== cid) { this.profile = { ...this.profile, lastCollection: cid }; await this.home.saveProfile(this.profile); }
    this.found = [];
    this.analysis = { ...this.analysis, paused: s.meta.autoAnalyse === false };
    if (s.damaged.length) this.notice = 'Some files in your GLUE folder couldn’t be read and were set aside (' + s.damaged.join(', ') + ', saved as .damaged). Anything they held may need re-importing or re-scanning.';
    await this.loadRoots();
    // Tracks naming imports that are gone, and tracks without a file whose file is here after all
    // (music folders' places known by now).
    // With GLUE Home, it's the app (ADR 0162): none of this here.
    if (!this.readOnly && !this.homeRuns()) { const t = tidyTracks(s); if (t.dropped || t.relinked) console.info('Tidied: ' + t.dropped + ' leftover tracks of removed imports, ' + t.relinked + ' tracks linked to their file'); }
    await this.joinCopies();
    await this.loadLoose();
    await this.adoptIncoming();
    this.onQueue?.(cid);
    this.phase = 'library';
    this.version++;
    record('open.collection', performance.now() - t0);
    this.enqueueAll();
    void this.writeInfo();
    this.onOpened?.();
    this.onCollectionOpened?.(this.profile.id, cid);
    // The day's backup of this profile, a little after it opens (ADR 0090).
    const pid = this.profile.id;
    setTimeout(() => { const d = this.homeDir, p = this.profile; if (d && p?.id === pid && !this.readOnly && !this.homeRuns()) void autoBackup(d, p).catch(e => console.warn('GLUE: the daily backup failed', e)); }, 20_000);
    void this.detectLibraries();
    if (!this.homeRuns()) void this.recheckVerdicts();
  },
  async renameCollection(this: Library, name: string) {
    const s = this.store;
    if (!s || !this.home || !this.profile || !name.trim()) return;
    s.meta.name = name.trim(); s.saveMeta();
    const ref = this.profile.collections.find(c => c.id === s.meta.id);
    if (ref) { ref.name = s.meta.name; this.profile = { ...this.profile }; await this.home.saveProfile(this.profile); }
  },
  async deleteCollection(this: Library, cid: string) {
    if (!this.home || !this.profile) return;
    if (this.store?.meta.id === cid) { await this.closeCollection(); }
    await this.home.deleteCollection(this.profile, cid);
    this.profile = { ...this.profile };
    if (this.profile.collections[0]) await this.openCollection(this.profile.collections[0].id);
    else this.phase = 'collections';
  },
  /** Closed: saved, analysis stopped, nothing more written for it (before its files change under it). */
  async closeCollection(this: Library) {
    if (this.store) this.onCollectionClosing?.();
    this.stopAnalysis();
    // Until nothing is left: what's marked while a save runs (the analysis's last song…) is saved by the
    // next one, and after this there's no next one for this store.
    for (let i = 0; i < 5 && this.store?.hasPending && !this.readOnly; i++) await this.flush();
    await this.beforeClose?.().catch(() => {});   // GLUE Home's engine has every change made here (ADR 0104)
    this.store = null; this.roots = []; this.groups.clear();
    this.looseHandles.clear(); this.looseGranted = new Set();
  },

  scheduleFlush(this: Library) {
    if (this.readOnly) return;
    this.unsaved = true;
    clearTimeout(this.flushTimer);
    // A pause of 0.8 s, but never put off more than 3 s: a stream of changes (the analysis) mustn't
    // keep new songs unsaved.
    const now = Date.now();
    this.unsavedSince ||= now;
    this.flushTimer = window.setTimeout(() => void this.flush(), Math.max(0, Math.min(800, this.unsavedSince + 3000 - now)));
  },
  async flush(this: Library) {
    const s = this.store;
    if (!s || this.readOnly || !s.hasPending) { this.unsaved = false; this.unsavedSince = 0; return; }
    clearTimeout(this.flushTimer);
    this.unsavedSince = 0;
    this.saving = true;
    try { await s.flush(); this.saveError = ''; if (this.profile) this.onFlushed?.(this.profile.id); }
    catch (e) {
      // Opened as this computer's own while it became shared (store.outdated): opened again, in the shared form.
      if ((e as Error).name === 'OutdatedStore') { if (this.store === s) void this.openCollection(s.meta.id); return; }
      console.error(e);
      // Say it once (the save is retried quietly), and again only if the problem changes.
      const msg = 'Couldn’t save some changes to your GLUE folder: ' + ((e as Error).message || e) + ' GLUE keeps retrying.';
      if (msg !== this.saveError) { this.saveError = msg; this.notice = msg; }
    }
    finally { this.saving = false; this.unsaved = s.hasPending; if (s.hasPending) this.scheduleFlush(); }
  },
};
