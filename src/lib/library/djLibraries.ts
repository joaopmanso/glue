/* DJ libraries: found in the folders GLUE may read (ADR 0030, 0063), imported, their playlists.
   Part of `lib` (src/lib/library.svelte.ts): its methods, `this` being the library. */
import { importLists as importListsInto } from '../../store/linked';
import { applyImport, setMainSource, type ImportReport } from '../../store/merge';
import type { List, Track } from '../../store/types';
import type { ImportedLibrary } from '../../core/interop/types';
import { findLibraries, libraryAt, type Detected } from '../../core/library/detect';
import * as platform from '../../platform';
import type { Library } from '../library.svelte';

const NO_LINKED = new Map<string, List>();

export const djLibraries = {

  /** Look for DJ libraries in every folder GLUE may read: music folders, the GLUE folder, remembered places. */
  async detectLibraries(this: Library) {
    const s = this.store;
    if (!s) return;
    // A request while a search runs (a new place, an import) runs another search right after it.
    if (this.detecting) { this.detectAgain = true; return; }
    this.detecting = true;
    try {
      const where: { place: string; name: string; dir: FileSystemDirectoryHandle }[] = [];
      for (const r of this.roots) if (r.dir && r.granted) where.push({ place: r.root.id, name: r.root.name, dir: r.dir });
      if (this.homeDir && this.homeKind === 'folder') where.push({ place: 'home', name: this.homeName, dir: this.homeDir });
      const places = await platform.libraryPlaces(), states: { key: string; name: string; granted: boolean }[] = [];
      for (const p of places) {
        const granted = await platform.permission(p.dir, 'read', false);
        states.push({ key: p.key, name: p.dir.name, granted });
        if (granted) where.push({ place: p.key, name: p.dir.name, dir: p.dir });
      }
      this.places = states;
      const found: typeof this.detected = [];
      const add = (d: Detected, place: string, placeName: string) => {
        if (found.some(x => x.place === place && x.relPath === d.relPath)) return;
        // Only this computer's libraries: another computer's same app is that computer's (ADR 0099).
        const mine = [...s.sources.values()].filter(x => s.ownSource(x));
        const src = mine.find(x => x.origin?.place === place && x.origin.relPath === d.relPath)
          ?? mine.find(x => !x.origin && x.app === d.kind && x.fileName === (d.relPath.split('/').pop() ?? ''))
          // An Engine DJ set is one source: another database of it is part of that source.
          ?? (d.kind === 'engine' ? mine.find(x => x.app === 'engine') : undefined);
        const own = src?.origin?.place === place && src.origin.relPath === d.relPath;
        const status = !src ? 'new' : own && d.modified > src.origin!.modified + 1000 ? 'changed' : 'imported';
        found.push({ ...d, place, placeName, status, sourceId: src?.id ?? null, routes: [place + '|' + d.relPath], followed });
      };
      let followed = false;
      // With GLUE Home it's the app (ADR 0162): it looks in the music folders and the GLUE folder itself (ADR 0167); the
      // page only in a place this browser was allowed into.
      if (this.homeRuns()) {
        for (const d of await (this.homeDjFind?.() ?? Promise.resolve([])).catch(e => { console.warn('GLUE Home couldn’t look for DJ libraries', e); return []; })) add({ ...d, handle: null as unknown as FileSystemHandle }, d.place, d.placeName);
        for (const w of where) if (w.place.startsWith('place:')) for (const d of await findLibraries(w.dir, 3)) add(d, w.place, w.name);
      } else for (const w of where) for (const d of await findLibraries(w.dir, w.place === 'home' ? 2 : 3)) add(d, w.place, w.name);
      // The DJ libraries GLUE Home follows (ADR 0065): their files are known, no looking around.
      for (const h of await platform.homeLibraries()) {
        const d = await libraryAt(h.dir, h.file).catch(() => null);
        followed = true;
        if (d) add(d, h.place, h.name);
      }
      // The same file found by several ways (a music folder and a place inside it, GLUE Home's followed libraries…)
      // is one library (the user saw one Engine DJ m.db four times, 2026-09-30). The entry an import came from is kept.
      const one: typeof found = [];
      for (const d of found) {
        let twin: (typeof found)[number] | undefined;
        for (const k of one) if (await sameLibraryFile(k, d)) { twin = k; break; }
        if (!twin) { one.push(d); continue; }
        const keep = d.status !== 'new' && twin.status === 'new' ? d : twin, other = keep === d ? twin : d;
        keep.routes = [...new Set([...keep.routes, ...other.routes])];
        keep.followed ||= other.followed;
        if (keep === d) one[one.indexOf(twin)] = d;
      }
      // Engine DJ keeps a database on each drive it's used with (the user's C:, F: and G:, 2026-09-30), and GLUE
      // makes one source of them all (merge.ts): one entry for the set, led by the file GLUE Home follows, else the
      // biggest; Add imports every database.
      const engines = one.filter(d => d.kind === 'engine' && d.status === 'new');
      if (engines.length > 1) {
        const [lead, ...rest] = engines.sort((a, b) => Number(!!b.followed) - Number(!!a.followed) || b.size - a.size);
        one.splice(0, one.length, ...one.filter(d => !rest.includes(d)));
        lead.also = rest;
        lead.routes = [...new Set([lead, ...rest].flatMap(d => d.routes))];
      }
      // And none the user took off the list (they can still be imported by hand).
      const dismissed = new Set(s.meta.djDismissed ?? []);
      if (this.store === s) this.detected = one.filter(d => d.status !== 'new' || !d.routes.some(r => dismissed.has(r)));
      // A library imported by hand (no place remembered) found here: it's kept up to date from now on
      // (ADR 0063). Of several (an Engine DJ set), the biggest file: the computer's own library.
      // modified 0: the next look reads it once, and keeps its tree.
      for (const src of s.sources.values()) {
        if (src.origin || this.store !== s || !s.ownSource(src)) continue;
        const d = found.filter(x => x.sourceId === src.id).sort((a, b) => b.size - a.size)[0];
        if (d) this.markOrigin(src.id, { place: d.place, relPath: d.relPath, modified: 0 });
      }
    } catch (e) { console.warn('Library detection failed', e); }
    finally { this.detecting = false; }
    if (this.detectAgain) { this.detectAgain = false; await this.detectLibraries(); }
  },
  /** Take a found DJ library off the list (the ×): not suggested again, whichever way it's found. */
  dismissLibrary(this: Library, d: { routes: string[] }) {
    const s = this.store;
    if (!s || this.readOnly) return;
    s.meta.djDismissed = [...new Set([...(s.meta.djDismissed ?? []), ...d.routes])];
    s.saveMeta();
    this.detected = this.detected.filter(x => !x.routes.some(r => d.routes.includes(r)));
  },
  /** Allow another folder to look in (remembered), then look again. */
  async addLibraryPlace(this: Library, startIn: 'music' | 'documents' = 'documents') {
    try { await platform.addLibraryPlace(startIn); } catch (e) { if ((e as DOMException).name !== 'AbortError') this.notice = (e as Error).message; return; }
    await this.detectLibraries();
  },
  async allowLibraryPlace(this: Library, key: string) {
    const p = (await platform.libraryPlaces()).find(x => x.key === key);
    if (p && await platform.permission(p.dir, 'read', true)) await this.detectLibraries();
  },
  async forgetLibraryPlace(this: Library, key: string) { await platform.forgetLibraryPlace(key); await this.detectLibraries(); },
  /** Remember where an import came from (so the panel can offer Update). */
  markOrigin(this: Library, sourceId: string, origin: { place: string; relPath: string; modified: number }) {
    const src = this.store?.sources.get(sourceId);
    if (src) this.store!.putSource({ ...src, origin });
  },

  importLibrary(this: Library, lib: ImportedLibrary, fileName: string): ImportReport | null {
    const s = this.store;
    if (!s) return null;
    const r = applyImport(s, lib, fileName);
    this.enqueueAll();
    return r;
  },
  /** The main DJ library (ADR 0169): its grids and cues are a song's by default, after GLUE's own; null: none. */
  setMainDj(this: Library, id: string | null) {
    const s = this.store;
    if (!s || this.readOnly) return;
    setMainSource(s, id);
  },
  /** Bring a DJ library's lists into GLUE, linked to it (ADR 0063); '' = all of them. */
  importLists(this: Library, sourceId: string, ids: string[]): number {
    const s = this.store, src = s?.sources.get(sourceId);
    return s && src ? importListsInto(s, src, ids) : 0;
  },
  /** GLUE's copy of a DJ library's list, when it has one. */
  linkedCopy(this: Library, sourceId: string, externalId: string): List | null {
    return this.memo('linked', s => s.rev.lists, s => {
      const m = new Map<string, List>();
      for (const l of s.lists.values()) if (l.origin) m.set(l.origin.sourceId + '\n' + l.origin.externalId, l);
      return m;
    }, NO_LINKED).get(sourceId + '\n' + externalId) ?? null;
  },
  deleteSource(this: Library, id: string) {
    const s = this.store, src = s?.sources.get(id);
    if (!s || !src) return;
    for (const l of [...s.lists.values()]) if (l.origin?.sourceId === id && !l.parentId) s.deleteList(l.id);
    for (const l of [...s.lists.values()]) if (l.origin?.sourceId === id) s.deleteList(l.id);
    const drop: string[] = [], keep: Track[] = [];
    // Every track naming it (an import's list can miss tracks that later took its records in).
    for (const t of [...s.tracks.values()]) {
      if (!t.sources.includes(id)) continue;
      const sources = t.sources.filter(x => x !== id);
      if (!sources.length && t.status === 'unlinked') drop.push(t.id); else keep.push({ ...t, sources });
    }
    s.putTracks(keep);
    for (const t of drop) s.removeTrack(t);
    s.deleteSource(id);
  },
};

/** Two found DJ libraries that are one file: the browser says so (the same file handle), or, where it can't (GLUE
    Home's disk), the same app, file name, size and date. */
async function sameLibraryFile(a: Detected, b: Detected): Promise<boolean> {
  if (a.kind !== b.kind) return false;
  try { if (await (a.handle as FileSystemHandle).isSameEntry(b.handle as FileSystemHandle)) return true; } catch { /* not a browser handle */ }
  return a.size === b.size && a.modified === b.modified && a.relPath.split('/').pop() === b.relPath.split('/').pop();
}
