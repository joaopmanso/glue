/* UI actions for bringing DJ libraries in. */
import { lib } from './library.svelte';
import { parseInWorker, seratoFiles } from './parseWorker';
import * as platform from '../platform';
import { libraryAt } from '../core/library/detect';
import { engineClient } from './engine.svelte';
import { homeFollows } from './djWatch.svelte';
import type { FoundLibrary } from '../core/library/scan';
import type { Detected } from '../core/library/detect';
import type { ImportedLibrary } from '../core/interop/types';
import type { ImportReport } from '../store/merge';

function report(name: string, r: ImportReport | null) {
  if (!r) return '';
  const bits = [r.tracks + ' track' + (r.tracks === 1 ? '' : 's'), r.lists + ' playlist' + (r.lists === 1 ? '' : 's') + ' or folder' + (r.lists === 1 ? '' : 's') + ' (under DJ libraries: import the ones you want)'];
  const c = r.linkedLists;
  if (c.updated + c.added + c.removed) bits.push('GLUE’s copies of its playlists: ' + [c.updated && c.updated + ' updated', c.added && c.added + ' new', c.removed && c.removed + ' gone'].filter(Boolean).join(', '));
  if (r.linked + r.matched) bits.push((r.linked + r.matched) + ' matched to tracks you already had');
  // Playlist entries (Engine DJ): how many found their song; some can point at another library.
  const e = r.entries;
  if (e && e.entries) {
    bits.push(e.matched.toLocaleString() + ' of ' + e.entries.toLocaleString() + ' playlist entries found their song' + (e.libraries && e.libraries > 1 ? ' across ' + e.libraries + ' Engine libraries' : ''));
    // Engine DJ 3 shares one playlist tree between the computer's library and each drive's.
    if (e.otherLibraries) bits.push(e.otherLibraries.toLocaleString() + ' are songs of ' + (e.missingLibraries === 1 ? 'an Engine library' : (e.missingLibraries ?? 'other') + ' Engine libraries') + ' not imported yet (a drive or USB stick Engine DJ has used): connect it and import its Engine Library/Database2/m.db too; it joins this one');
    if (e.gone) bits.push(e.gone.toLocaleString() + ' point at songs no longer in their library');
  }
  return name + ': ' + bits.join(', ') + '.';
}

async function run(label: string, fn: () => Promise<{ lib: ImportedLibrary; fileName: string }[]>, skipped: string[] = []) {
  lib.job = { text: 'Importing ' + label + '…', done: 0, total: null };
  try {
    const libs = await fn();
    const lines = libs.map(({ lib: l, fileName }) => report(l.name, lib.importLibrary(l, fileName)));
    void lib.detectLibraries();
    if (skipped.length) lines.push('Not recognised: ' + skipped.join(', ') + '.');
    lib.notice = lines.join(' ') || 'Nothing to import.';
  } catch (e) {
    console.error(e);
    lib.notice = 'Couldn’t import ' + label + ': ' + ((e as Error).message || e);
  } finally { lib.job = null; }
}

export async function importFiles(files: File[]) {
  if (!files.length) return;
  const skipped: string[] = [];
  await run(files.length === 1 ? files[0].name : files.length + ' files', async () => {
    const r = await parseInWorker(files);
    skipped.push(...r.skipped);
    return r.libs;
  }, skipped);
}

export async function importSeratoFolder(dir: FileSystemDirectoryHandle) {
  await run('Serato', async () => (await parseInWorker(await seratoFiles(dir))).libs);
}

export async function importFound(f: FoundLibrary) {
  if (f.kind === 'serato') return importSeratoFolder(f.handle as FileSystemDirectoryHandle);
  const file = await (f.handle as FileSystemFileHandle).getFile();
  await importFiles([file]);
}

/** Add (or update) a library the finder detected, remembering where it came from. */
export async function importDetected(d: Detected & { place: string; also?: Detected[] }) {
  lib.job = { text: 'Importing ' + d.relPath + '…', done: 0, total: null };
  const also = (d.also ?? []).map(x => ({ place: (x as Detected & { place?: string }).place ?? d.place, relPath: x.relPath }));
  // GLUE Home reads it where it is, brings it in and follows it (ADR 0167).
  if (lib.homeRuns() && homeFollows(d.place) && also.every(x => homeFollows(x.place))) {
    try {
      const r = await engineClient.djImport(d.place, d.relPath, also), s = lib.store;
      // What it wrote, read here now (the feed brings it a moment later): the list of found libraries then knows.
      if (s && r.paths.length) await s.reloadFiles(r.paths);
      lib.notice = r.imports.map(x => report(x.name, x.report)).join(' ') || 'Nothing to import.';
    } catch (e) { console.error(e); lib.notice = 'Couldn’t import ' + d.relPath + ': ' + ((e as Error).message || e); }
    finally { lib.job = null; }
    await lib.detectLibraries();
    return;
  }
  try {
    // An Engine DJ set's databases (one per drive) are read together: one library (combineEngine).
    const files = d.kind === 'serato' ? await seratoFiles(d.handle as FileSystemDirectoryHandle)
      : await Promise.all([d, ...(d.also ?? [])].map(x => (x.handle as FileSystemFileHandle).getFile()));
    const r = await parseInWorker(files);
    if (!r.libs.length) throw new Error(r.skipped.join(', ') || 'not recognised');
    const parsed: { lib: ImportedLibrary; fileName: string }[] = r.libs;
    const lines: string[] = [];
    for (const p of parsed) {
      const r = lib.importLibrary(p.lib, p.fileName);
      if (!r) continue;
      // An Engine DJ set keeps following the database it follows (the computer's own).
      const had = lib.store?.sources.get(r.sourceId)?.origin;
      if (!(had && p.lib.app === 'engine' && (had.place !== d.place || had.relPath !== d.relPath))) lib.markOrigin(r.sourceId, { place: d.place, relPath: d.relPath, modified: d.modified });
      lines.push(report(p.lib.name, r));
    }
    lib.notice = lines.join(' ');
  } catch (e) { console.error(e); lib.notice = 'Couldn’t import ' + d.relPath + ': ' + ((e as Error).message || e); }
  finally { lib.job = null; }
  await lib.detectLibraries();
}

