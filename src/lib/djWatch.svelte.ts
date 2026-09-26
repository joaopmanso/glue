/* DJ libraries kept in step (ADR 0063): every few seconds while GLUE is in view, each library GLUE found
   (it remembers where: a place and a path) is checked for a newer file; when there is one, it's read
   again in a worker and GLUE follows: its tracks, the tree browsed in the sidebar, GLUE's copies of its
   playlists. Engine DJ writes its database as you work; a save in progress (its journal file isn't
   empty) waits for the next look. Only dates are read to look (GLUE Home answers without sending the file). */
import { lib } from './library.svelte';
import * as platform from '../platform';
import { syncSource } from './importActions';
import type { Source, SourceOrigin } from '../store/types';

const EVERY = 5000, AT_MOST = 10_000;
type Dir = FileSystemDirectoryHandle;
type AnyFile = FileSystemFileHandle & { lastModified?: number; size?: number };

async function placeDir(place: string): Promise<Dir | null> {
  if (place === 'home') return lib.homeHandle;
  const r = lib.rootState(place);
  if (r) return r.granted ? r.dir : null;
  const p = (await platform.libraryPlaces()).find(x => x.key === place);
  return p && await platform.permission(p.dir, 'read', false) ? p.dir : null;
}
/** The folder a path's last part is in, and that part's name. */
async function walk(origin: SourceOrigin): Promise<{ dir: Dir; name: string } | null> {
  let dir = await placeDir(origin.place);
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

class DjWatch {
  private timer = 0;
  private busy = false;
  private lastRead = new Map<string, number>();
  /** Sources being read right now (the sidebar can say so). */
  reading = $state<string | null>(null);

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => void this.look(), EVERY);
    const now = () => void this.look();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) now(); });
    window.addEventListener('focus', now);
    now();
  }

  async look() {
    const s = lib.store;
    if (this.busy || !s || document.hidden || lib.cloud || lib.readOnly || lib.phase !== 'library') return;
    this.busy = true;
    try {
      for (const src of [...s.sources.values()]) {
        if (lib.store !== s) return;
        if (src.origin) await this.check(src).catch(e => console.warn('Couldn’t look at ' + src.fileName, e));
      }
    } finally { this.busy = false; }
  }

  private async check(src: Source) {
    const at = await walk(src.origin!);
    if (!at) return;
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
    // Up to date, unless GLUE hasn't kept its tree yet (a library imported before ADR 0063).
    if (src.tree && modified <= src.origin!.modified + 1000) return;
    if (Date.now() - (this.lastRead.get(src.id) ?? 0) < AT_MOST) return;
    if (src.app === 'engine') {
      try { if ((await stat(await at.dir.getFileHandle(at.name + '-journal') as AnyFile)).size > 0) return; } catch { /* no journal: not saving */ }
    }
    this.lastRead.set(src.id, Date.now());
    this.reading = src.id;
    try { await syncSource(src.id, await files(), modified); } finally { this.reading = null; }
  }
}

export const djWatch = new DjWatch();
