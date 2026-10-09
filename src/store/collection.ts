/* One collection in memory, persisted as sharded JSON files (ADR 0009 / 0018).
   Mutations mark files dirty; flush() writes only those, debounced by the caller. */
import { DamagedFile, type Dir, listFiles, listNames, parseJSON, readJSON, removePath, writeJSON, writeText } from './fsx';
import { type AnalysisSummary, type Collection, type List, type Source, type Track, SCHEMA, shardOf } from './types';
import type { GlueEvent } from '../core/library/events';
import { migrate } from './migrations';
import { record, time, timeAsync } from '../core/perf';
import { analysisHere, analysisShared, collectionHere, collectionShared, toLocal, toShared, type Here, type SharedCollection, type SharedTrack, meFor, unknownComputer, withCopies, writesFor } from '../core/shared/project';
import { foldComputer, needsFold, type FoldResult } from '../core/shared/repair';

/** A shared collection (ADR 0094): its files hold every computer's parts; this is how this computer sees
    them, and what was read, so saving changes only this computer's parts. */
/** A change to a collection, as a GLUE tab sends it to GLUE Home's engine (ADR 0104): the record itself. */
export type StoreOp =
  /** `was`: each song as this store had it (sent to GLUE Home's engine: only what changed from it is applied there,
      over a change it made meanwhile, ADR 0162). */
  | { m: 'meta'; meta: Collection } | { m: 'tracks'; ts: Track[]; was?: (Track | null)[] } | { m: 'removeTrack'; id: string } | { m: 'analysis'; id: string; a: AnalysisSummary }
  | { m: 'list'; l: List } | { m: 'deleteList'; id: string } | { m: 'event'; e: GlueEvent } | { m: 'deleteEvent'; id: string }
  | { m: 'source'; s: Source } | { m: 'deleteSource'; id: string };
/** `own`: this GLUE folder may write its computer's parts (its copies, analyses, music folders): the
    computer is known and this is the folder recorded for it (ADR 0108). Otherwise they're shown, never
    written. */
export interface SharedMode { here: Here; own: boolean; shownOnly?: boolean; member: { profile: string; name: string }; meta: SharedCollection; tracks: Map<string, SharedTrack>; analysis: Map<string, Record<string, AnalysisSummary>> }
/** me: this computer (GLUE Home's computer, this browser's device, the GLUE folder's own); `shownOnly`: write
    none of this computer's parts whatever (GLUE Home before it knows its computer). */
export interface LoadOpts { me?: string | null; name?: string; shownOnly?: boolean; onProgress?: (done: number, total: number) => void }

type Shard<T> = { schemaVersion: number; items: Record<string, T> };
/** A deleted playlist or folder with everything that was in it, in the bin (ADR 0090). */
export interface BinEntry { name: string; deletedAt: string; lists: List[] }
const BIN_DAYS = 30;

/** Read files several at a time, answers in the files' order (GLUE Home's disk answers over HTTP, where one at a time
    is slow; a local folder reads 32 at a time a little faster than 12, ADR 0177). */
