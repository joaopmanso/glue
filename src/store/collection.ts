/* One collection in memory, persisted as sharded JSON files (ADR 0009 / 0018).
   Mutations mark files dirty; flush() writes only those, debounced by the caller. */
import { DamagedFile, type Dir, listNames, readJSON, removePath, writeJSON, writeText } from './fsx';
import { type AnalysisSummary, type Collection, type List, type Source, type Track, SCHEMA, shardOf } from './types';
import type { GlueEvent } from '../core/library/events';
import { migrate } from './migrations';
import { record, time, timeAsync } from '../core/perf';

type Shard<T> = { schemaVersion: number; items: Record<string, T> };
/** A deleted playlist or folder with everything that was in it, in the bin (ADR 0090). */
export interface BinEntry { name: string; deletedAt: string; lists: List[] }
const BIN_DAYS = 30;

/** Read files a few at a time, answers in the files' order (GLUE Home's disk answers over HTTP, where
    one at a time is slow; a local folder doesn't mind). */
async function readAll<T>(paths: string[], read: (p: string) => Promise<T>, atOnce = 12): Promise<T[]> {
  const out = new Array<T>(paths.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(atOnce, paths.length) }, async () => {
    while (next < paths.length) { const i = next++; out[i] = await read(paths[i]); }
  }));
  return out;
}
const jsonFiles = (names: string[]) => names.filter(f => f.endsWith('.json'));

export class CollectionStore {
  readonly tracks = new Map<string, Track>();
  readonly analysis = new Map<string, AnalysisSummary>();
  readonly lists = new Map<string, List>();
  readonly sources = new Map<string, Source>();
  /** Events (ADR 0074): all in one file, `events.json`; their flyers beside it in `events/`. */
  readonly events = new Map<string, GlueEvent>();
  readonly damaged: string[] = [];         // files that couldn't be read, kept aside as *.damaged
  private dirty = new Set<string>();       // relative paths to write
  private deleted = new Set<string>();     // relative paths to remove
  private binned: BinEntry[] = [];          // deleted lists, written into the bin on the next save
  private writing: Promise<void> | null = null;
  onChange: (() => void) | null = null;
  onDirty: (() => void) | null = null;
  /** Tracks, analyses and lists shown here but owned by another device (ADR 0042): kept in memory,
      never written to this collection's files. */
  readonly ephemeral = new Set<string>();
  /** Changes counted by kind (ADR 0059): what's built from one part (DJ values from the imports,
      playlist membership from the lists) is rebuilt only when that part changed. */
  readonly rev = { tracks: 0, analysis: 0, lists: 0, sources: 0, events: 0 };

  /** `root` changes when the library moves between GLUE Home's disk and the browser's (ADR 0051). */
  private constructor(public root: Dir, readonly base: string, public meta: Collection) {}

  static load(root: Dir, pid: string, cid: string): Promise<CollectionStore> { return timeAsync('store.load', () => CollectionStore.loadNow(root, pid, cid)); }
  private static async loadNow(root: Dir, pid: string, cid: string): Promise<CollectionStore> {
    const base = `profiles/${pid}/collections/${cid}`;
    const meta = await readJSON<Collection>(root, base + '/collection.json');
    if (!meta) throw new Error('Collection not found in your GLUE folder.');
    const s = new CollectionStore(root, base, migrate('collection', meta));
    // One unreadable file must not lock the user out of the rest: keep a copy aside and go on.
    const read = async <T>(path: string): Promise<T | null> => {
      try { return await readJSON<T>(root, path); }
      catch (e) {
        if (!(e instanceof DamagedFile)) throw e;
        s.damaged.push(path.slice(base.length + 1));
        await writeText(root, path.replace(/\.json$/, '.damaged'), e.text);
        return null;
      }
    };
    const each = async <T>(dir: string) => {
      const names = jsonFiles(await listNames(root, `${base}/${dir}`, 'file'));
      return readAll(names, f => read<T>(`${base}/${dir}/${f}`));
    };
    const [tracks, analysis, lists, sources, events] = await Promise.all([each<Shard<Track>>('tracks'), each<Shard<AnalysisSummary>>('analysis'), each<List>('lists'), each<Source>('sources'), read<Shard<GlueEvent>>(`${base}/events.json`)]);
    for (const sh of tracks) if (sh) for (const [id, v] of Object.entries(migrate('tracks', sh).items)) s.tracks.set(id, v);
    for (const sh of analysis) if (sh) for (const [id, v] of Object.entries(migrate('analysis', sh).items)) s.analysis.set(id, v);
    for (const l of lists) if (l) s.lists.set(l.id, migrate('list', l));
    for (const src of sources) if (src) s.sources.set(src.id, migrate('source', src));
    for (const [id, e] of Object.entries(events?.items ?? {})) s.events.set(id, e);
    return s;
  }