export async function pickSeratoFolder() {
  const p = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!p) { lib.notice = 'This browser can’t open folders. Choose Serato’s “database V2” file and its .crate files with Import library file instead.'; return; }
  try {
    const dir = await p({ id: 'mco-serato', mode: 'read', startIn: 'music' });
    try { await dir.getFileHandle('database V2'); } catch { lib.notice = 'That folder has no “database V2”. Pick the _Serato_ folder (usually in Music).'; return; }
    await importSeratoFolder(dir);
  } catch (e) { if ((e as DOMException).name !== 'AbortError') lib.notice = (e as Error).message; }
}

const warned = new Set<string>();
const APPS: Record<string, string> = { rekordbox: 'rekordbox', engine: 'Engine DJ', serato: 'Serato', traktor: 'Traktor', apple: 'Apple Music', m3u: 'M3U' };
/** A library GLUE keeps in step changed (ADR 0063): read it again, quietly, and bring GLUE's tracks, its
    tree and GLUE's copies of its playlists up to date. Says so only when GLUE's copies changed. */
export async function syncSource(sourceId: string, files: File[], modified: number, asked = false) {
  const src = lib.store?.sources.get(sourceId);
  if (!src?.origin) return;
  const r = await parseInWorker(files);
  const p = r.libs.find(x => x.lib.app === src.app);
  if (!p || !lib.store?.sources.has(sourceId)) return;
  const rep = lib.importLibrary(p.lib, src.fileName);
  if (!rep) return;
  const c = rep.linkedLists;
  // It looked incomplete (ADR 0090): ignored, and read again at the next look (it isn't marked as read).
  if (c.incomplete) {
    if (asked || !warned.has(sourceId)) lib.notice = (APPS[src.app] ?? src.app) + '’s library looks incomplete right now (' + rep.lists + ' playlists or folders): GLUE kept its copies and will read it again.';
    warned.add(sourceId);
    return;
  }
  warned.delete(sourceId);
  lib.markOrigin(rep.sourceId, { ...src.origin, modified });
  const what = [c.updated && c.updated + ' updated', c.added && c.added + ' new', c.removed && c.removed + ' gone'].filter(Boolean).join(', ');
  if (what) lib.notice = (APPS[src.app] ?? src.app) + ' changed its playlists: in GLUE ' + what + '.';
  else if (asked) lib.notice = (APPS[src.app] ?? src.app) + ' read again: ' + rep.tracks + ' tracks, ' + rep.lists + ' playlists or folders; GLUE’s copies were up to date.';
}

/** "Refresh" when GLUE can't reach the library's file (browser alone): the file chosen again. */
export async function refreshWithFile(sourceId: string, files: File[]) {
  const src = lib.store?.sources.get(sourceId);
  if (!src || !files.length) return;
  lib.job = { text: 'Reading ' + files[0].name + '…', done: 0, total: null };
  try {
    const r = await parseInWorker(files);
    const p = r.libs.find(x => x.lib.app === src.app);
    if (!p) { lib.notice = 'That isn’t ' + (APPS[src.app] ?? src.app) + '’s library file.'; return; }
    const rep = lib.importLibrary(p.lib, src.fileName);
    if (rep) lib.notice = report(p.lib.name, rep);
  } catch (e) { lib.notice = 'Couldn’t read it: ' + ((e as Error).message || e); }
  finally { lib.job = null; }
}

/** Home mode's Import (ADR 0065): a library file chosen with GLUE Home's own dialog. GLUE Home remembers
    it, so it's followed live from then on. */
export async function importWithHome() {
  let picked: Awaited<ReturnType<typeof platform.pickLibraryFile>>;
  try { picked = await platform.pickLibraryFile(); } catch (e) { lib.notice = 'GLUE Home couldn’t open its file dialog: ' + ((e as Error).message || e); return; }
  if (!picked) return;
  const d = await libraryAt(picked.dir, picked.file).catch(() => null);
  if (!d) { lib.notice = picked.file + ' isn’t a DJ library GLUE can read (Engine DJ m.db, Traktor collection.nml, rekordbox or Apple Music XML).'; return; }
  await importDetected({ ...d, place: picked.place });
}
