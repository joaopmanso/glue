/* DJ libraries kept in step (ADR 0063, 0065).
   - With GLUE Home (Home mode), live: every few seconds while GLUE is in view, each library GLUE knows
     the place of (a music folder, the GLUE folder, a library GLUE Home follows: chosen with its dialog
     or found where the app keeps it) is checked for a newer file; when there is one, it's read again in
     a worker and GLUE follows: its tracks, the tree browsed in the sidebar, GLUE's copies of its
     playlists. Only dates are read to look (GLUE Home answers without sending the file). Engine DJ
     writes its database as you work; a save in progress (its journal isn't empty) waits for the next look.
   - In the browser alone: "Refresh" reads a library again when asked (its file chosen again when GLUE
     can't reach it).
   - With GLUE Home's engine (ADR 0167): GLUE Home follows the libraries it can reach itself, in Rust, and this only
     shows how each is; Refresh asks it. The page still follows one only a browser can reach (a place it was allowed
     into). */
import { lib } from './library.svelte';
import * as platform from '../platform';
import { syncSource } from './importActions';
import { engineClient } from './engine.svelte';
import type { Source, SourceOrigin } from '../store/types';

const EVERY = 5000, AT_MOST = 10_000;
type Dir = FileSystemDirectoryHandle;
type AnyFile = FileSystemFileHandle & { lastModified?: number; size?: number };

async function placeDir(place: string, ask: boolean): Promise<Dir | null> {
  if (place.startsWith('hl:')) return platform.homeLibraryDir(place);
  if (place === 'home') return lib.homeHandle;
  const r = lib.rootState(place);
  if (r) return r.dir && (r.granted || (ask && await platform.permission(r.dir, 'read', true))) ? r.dir : null;
  const p = (await platform.libraryPlaces()).find(x => x.key === place);
  return p && await platform.permission(p.dir, 'read', ask) ? p.dir : null;
}
/** The folder a path's last part is in, and that part's name. */
async function walk(origin: SourceOrigin, ask: boolean): Promise<{ dir: Dir; name: string } | null> {
  let dir = await placeDir(origin.place, ask);
  if (!dir) return null;
  const parts = origin.relPath.split('/').filter(Boolean), name = parts.pop();
  if (!name) return null;
  for (const p of parts) dir = await dir.getDirectoryHandle(p);
  return { dir, name };
}
/** A file's date and size, looked at now (GLUE Home's handles carry them; the browser's need getFile). */
async function stat(h: AnyFile): Promise<{ modified: number; size: number }> {
  if (typeof h.lastModified === 'number' && typeof h.size === 'number') return { modified: h.lastModified, size: h.size };
  const f = await h.getFile();
  return { modified: f.lastModified, size: f.size };
}

/** GLUE Home follows a library itself (ADR 0167): in a music folder, the GLUE folder, or one chosen with its dialog;
    not one in a place only this browser was allowed into. */
export const homeFollows = (place: string) => !place.startsWith('place:');

/** 'live': followed (with GLUE Home); 'lost': GLUE can't reach its file now; 'reading': being read. */
export type DjState = 'live' | 'lost' | 'reading';

class DjWatch {
  private timer = 0;
  private busy = false;
  private lastRead = new Map<string, number>();
  status = $state<Record<string, DjState>>({});

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => void this.look(), EVERY);
    const now = () => void this.look();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) now(); });
    window.addEventListener('focus', now);
    now();
  }

  /** Live following is GLUE Home's (the user's choice): in the browser alone, "Refresh" does it. */
  async look() {
    const s = lib.store;
    if (this.busy || !s || !platform.homeMode() || document.hidden || lib.readOnly || lib.phase !== 'library') return;
    this.busy = true;
    try {
      const home = lib.homeRuns();
      if (home) {
        const st = await engineClient.djStatus().catch(() => null);
        if (st && lib.store === s) for (const [id, v] of Object.entries(st)) this.set(id, v);
      }
      for (const src of [...s.sources.values()]) {
        if (lib.store !== s) return;
        if (src.origin && s.ownSource(src) && !(home && homeFollows(src.origin.place))) await this.check(src, false, false).catch(e => { this.set(src.id, 'lost'); console.warn('Couldn’t look at ' + src.fileName, e); });
      }
    } finally { this.busy = false; }
  }

  /** Read a library again now (the Refresh button). False: GLUE can't reach its file (choose it again). */
  async refresh(src: Source): Promise<boolean> {
    if (!src.origin) return false;
    if (lib.homeRuns() && homeFollows(src.origin.place)) {
      try {
        this.set(src.id, 'reading');
        const r = await engineClient.djRefresh(src.id);
        if (r.notice) lib.notice = r.notice;
        this.set(src.id, r.ok ? 'live' : 'lost');
        return r.ok;
      } catch (e) { console.warn('GLUE Home couldn’t read ' + src.fileName, e); this.set(src.id, 'lost'); return false; }
    }
    try { return await this.check(src, true, true); } catch (e) { console.warn('Couldn’t read ' + src.fileName, e); return false; }
  }

  set(id: string, st: DjState) { if (this.status[id] !== st) this.status = { ...this.status, [id]: st }; }

  private async check(src: Source, force: boolean, ask: boolean): Promise<boolean> {
    const at = await walk(src.origin!, ask);
    if (!at) { this.set(src.id, 'lost'); return false; }
    let modified: number, files: () => Promise<File[]>;
    if (src.app === 'serato') {
      // Serato: "database V2" and every crate (their dates only, until one is newer).
      const dir = await at.dir.getDirectoryHandle(at.name), hs: AnyFile[] = [await dir.getFileHandle('database V2') as AnyFile];
      try {
        const sub = await dir.getDirectoryHandle('Subcrates');
        for await (const [n, h] of (sub as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) if (h.kind === 'file' && /\.crate$/i.test(n)) hs.push(h as AnyFile);
      } catch { /* no crates */ }
      modified = Math.max(...await Promise.all(hs.map(async h => (await stat(h)).modified)));
      files = () => Promise.all(hs.map(h => h.getFile()));
    } else {
      const h = await at.dir.getFileHandle(at.name) as AnyFile;
      modified = (await stat(h)).modified;
      files = async () => [await h.getFile()];
    }
    this.set(src.id, 'live');
    // Up to date, unless GLUE hasn't kept its tree yet (a library imported before ADR 0063).
    if (!force && src.tree && modified <= src.origin!.modified + 1000) return true;
    if (!force && Date.now() - (this.lastRead.get(src.id) ?? 0) < AT_MOST) return true;
    if (src.app === 'engine') {
      try { if ((await stat(await at.dir.getFileHandle(at.name + '-journal') as AnyFile)).size > 0) return true; } catch { /* no journal: not saving */ }
    }
    this.lastRead.set(src.id, Date.now());
    this.set(src.id, 'reading');
    try { await syncSource(src.id, await files(), modified, force); } finally { this.set(src.id, 'live'); }
    return true;
  }
}

export const djWatch = new DjWatch();