async function readAll<P, T>(paths: P[], read: (p: P) => Promise<T>, atOnce = 32): Promise<T[]> {
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

  /** Set for a shared collection (ADR 0094). */
  shared: SharedMode | null = null;
  /** Files a sync brought in were read again (the view redraws; nothing to save or send). */
  onReloaded: (() => void) | null = null;
  /** `root` changes when the library moves between GLUE Home's disk and the browser's (ADR 0051). */
  private constructor(public root: Dir, readonly base: string, public meta: Collection) {}

  static load(root: Dir, pid: string, cid: string, opts: LoadOpts = {}): Promise<CollectionStore> { return timeAsync('store.load', () => CollectionStore.loadNow(root, pid, cid, opts)); }
  private static async loadNow(root: Dir, pid: string, cid: string, opts: LoadOpts): Promise<CollectionStore> {
    const base = `profiles/${pid}/collections/${cid}`;
    const raw = await readJSON<Collection | SharedCollection>(root, base + '/collection.json');
    if (!raw) throw new Error('Collection not found in your GLUE folder.');
    // A shared collection: seen as this computer (the one whose profile this folder is in, if not told), and
    // its parts written only when it's known and this is its folder (ADR 0108; never as a stand-in).
    let mode: SharedMode | null = null;
    if ((raw as SharedCollection).shared) {
      const sc = raw as SharedCollection, members = sc.members ?? {};
      const me = (!unknownComputer(opts.me) ? opts.me : null) || meFor(sc, pid) || '';
      const own = !opts.shownOnly && writesFor(sc, me, pid);
      mode = { here: { me, collection: cid, members, rootsBy: sc.rootsBy }, own, shownOnly: !!opts.shownOnly, member: { profile: pid, name: opts.name ?? members[me]?.name ?? 'This computer' }, meta: sc, tracks: new Map(), analysis: new Map() };
    }
    const s = new CollectionStore(root, base, migrate('collection', mode ? collectionHere(raw as SharedCollection, mode.here.me) : raw as Collection));
    s.shared = mode;
    // One unreadable file must not lock the user out of the rest: keep a copy aside and go on.
    // `text`: the file's own reader, from its folder's list (listFiles).
    const read = async <T>(path: string, text?: () => Promise<string | null>): Promise<T | null> => {
      try { return text ? parseJSON<T>(path, await text()) : await readJSON<T>(root, path); }
      catch (e) {
        if (!(e instanceof DamagedFile)) throw e;
        s.damaged.push(path.slice(base.length + 1));
        await writeText(root, path.replace(/\.json$/, '.damaged'), e.text);
        return null;
      }
    };
    // Every folder listed first, so the files to read are known and counted (the loading bar, ADR 0177).
    const dirs = ['tracks', 'analysis', 'lists', 'sources'];
    const files = await Promise.all(dirs.map(async d => (await listFiles(root, `${base}/${d}`)).filter(f => f.name.endsWith('.json'))));
    const total = files.reduce((n, a) => n + a.length, 1);
    let done = 0;
    opts.onProgress?.(0, total);
    const counted = async <T>(path: string, text?: () => Promise<string | null>) => { const v = await read<T>(path, text); opts.onProgress?.(++done, total); return v; };
    const each = <T>(i: number) => readAll(files[i], f => counted<T>(`${base}/${dirs[i]}/${f.name}`, f.text));
    const [tracks, analysis, lists, sources, events] = await Promise.all([each<Shard<Track>>(0), each<Shard<AnalysisSummary>>(1), each<List>(2), each<Source>(3), counted<Shard<GlueEvent>>(`${base}/events.json`)]);
    for (const src of sources) if (src) s.sources.set(src.id, migrate('source', src));   // first: a song's computer (withCopies)
    for (const sh of tracks) if (sh) s.takeTracks(migrate('tracks', sh).items);
    for (const sh of analysis) if (sh) s.takeAnalysis(migrate('analysis', sh).items);
    for (const l of lists) if (l) s.lists.set(l.id, migrate('list', l));
    for (const [id, e] of Object.entries(events?.items ?? {})) s.events.set(id, e);
    // Opened on a computer that isn't a member yet (it just joined): it becomes one on the next save.
    if (mode?.own && opts.me && !mode.meta.members?.[mode.here.me]) s.saveMeta();
    return s;
  }

  /** A tracks shard's items into memory (as this computer sees them, when shared). */
  private takeTracks(items: Record<string, unknown>) {
    const m = this.shared;
    for (const [id, v] of Object.entries(items)) {
      if (m) {
        // A record without its copies, put right (ADR 0161; saved so when its computer is known, for the other devices).
        const fixed = withCopies(v as SharedTrack, m.meta, this.sources.values()), st = fixed ?? v as SharedTrack;
        if (fixed && Object.keys(fixed.copies).length) this.mark('tracks/' + shardOf(id) + '.json');
        m.tracks.set(id, st); this.tracks.set(id, toLocal(st, m.here));
      }
      else this.tracks.set(id, v as Track);
    }
  }
  private takeAnalysis(items: Record<string, unknown>) {
    const m = this.shared;
    for (const [id, v] of Object.entries(items)) {
      if (m) { m.analysis.set(id, v as Record<string, AnalysisSummary>); const a = analysisHere(v as Record<string, AnalysisSummary>, m.here.me); if (a) this.analysis.set(id, a); }
      else this.analysis.set(id, v as AnalysisSummary);
    }
  }
  /** A sync changed these files (ADR 0094): read them again into memory, without marking anything to save. */
  async reloadFiles(paths: string[]) {
    for (const p of paths) {
      const [dir, file] = p.split('/');
      const v = await readJSON<unknown>(this.root, `${this.base}/${p}`).catch(() => null);
      if (p === 'collection.json') {
        if (!v) continue;
        if (this.shared) { this.shared.meta = v as SharedCollection; this.shared.here = { ...this.shared.here, members: (v as SharedCollection).members ?? {}, rootsBy: (v as SharedCollection).rootsBy }; if (!this.shared.shownOnly) this.shared.own = writesFor(this.shared.meta, this.shared.here.me, this.shared.member.profile); this.meta = migrate('collection', collectionHere(v as SharedCollection, this.shared.here.me)); }
        else this.meta = migrate('collection', v as Collection);
      } else if (p === 'events.json') {
        this.events.clear();
        for (const [id, e] of Object.entries((v as { items?: Record<string, GlueEvent> } | null)?.items ?? {})) this.events.set(id, e);
        this.rev.events++;
      } else if (dir === 'tracks' || dir === 'analysis') {
        const key = file.replace(/\.json$/, '');
        const map: Map<string, unknown> = dir === 'tracks' ? this.tracks : this.analysis;
        for (const id of [...map.keys()]) if (shardOf(id) === key && !this.ephemeral.has(id)) { map.delete(id); if (dir === 'tracks') this.shared?.tracks.delete(id); else this.shared?.analysis.delete(id); }
        const items = v ? migrate(dir, v as Shard<never>).items : {};
        if (dir === 'tracks') { this.takeTracks(items); this.rev.tracks++; } else { this.takeAnalysis(items); this.rev.analysis++; }
      } else if (dir === 'lists') {
        const id = file.replace(/\.json$/, '');
        if (v) this.lists.set(id, migrate('list', v as List)); else this.lists.delete(id);
        this.rev.lists++;
      } else if (dir === 'sources') {
        const id = file.replace(/\.json$/, '');
        if (v) this.sources.set(id, migrate('source', v as Source)); else this.sources.delete(id);
        this.rev.sources++;
      }
    }
    this.onReloaded?.();
  }

  /** A client of GLUE Home's engine (ADR 0104): changes show here at once and go to the engine as ops (it
      writes the files); nothing is written from here. */
  sink: ((op: StoreOp) => void) | null = null;
  /** Told of the files each flush wrote or removed (GLUE Home's engine: its feed of changes). */
  onWrote: ((paths: string[]) => void) | null = null;
  /** An op from a client, applied here (the engine): the same change the client made on its copy. */
  apply(op: StoreOp) {
    switch (op.m) {
      case 'meta': this.meta = op.meta; this.saveMeta(); break;
      case 'tracks': this.putTracks(op.ts); break;
      case 'removeTrack': this.removeTrack(op.id); break;
      case 'analysis': this.putAnalysis(op.id, op.a); break;
      case 'list': this.putList(op.l); break;
      case 'deleteList': this.deleteList(op.id); break;
      case 'event': this.putEvent(op.e); break;
      case 'deleteEvent': this.deleteEvent(op.id); break;
      case 'source': this.putSource(op.s); break;
      case 'deleteSource': this.deleteSource(op.id); break;
    }
  }
  private mark(path: string) { if (this.sink) return; this.deleted.delete(path); this.dirty.add(path); this.onDirty?.(); }
  private changed() { this.onChange?.(); }

  saveMeta() { this.sink?.({ m: 'meta', meta: this.meta }); this.mark('collection.json'); this.changed(); }
  putTrack(t: Track) { if (!this.ephemeral.has(t.id)) this.sink?.({ m: 'tracks', ts: [t], was: [this.tracks.get(t.id) ?? null] }); this.tracks.set(t.id, t); this.rev.tracks++; if (!this.ephemeral.has(t.id)) this.mark(`tracks/${shardOf(t.id)}.json`); this.changed(); }
  putTracks(ts: Track[]) { if (this.sink) { const own = ts.filter(t => !this.ephemeral.has(t.id)); if (own.length) this.sink({ m: 'tracks', ts: own, was: own.map(t => this.tracks.get(t.id) ?? null) }); } for (const t of ts) { this.tracks.set(t.id, t); if (!this.ephemeral.has(t.id)) this.mark(`tracks/${shardOf(t.id)}.json`); } this.rev.tracks++; this.changed(); }
  removeTrack(id: string) {
    if (this.ephemeral.has(id)) return;   // another device's track: removed there, not here
    // Shared, and this folder doesn't hold this computer's parts (ADR 0108): it removes nothing.
    if (this.shared && !this.shared.own && !this.sink) return;
    this.sink?.({ m: 'removeTrack', id });
    // Shared, and another computer has it too: only this computer's copy goes (ADR 0100). The song, its
    // playlists and the other computers' analyses stay, now shown as theirs.
    const m = this.shared, st = m?.tracks.get(id);
    if (m && st && Object.keys(st.copies ?? {}).some(c => c !== m.here.me)) {
      const { [m.here.me]: _mine, ...copies } = st.copies;
      const rest: SharedTrack = { ...st, copies };
      m.tracks.set(id, rest); this.tracks.set(id, toLocal(rest, m.here));
      const by = m.analysis.get(id);
      if (by?.[m.here.me]) {
        const { [m.here.me]: _a, ...others } = by;
        m.analysis.set(id, others);
        const a = analysisHere(others, m.here.me);
        if (a) this.analysis.set(id, a); else this.analysis.delete(id);
      }
      this.rev.tracks++; this.rev.analysis++;
      this.mark(`tracks/${shardOf(id)}.json`); this.mark(`analysis/${shardOf(id)}.json`);
      this.changed();
      return;
    }
    this.tracks.delete(id); this.analysis.delete(id); this.rev.tracks++; this.rev.analysis++;
    this.mark(`tracks/${shardOf(id)}.json`); this.mark(`analysis/${shardOf(id)}.json`);
    for (const l of this.lists.values()) if (l.items.includes(id)) this.putList({ ...l, items: l.items.filter(x => x !== id) });
    this.changed();
  }
  /** Shared (ADR 0130): this computer has another computer's song too, the same file. That song gets this
      computer's copy (`copy`: where its file is here); the others' copies stay, so it's one row, on both.
      False when it can't: not shared, not another computer's, or this folder doesn't write this computer's parts. */
  addCopy(id: string, copy: Pick<Track, 'rootId' | 'relPath' | 'size' | 'mtime'>): boolean {
    const m = this.shared, t = this.tracks.get(id), prev = m?.tracks.get(id);
    if (!m || !t?.remote || !prev || this.ephemeral.has(id) || unknownComputer(m.here.me) || (!m.own && !this.sink)) return false;
    const { remote: _r, onDevices: _d, aka: _a, unwritten: _u, filePath: _f, ...rest } = t;
    const mine: Track = { ...rest, ...copy, status: 'linked', importPath: null, fileKey: null, sources: [] };
    this.putTrack(toLocal(toShared(mine, m.here, prev), m.here));
    return true;
  }
  putAnalysis(id: string, a: AnalysisSummary) { if (!this.ephemeral.has(id)) this.sink?.({ m: 'analysis', id, a }); this.analysis.set(id, a); this.rev.analysis++; if (!this.ephemeral.has(id)) this.mark(`analysis/${shardOf(id)}.json`); this.changed(); }
  putList(l: List) { if (!this.ephemeral.has(l.id)) this.sink?.({ m: 'list', l }); this.lists.set(l.id, l); this.rev.lists++; if (!this.ephemeral.has(l.id)) this.mark(`lists/${l.id}.json`); this.changed(); }
  deleteList(id: string) {
    if (!this.ephemeral.has(id)) this.sink?.({ m: 'deleteList', id });
    const doomed = [id];
    for (let i = 0; i < doomed.length; i++) for (const l of this.lists.values()) if (l.parentId === doomed[i]) doomed.push(l.id);
    // Into the bin first (ADR 0090): whatever deleted it (the user, another device, a DJ library).
    const kept = doomed.filter(d => !this.ephemeral.has(d)).map(d => this.lists.get(d)).filter((l): l is List => !!l);
    if (kept.length && !this.sink) this.binned.push({ name: Date.now() + '-' + kept[0].id + '.json', deletedAt: new Date().toISOString(), lists: kept.map(l => ({ ...l })) });
    this.rev.lists++;
    for (const d of doomed) { this.lists.delete(d); if (this.ephemeral.has(d) || this.sink) continue; this.dirty.delete(`lists/${d}.json`); this.deleted.add(`lists/${d}.json`); }
    this.onDirty?.(); this.changed();
  }
  putEvent(e: GlueEvent) { this.sink?.({ m: 'event', e }); this.events.set(e.id, e); this.rev.events++; this.mark('events.json'); this.changed(); }
  deleteEvent(id: string) { this.sink?.({ m: 'deleteEvent', id }); this.events.delete(id); this.rev.events++; this.mark('events.json'); this.changed(); }
  putSource(s: Source) {
    // A library read here, in a shared collection: this computer's (ADR 0099).
    if (this.shared && !s.computer) s = { ...s, computer: this.shared.here.me };
    this.sink?.({ m: 'source', s });
    this.sources.set(s.id, s); this.rev.sources++; this.mark(`sources/${s.id}.json`); this.changed();
  }
  /** A library this computer can read: its own, or any outside a shared collection. */
  ownSource(s: Source) { return !this.shared || !s.computer || s.computer === this.shared.here.me; }
  deleteSource(id: string) {
    this.sink?.({ m: 'deleteSource', id });
    this.sources.delete(id); this.rev.sources++;
    if (this.sink) { this.changed(); return; }
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

  /** GLUE Home knows its computer (ADR 0108): parts written under another id (the old stand-in, another
      member naming this folder) are folded into it, this folder takes the computer's entry back, and the
      store writes as that computer from now on. Saved on the next flush; the rows that became the same file
      twice come back for the caller to fold (store/merge absorbTracks). Null: nothing to put right. */
  foldComputer(into: string, name?: string): { counts: FoldResult['counts']; twins: [string, string][] } | null {
    const m = this.shared;
    if (!m || unknownComputer(into)) return null;
    const folder = m.member.profile, input = { meta: m.meta, tracks: m.tracks, analysis: m.analysis, sources: [...this.sources.values()] };
    if (!needsFold(input, into, folder)) { if (m.here.me === into && !m.shownOnly) m.own = true; return null; }
    const r = foldComputer(input, into, folder, name);
    m.meta = r.meta; m.own = true; m.shownOnly = false;
    m.here = { ...m.here, me: into, members: r.meta.members ?? {}, rootsBy: r.meta.rootsBy };
    m.member = { profile: folder, name: r.meta.members[into].name };
    this.meta = migrate('collection', collectionHere(r.meta, into));
    for (const [id, st] of r.tracks) m.tracks.set(id, st);
    for (const [id, by] of r.analysis) m.analysis.set(id, by);
    // Every song seen again as this computer.
    for (const [id, st] of m.tracks) if (!this.ephemeral.has(id)) this.tracks.set(id, toLocal(st, m.here));
    for (const [id, by] of m.analysis) { const a = analysisHere(by, into); if (a) this.analysis.set(id, a); else this.analysis.delete(id); }
    for (const s of r.sources) { this.sources.set(s.id, s); this.mark(`sources/${s.id}.json`); }
    const shards = new Set([...r.tracks.keys(), ...r.analysis.keys()].map(shardOf));
    for (const sh of shards) { this.mark(`tracks/${sh}.json`); this.mark(`analysis/${sh}.json`); }
    this.mark('collection.json');
    this.rev.tracks++; this.rev.analysis++; this.rev.sources++;
    this.changed();
    return { counts: r.counts, twins: r.twins };
  }

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

  /** Opened as this computer's own collection, its files became shared since (a share in the middle of a save, or the
      collection opened again during one): it writes nothing more, and is opened again. */
  outdated = false;
  /** Write every dirty file. Concurrent calls queue behind the one in flight. */
  async flush(): Promise<void> {
    while (this.writing) await this.writing;
    if (!this.hasPending) return;
    // Nothing from a store opened as this computer's own into a shared collection's files: another
    // device would get songs without `copies`, which it took for its own with no file (ADR 0161).
    if (!this.shared) {
      const meta = this.outdated ? null : await readJSON<{ shared?: boolean }>(this.root, this.base + '/collection.json').catch(() => null);
      if (this.outdated || meta?.shared) {
        this.outdated = true;
        this.dirty.clear(); this.deleted.clear(); this.binned = [];
        throw Object.assign(new Error('This collection became shared meanwhile: it’s opened again.'), { name: 'OutdatedStore' });
      }
    }
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
      } finally { this.writing = null; record('store.flush', performance.now() - t0); this.onWrote?.([...paths, ...gone]); }
      if (first) throw first;
    })();
    return this.writing;
  }

  private serialize(p: string): unknown {
    const m = this.shared;
    if (p === 'collection.json') { if (!m) return this.meta; m.meta = collectionShared(this.meta, m.own ? m.here.me : '', m.meta, m.member, m.own && [...m.tracks.values()].some(t => !!t.copies?.[m.here.me])); m.here = { ...m.here, members: m.meta.members, rootsBy: m.meta.rootsBy }; return m.meta; }
    if (p === 'events.json') return { schemaVersion: SCHEMA, items: Object.fromEntries(this.events) };
    const [dir, file] = p.split('/'), key = file.replace(/\.json$/, '');
    if (dir === 'tracks' || dir === 'analysis') {
      const src: Map<string, Track | AnalysisSummary> = dir === 'tracks' ? this.tracks : this.analysis;
      const items: Record<string, unknown> = {};
      // Shared (ADR 0094): this computer's copy and analysis written in, every other computer's kept as read.
      if (m) {
        // Not this folder's to write (ADR 0108): the songs' common parts only, every copy kept as read.
        const w = m.own ? m.here : { ...m.here, me: '' };
        if (dir === 'tracks') for (const [id, t] of this.tracks) { if (shardOf(id) !== key || this.ephemeral.has(id)) continue; const st = toShared(t, w, m.tracks.get(id)); m.tracks.set(id, st); items[id] = st; }
        else for (const [id, t] of this.tracks) {
          if (shardOf(id) !== key || this.ephemeral.has(id)) continue;
          const a = this.analysis.get(id), prev = m.analysis.get(id);
          const by = a && !t.remote ? analysisShared(a, w.me, prev) : prev;
          if (by) { m.analysis.set(id, by); items[id] = by; }
        }
        return { schemaVersion: SCHEMA, items };
      }
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