  private mark(path: string) { this.deleted.delete(path); this.dirty.add(path); this.onDirty?.(); }
  private changed() { this.onChange?.(); }

  saveMeta() { this.mark('collection.json'); this.changed(); }
  putTrack(t: Track) { this.tracks.set(t.id, t); this.rev.tracks++; if (!this.ephemeral.has(t.id)) this.mark(`tracks/${shardOf(t.id)}.json`); this.changed(); }
  putTracks(ts: Track[]) { for (const t of ts) { this.tracks.set(t.id, t); if (!this.ephemeral.has(t.id)) this.mark(`tracks/${shardOf(t.id)}.json`); } this.rev.tracks++; this.changed(); }
  removeTrack(id: string) {
    if (this.ephemeral.has(id)) return;   // another device's track: removed there, not here
    this.tracks.delete(id); this.analysis.delete(id); this.rev.tracks++; this.rev.analysis++;
    this.mark(`tracks/${shardOf(id)}.json`); this.mark(`analysis/${shardOf(id)}.json`);
    for (const l of this.lists.values()) if (l.items.includes(id)) this.putList({ ...l, items: l.items.filter(x => x !== id) });
    this.changed();
  }
  putAnalysis(id: string, a: AnalysisSummary) { this.analysis.set(id, a); this.rev.analysis++; if (!this.ephemeral.has(id)) this.mark(`analysis/${shardOf(id)}.json`); this.changed(); }
  putList(l: List) { this.lists.set(l.id, l); this.rev.lists++; if (!this.ephemeral.has(l.id)) this.mark(`lists/${l.id}.json`); this.changed(); }
  deleteList(id: string) {
    const doomed = [id];
    for (let i = 0; i < doomed.length; i++) for (const l of this.lists.values()) if (l.parentId === doomed[i]) doomed.push(l.id);
    // Into the bin first (ADR 0090): whatever deleted it (the user, another device, a DJ library).
    const kept = doomed.filter(d => !this.ephemeral.has(d)).map(d => this.lists.get(d)).filter((l): l is List => !!l);
    if (kept.length) this.binned.push({ name: Date.now() + '-' + kept[0].id + '.json', deletedAt: new Date().toISOString(), lists: kept.map(l => ({ ...l })) });
    this.rev.lists++;
    for (const d of doomed) { this.lists.delete(d); if (this.ephemeral.has(d)) continue; this.dirty.delete(`lists/${d}.json`); this.deleted.add(`lists/${d}.json`); }
    this.onDirty?.(); this.changed();
  }
  putEvent(e: GlueEvent) { this.events.set(e.id, e); this.rev.events++; this.mark('events.json'); this.changed(); }
  deleteEvent(id: string) { this.events.delete(id); this.rev.events++; this.mark('events.json'); this.changed(); }
  putSource(s: Source) { this.sources.set(s.id, s); this.rev.sources++; this.mark(`sources/${s.id}.json`); this.changed(); }
  deleteSource(id: string) {
    this.sources.delete(id); this.rev.sources++;
    this.dirty.delete(`sources/${id}.json`); this.deleted.add(`sources/${id}.json`);
    this.onDirty?.(); this.changed();
  }

  // ─── Shown here, not saved (ADR 0042 other devices' songs, ADR 0051 TO BE SORTED) ───────────
  // These don't count as the user's changes (no onChange: nothing to sync); the caller refreshes the view.
  /** Show tracks, analyses and lists owned elsewhere: in memory only, never written. */
  putShown(tracks: Iterable<Track>, lists: Iterable<List>, analysis?: Iterable<[string, AnalysisSummary]>) {
    for (const t of tracks) { this.ephemeral.add(t.id); this.tracks.set(t.id, t); }
    for (const [id, a] of analysis ?? []) this.analysis.set(id, a);
    for (const l of lists) { this.ephemeral.add(l.id); this.lists.set(l.id, l); }
    this.rev.tracks++; this.rev.analysis++; this.rev.lists++;
  }
  /** Take shown tracks, analyses and lists away again. */
  dropShown(ids: Iterable<string>) {
    for (const id of ids) { this.tracks.delete(id); this.analysis.delete(id); this.lists.delete(id); this.ephemeral.delete(id); }
    this.rev.tracks++; this.rev.analysis++; this.rev.lists++;
  }
  /** One of this collection's lists, shown with other items (other devices' songs) without saving that. */
  showItems(id: string, items: string[]) {
    const l = this.lists.get(id);
    if (l) { this.lists.set(id, { ...l, items }); this.rev.lists++; }
  }
  /** Tracks were changed in place (which devices have them): indexes over tracks must be rebuilt. */
  touchTracks() { this.rev.tracks++; }

