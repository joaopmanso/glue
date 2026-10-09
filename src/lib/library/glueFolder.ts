/* The GLUE folder: choosing and opening it, GLUE Home's disk and back (ADR 0051), the one tab that writes.
   Part of `lib` (src/lib/library.svelte.ts): its methods, `this` being the library. */
import { HomeStore } from '../../store/home';
import { themes } from '../themes.svelte';
import * as platform from '../../platform';
import type { Library } from '../library.svelte';

export const glueFolder = {

  async boot(this: Library) {
    try {
      this.loadStep('Finding your GLUE folder…', 'Opening your library');
      const h = await platform.restoreHome();
      if (!h) { this.phase = 'welcome'; return; }
      this.homeKind = h.kind; this.homeName = h.dir.name;
      if (!h.granted) { this.homeDir = h.dir; this.phase = 'reconnect'; return; }
      await this.openHome(h.dir, h.kind);
    } catch (e) { this.fail(e); }
    finally { if (!this.loading?.cid) this.loading = null; }
  },
  async chooseHome(this: Library) {
    try { await this.openHome(await platform.pickHome(), 'folder'); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') this.fail(e); }
  },
  /** Step 1 of the first run: pick a folder and say what's in it, without using it yet. */
  async pickHomeFolder(this: Library): Promise<{ dir: FileSystemDirectoryHandle; look: platform.FolderLook } | null> {
    try { const dir = await platform.pickHome(); return { dir, look: await platform.lookInto(dir) }; }
    catch (e) { if ((e as DOMException).name !== 'AbortError') this.fail(e); return null; }
  },
  async useHome(this: Library, dir: FileSystemDirectoryHandle) {
    try { await platform.rememberHome(dir); await this.openHome(dir, 'folder'); } catch (e) { this.fail(e); }
  },
  async usePrivateHome(this: Library) { try { await this.openHome(await platform.privateHome(), 'private'); } catch (e) { this.fail(e); } },
  async reconnect(this: Library) {
    if (!this.homeDir) return this.chooseHome();
    if (await platform.permission(this.homeDir, 'readwrite', true)) await this.openHome(this.homeDir, 'folder');
  },
  async changeHome(this: Library) {
    await this.closeCollection();
    this.home = null; this.profile = null;
    await platform.forgetHome();
    this.phase = 'welcome';
  },
  async openHome(this: Library, dir: FileSystemDirectoryHandle, kind: 'folder' | 'private') {
    this.homeDir = dir; this.homeKind = kind; this.homeName = kind === 'private' ? 'browser storage' : dir.name;
    await this.takeLock();
    this.loadStep('Reading your profile…');
    this.home = await HomeStore.open(dir);
    // The newer look wins: the GLUE folder's (another computer chose it) or this browser's (chosen here, perhaps just
    // before a reload, while the folder's copy was still being saved: the mode came back, 2026-10-01).
    const look = this.home.index.appearance;
    if (look && (look.theme !== themes.theme || look.mode !== themes.mode)) {
      if ((look.at ?? 0) >= themes.at) themes.adopt(look.theme, look.mode, look.at ?? 0);
      else if (!this.readOnly) void this.home.setAppearance({ theme: themes.theme, mode: themes.mode, at: themes.at });
    }
    themes.onChange = (theme, mode, at) => { if (!this.readOnly) void this.home?.setAppearance({ theme, mode, at }); };
    if (this.pendingRestore) { const b = this.pendingRestore; this.pendingRestore = null; await this.applyBackup(b, true); return; }
    // Profiles are aliases now (ADR 0113): made from the profiles there were, once; nothing moves on disk.
    await this.home.ensureAliases(!this.readOnly);
    const ix = this.home.index;
    if (ix.lastAlias && this.home.aliases.some(a => a.id === ix.lastAlias) && this.hasLibrary()) await this.useAlias(ix.lastAlias);
    else this.phase = 'profiles';
  },
  /** GLUE Home stopped: carry on with the browser's own handles, the library staying open. Callers at the same time
      share one switch. */
  leaveHomeMode(this: Library) { return (this.leaving ??= this.leaveOnce().finally(() => { this.leaving = null; })); },
  async leaveOnce(this: Library) {
    if (!this.onHome) return;
    platform.leaveHome();
    const b = await platform.browserHome();
    if (!b) { this.homeLost = 'no-folder'; return; }
    if (!b.granted) { this.homeLost = 'needs-access'; return; }
    await this.useDisk(b.dir);
  },
  /** The click that lets the browser use its own GLUE folder again (while GLUE Home is stopped). */
  async allowBrowserFolder(this: Library) {
    const b = await platform.browserHome();
    if (b && await platform.permission(b.dir, 'readwrite', true)) await this.useDisk(b.dir);
  },
  /** GLUE Home is back: onto its disk again, if it has this library's GLUE folder. */
  async enterHomeMode(this: Library) {
    if (this.onHome || this.switching) return;
    // Nothing open yet (the start page), or this browser's own storage: GLUE Home's GLUE folder is this computer's
    // library (ADR 0108, 0115), whatever the browser. It opens instead; the browser's copy stays, unused.
    if (!this.home ? this.phase === 'welcome' : this.homeKind === 'private') {
      this.switching = true;
      try { await this.closeCollection(); this.home = null; this.profile = null; this.alias = null; await this.boot(); }
      finally { this.switching = false; }
      return;
    }
    if (!this.home) return;
    const dir = await platform.homeDirFor(this.homeLost ? null : this.homeDir);
    if (!dir) return;
    // What was saved while GLUE Home was away is on disk first.
    if (!this.homeLost) await this.flush();
    await this.useDisk(dir);
  },
  /** Move the open library onto another disk: the same folder, reached another way. Unsaved changes
      are written there; music folders and the incoming folder are looked up again. */
  async useDisk(this: Library, dir: FileSystemDirectoryHandle) {
    const home = this.home;
    if (!home) return;
    this.switching = true;
    try {
      this.homeDir = dir; home.root = dir; this.homeName = dir.name; this.homeLost = '';
      const s = this.store;
      if (s) {
        s.root = dir;
        this.stopAnalysis();
        await this.loadRoots();
        await this.adoptIncoming();
        this.version++;
        this.scheduleFlush();
        this.enqueueAll();
        void this.writeInfo();
      }
    } finally { this.switching = false; }
  },
  /** Only one tab writes to the GLUE folder; others open read-only. */
  async takeLock(this: Library) {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) return;
    await new Promise<void>(resolve => {
      void locks.request('mco-writer', { ifAvailable: true }, lock => {
        this.readOnly = !lock;
        resolve();
        // Held for the life of the tab, unless it hands the library to another tab (lib/tabs).
        return lock ? new Promise<void>(r => { this.unlock = r; }) : undefined;
      });
    });
  },
  /** Another GLUE tab takes over: stop, and let go of the GLUE folder. */
  releaseFolder(this: Library) {
    this.stopAnalysis();
    this.unlock?.(); this.unlock = null;
    this.readOnly = true;
  },
};