  get hasPending() { return this.dirty.size > 0 || this.deleted.size > 0 || this.binned.length > 0; }

  // ─── The bin (ADR 0090): deleted playlists and folders, kept 30 days ─────────────────────────
  private get binDir() { const [, pid, , cid] = this.base.split('/'); return `bin/${pid}/${cid}`; }
  /** What's in the bin, newest first (entries older than 30 days are removed as they're found). */
  async binEntries(): Promise<BinEntry[]> {
    const out: BinEntry[] = [], old = Date.now() - BIN_DAYS * 86_400_000;
    for (const n of jsonFiles(await listNames(this.root, this.binDir, 'file').catch(() => []))) {
      if (Number(n.split('-')[0]) < old) { await removePath(this.root, `${this.binDir}/${n}`).catch(() => {}); continue; }
      const e = await readJSON<Omit<BinEntry, 'name'>>(this.root, `${this.binDir}/${n}`).catch(() => null);
      if (e?.lists?.length) out.push({ ...e, name: n });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }
  /** Put a bin entry's lists back: under their old parent if it's still there, else at the top. */
  async restoreFromBin(name: string): Promise<number> {
    const e = await readJSON<Omit<BinEntry, 'name'>>(this.root, `${this.binDir}/${name}`);
    if (!e?.lists?.length) return 0;
    const ids = new Set(e.lists.map(l => l.id));
    for (const l of e.lists) this.putList({ ...l, parentId: l.parentId && (ids.has(l.parentId) || this.lists.has(l.parentId)) ? l.parentId : null, items: l.items.filter(t => this.tracks.has(t)) });
    await this.flush();
    await removePath(this.root, `${this.binDir}/${name}`);
    return e.lists.length;
  }

  /** Write every dirty file. Concurrent calls queue behind the one in flight. */
  async flush(): Promise<void> {
    while (this.writing) await this.writing;
    if (!this.hasPending) return;
    const paths = [...this.dirty], gone = [...this.deleted], bin = this.binned;
    this.dirty.clear(); this.deleted.clear(); this.binned = [];
    const t0 = performance.now();
    this.writing = (async () => {
      // Each file on its own: one failure must not hold back every other change.
      let first: unknown = null;
      try {
        // The bin before anything is removed: a deleted list is never only gone.
        for (const e of bin) {
          try { await writeJSON(this.root, `${this.binDir}/${e.name}`, { deletedAt: e.deletedAt, lists: e.lists }); }
          catch (err) { this.binned.push(e); first ??= err; }
        }
        for (const p of gone) {
          try { await removePath(this.root, `${this.base}/${p}`); }
          catch (e) { this.deleted.add(p); first ??= e; }
        }
        for (const p of paths) {
          const value = time('store.serialize', () => this.serialize(p));
          try {
            // Gone since it was marked (deleted before the save ran): remove its file instead.
            if (value === undefined) await removePath(this.root, `${this.base}/${p}`);
            else await writeJSON(this.root, `${this.base}/${p}`, value);
          } catch (e) { if (!this.deleted.has(p)) this.dirty.add(p); first ??= e; }   // retried next time
        }
      } finally { this.writing = null; record('store.flush', performance.now() - t0); }
      if (first) throw first;
    })();
    return this.writing;
  }

  private serialize(p: string): unknown {
    if (p === 'collection.json') return this.meta;
    if (p === 'events.json') return { schemaVersion: SCHEMA, items: Object.fromEntries(this.events) };
    const [dir, file] = p.split('/'), key = file.replace(/\.json$/, '');
    if (dir === 'tracks' || dir === 'analysis') {
      const src: Map<string, Track | AnalysisSummary> = dir === 'tracks' ? this.tracks : this.analysis;
      const items: Record<string, unknown> = {};
      for (const [id, v] of src) {
        if (shardOf(id) !== key || this.ephemeral.has(id)) continue;
        // What only a merged view knows (which devices have it) isn't saved.
        if (dir === 'tracks' && ((v as Track).onDevices || (v as Track).remote)) { const { onDevices: _d, remote: _r, ...rest } = v as Track; items[id] = rest; }
        else items[id] = v;
      }
      return { schemaVersion: SCHEMA, items };
    }
    if (dir === 'lists') return this.lists.get(key);
    if (dir === 'sources') return this.sources.get(key);
    throw new Error('unknown store path ' + p);
  }
}
