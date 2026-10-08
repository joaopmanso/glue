/* Duplicate groups for the open collection (ADR 0013, 0025):
   - same recording: acoustic fingerprints match (any names, formats, rips);
   - probable: same normalised artist + title and length within 3 s, but no fingerprint match (yet).
   Recomputed after the background analysis settles, and on demand.
   Fast to show (2026-09-27): the last result is kept and shown the moment a collection opens;
   fingerprints come from one pack per shard; only songs fingerprinted since are matched again. */
import { lib } from './library.svelte';
import { cacheDir, cleanDuplicates } from '../platform';
import { readFingerprint, readPacks, writeFingerprint, writePack } from '../store/fingerprints';
import { listNames, readJSON, writeJSON } from '../store/fsx';
import { shardOf } from '../store/types';
import { fingerprintOf } from './analysis';
import { jobOf } from './audioJob';
import type { Fingerprint } from '../core/audio/fingerprint';
import type { Match } from '../core/library/duplicates';
import { bestLists, buildGroups, copyScore, groupKey, pairKey, type DupGroup } from '../core/library/duplicates';
export { copyScore };
import { time, timeAsync } from '../core/perf';
import type { DupReply, DupRequest } from '../workers/duplicates.worker';
import type { AnalysisSummary, Track } from '../store/types';
import { engineClient } from './engine.svelte';

export type { DupGroup };
export { groupKey };
/** The last result, kept per collection: the songs that had a fingerprint, and what matched. */
interface Saved { v: 1; at: number; ids: string[]; matches: Match[] }
const savedPath = (cid: string) => 'dupes/' + cid + '.json';

class Dupes {
  groups = $state.raw<DupGroup[]>([]);
  running = $state(false);
  at = $state<number | null>(null);
  /** Analysed songs whose fingerprint isn't in this browser (analysed in another browser, or on
      another computer: fingerprints stay where they were made). They're made again here. */
  missing = $state(0);
  filled = $state(0);
  filling = $state(false);
  private toFill: string[] = [];
  private worker: Worker | null = null;
  private reqId = 0;
  private timer = 0;
  /** What the last match found, and for which songs (to match only the new ones next time). */
  private matches: Match[] = [];
  private known: Set<string> | null = null;
  /** A shared collection's other computers' matches (ADR 0098): their songs' fingerprints stay there, so
      each computer publishes what it found among its own songs. */
  private others: Match[] = [];
  /** Told when this computer's matches were published (the shared sync sends them). */
  onPublished: (() => void) | null = null;

  /** Probable groups follow songs' names: after tracks change (info edited, an import), the groups are
      made again from the last matches (no new matching), a moment later. */
  private seenTracks = -1;
  private rebuildTimer = 0;
  constructor() {
    // Every playlist uses each song's best copy (the user, 2026-09-30: "there is no scenario where we have a best
    // copy but another copy is in use in playlists"), an imported one too: rewritten whenever the groups change.
    $effect.root(() => { $effect(() => { const gs = this.groups; queueMicrotask(() => this.bestInLists(gs)); }); });
    $effect.root(() => {
      $effect(() => {
        void lib.version;
        const st = lib.store;
        if (!st || !this.known || st.rev.tracks === this.seenTracks) return;
        this.seenTracks = st.rev.tracks;
        clearTimeout(this.rebuildTimer);
        this.rebuildTimer = window.setTimeout(() => { if (lib.store === st && !this.running && !lib.homeRuns()) this.rebuild(); }, 400);
      });
    });
  }

  /** The copies not shown in the collection's lists: in a "same recording" group, every copy but the best
      (the user, 2026-09-29: one row per song, its best copy, with the N× badge). */
  hidden = $derived.by(() => { const h = new Set<string>(); for (const g of this.groups) if (g.kind === 'same') for (const id of g.ids) if (id !== g.best) h.add(id); return h; });
  /** Group of a track, if any (for the table badge). */
  groupOf = $derived.by(() => { const m = new Map<string, DupGroup>(); for (const g of this.groups) for (const id of g.ids) m.set(id, g); return m; });

  schedule(ms = 1500) { clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.scan(), ms); }
  reset() { clearTimeout(this.timer); this.groups = []; this.at = null; this.matches = []; this.known = null; this.others = []; }

  /** Where a shared collection's published matches are, and this computer's name among its members. */
  private published() {
    const s = lib.store, root = lib.homeHandle, p = lib.profile;
    if (!s?.shared || !root || !p) return null;
    return { s, root, dir: `profiles/${p.id}/collections/${s.meta.id}/dupes`, me: s.shared.here.me };
  }
  /** The other computers' matches, read again (after a sync brought new ones). */
  async loadOthers() {
    const at = this.published();
    if (!at) { this.others = []; return; }
    const out: Match[] = [];
    for (const n of await listNames(at.root, at.dir, 'file').catch(() => [] as string[])) {
      if (n === at.me + '.json' || !n.endsWith('.json')) continue;
      const f = await readJSON<{ v: number; matches: Match[] }>(at.root, at.dir + '/' + n).catch(() => null);
      if (f?.v === 1 && Array.isArray(f.matches)) out.push(...f.matches);
    }
    if (lib.store !== at.s) return;
    this.others = out;
    if (this.known) this.rebuild();
  }

  /** A collection opened: its last result at once, then a check for what changed since. */
  async open() {
    const s = lib.store, dir = await cacheDir();
    if (s && dir) {
      const saved = await readJSON<Saved>(dir, savedPath(s.meta.id)).catch(() => null);
      if (saved?.v === 1 && lib.store === s && !this.known) {
        this.matches = saved.matches; this.known = new Set(saved.ids);
        this.groups = time('dupes.build', () => this.build(saved.matches));
        this.at = saved.at;
      }
    }
    await this.loadOthers();
    this.schedule(300);
  }

  /** `full`: match everything again ("Check again"), not just the songs fingerprinted since. */
  async scan(full = false) {
    // GLUE Home is the app (ADR 0162): it matches its songs' fingerprints, the page shows what it found (ADR 0164).
    if (lib.homeRuns()) { await this.fromHome(full); return; }
    const s = lib.store, dir = await cacheDir();
    if (!s || !dir || this.running) return;
    this.running = true;
    if (full) this.known = null;
    try {
      const cid = s.meta.id, tracks: { id: string; fp: Fingerprint }[] = [], without: string[] = [];
      // Fingerprints: the packs first, then the single files of songs fingerprinted since (8 at a time).
      const packed = await timeAsync('dupes.read', () => readPacks(dir, cid)), loose: string[] = [];
      for (const t of s.tracks.values()) {
        const a = s.analysis.get(t.id);
        if (!a || a.error || t.remote || s.ephemeral.has(t.id)) continue;
        const fp = a.fp ? packed.get(t.id) : null;
        if (fp && fp.words.length) tracks.push({ id: t.id, fp });
        else if (a.fp) loose.push(t.id); else without.push(t.id);
      }
      const dirty = new Set<string>();
      let i = 0;
      await Promise.all(Array.from({ length: 8 }, async () => {
        for (let id = loose[i++]; id !== undefined; id = loose[i++]) {
          const fp = await readFingerprint(dir, cid, id);
          if (fp && fp.words.length) { tracks.push({ id, fp }); dirty.add(shardOf(id)); } else without.push(id);
        }
      }));
      if (lib.store !== s) return;
      this.toFill = without; this.missing = without.length;
      // Matching: only the songs fingerprinted since the last result, against all of them.
      const ids = new Set(tracks.map(x => x.id)), known = this.known;
      let matches: Match[];
      if (known) {
        const fresh = new Set([...ids].filter(id => !known.has(id)));
        const kept = this.matches.filter(m => ids.has(m.a) && ids.has(m.b));
        matches = fresh.size ? kept.concat(await this.match(tracks, fresh)) : kept;
      } else matches = tracks.length > 1 ? await this.match(tracks) : [];
      if (lib.store !== s) return;
      const changed = !known || known.size !== ids.size || [...ids].some(id => !known.has(id)) || matches.length !== this.matches.length;
      this.matches = matches; this.known = ids;
      if (changed || !this.at) this.groups = time('dupes.build', () => this.build(matches));
      this.at = Date.now();
      // Kept for next time: the result, and the packs of shards that had songs outside them.
      if (changed) await writeJSON(dir, savedPath(cid), { v: 1, at: this.at, ids: [...ids], matches } satisfies Saved).catch(() => {});
      // A shared collection: what this computer found, for the others (only its own songs are in it).
      const pub = this.published();
      if (pub && pub.s === s && (changed || !await readJSON(pub.root, `${pub.dir}/${pub.me}.json`).catch(() => null))) {
        await writeJSON(pub.root, `${pub.dir}/${pub.me}.json`, { v: 1, at: this.at, matches }).catch(e => console.warn('GLUE: couldn’t publish the duplicates', e));
        this.onPublished?.();
      }
      for (const sh of dirty) await writePack(dir, cid, sh, tracks.filter(x => shardOf(x.id) === sh)).catch(() => {});
    } catch (e) { console.warn('Duplicate scan failed', e); }
    finally { this.running = false; }
    if (this.toFill.length && !this.filling) void this.fill();
  }

  /** What GLUE Home found (ADR 0164): its last result, or matched now (`full`: "Check again"). */
  async fromHome(full = false) {
    const s = lib.store;
    if (!s) return;
    if (this.fetching && !full) { this.askAgain = true; return; }   // told again while asking: asked once more after
    // Only "Check again" is the user's wait ("Comparing…"); asking for GLUE Home's last result is quick, and mustn't
    // grey the button out under the user's click.
    this.fetching = true;
    if (full) this.running = true;
    try {
      const r = await engineClient.dupes(full).catch(e => { console.warn('GLUE: GLUE Home couldn’t say what duplicates it found', e); return null; });
      if (!r || lib.store !== s) return;
      this.toFill = []; this.missing = r.missing ?? 0;
      this.matches = r.matches; this.known = new Set(r.matches.flatMap(m => [m.a, m.b])); this.at = r.at;
      // Its groups too (0.62, ADR 0164); from an older GLUE Home, made here from its matches.
      this.groups = r.groups ?? time('dupes.build', () => this.build(r.matches));
    } finally {
      this.fetching = false;
      if (full) this.running = false;
      if (this.askAgain) { this.askAgain = false; void this.fromHome(); }
    }
  }
  private fetching = false;
  private askAgain = false;

  /** Make the missing fingerprints, one song at a time (just the fingerprint, not a full analysis),
      looking for duplicates again every 100 made and at the end. Only when some were made: songs whose
      file can't be read now stay without one, and must not start the scan over and over. */
  private async fill() {
    const s = lib.store, dir = await cacheDir();
    if (!s || !dir || this.filling) return;
    this.filling = true; this.filled = 0;
    let made = 0;
    try {
      for (const id of this.toFill) {
        if (lib.store !== s) return;
        const t = s.tracks.get(id);
        if (!t || !lib.canRead(t)) continue;
        try {
          const fp = await fingerprintOf(jobOf(await lib.fileFor(t)));
          if (lib.store !== s) return;
          await writeFingerprint(dir, s.meta.id, id, fp);
          const a = s.analysis.get(id);
          if (a && !a.fp) s.putAnalysis(id, { ...a, fp: true });
          made++;
        } catch (e) { console.warn('Couldn’t fingerprint', t.fileName, e); }
        this.filled++;
        if (made && made % 100 === 0) { this.toFill = []; this.filling = false; await this.scan(); return; }
      }
      this.toFill = [];
    } finally { this.filling = false; }
    if (made) await this.scan();
  }

  private match(tracks: { id: string; fp: Fingerprint }[], fresh?: Set<string>): Promise<Match[]> {
    this.worker ??= new Worker(new URL('../workers/duplicates.worker.ts', import.meta.url), { type: 'module' });
    const id = ++this.reqId, w = this.worker;
    return new Promise((resolve, reject) => {
      const on = (e: MessageEvent<DupReply>) => {
        if (e.data.id !== id) return;
        w.removeEventListener('message', on);
        if ('error' in e.data) reject(new Error(e.data.error)); else resolve(e.data.matches);
      };
      w.addEventListener('message', on);
      w.postMessage({ id, tracks, fresh: fresh ? [...fresh] : undefined } satisfies DupRequest);
    });
  }

  private build(matches: Match[]): DupGroup[] {
    const s = lib.store!;
    return buildGroups({ tracks: s.tracks, analysis: s.analysis, meta: s.meta, matches, others: this.others });
  }

  /** The groups again from the last matches (after songs left the collection). */
  rebuild() { if (lib.store && !lib.homeRuns()) this.groups = this.build(this.matches); }   // with GLUE Home: its groups, through its feed

  /** "Same recording": the user confirms a probable group (remembered); it's cleaned up like one. */
  confirm(g: DupGroup) {
    const s = lib.store;
    if (!s || g.kind !== 'probable') return;
    s.meta.dupConfirmed = [...(s.meta.dupConfirmed ?? []), g.key];
    s.saveMeta();
    this.groups = this.groups.map((x): DupGroup => x.key === g.key ? { ...x, kind: 'same', confirmed: true, how: 'confirmed', sure: 100 } : x).sort((a, b) => (a.kind === b.kind ? b.ids.length - a.ids.length : a.kind === 'same' ? -1 : 1));
  }
  /** The best copy for each "same recording" copy (the copies that don't show in the library). */
  bestOf = $derived.by(() => { const m = new Map<string, string>(); for (const g of this.groups) if (g.kind === 'same') for (const id of g.ids) if (id !== g.best) m.set(id, g.best); return m; });
  /** Playlists and folders point at the best copies (their order kept; never the same song twice). */
  private bestInLists(gs: DupGroup[]) {
    const s = lib.store;
    // With GLUE Home, it points the playlists at the best copies (ADR 0164).
    if (!s || lib.readOnly || gs !== this.groups || lib.homeRuns()) return;
    for (const l of bestLists(s.lists.values(), gs)) lib.updateList(l.id, { items: l.items });
  }
  /** The main music folder (ADR 0121), or none: the best copies are chosen again, and playlists follow. */
  setMainRoot(id: string | null) {
    const s = lib.store;
    if (!s || lib.readOnly) return;
    if (id) s.meta.mainRoot = id; else delete s.meta.mainRoot;
    s.saveMeta();
    this.rebuild();
    lib.version++;
  }
  /** "Keep · not a duplicate" (ADR 0117): this copy isn't a duplicate of the others in its group (another version),
      remembered pair by pair; the rest of the group stays, to be cleaned up. */
  apart(g: DupGroup, id: string) {
    const s = lib.store;
    if (!s || lib.readOnly) return;
    const pairs = new Set(s.meta.dupApart ?? []);
    for (const o of g.ids) if (o !== id) pairs.add(pairKey(id, o));
    s.meta.dupApart = [...pairs];
    s.meta.dupManual = (s.meta.dupManual ?? []).map(m => m.includes(id) ? m.filter(x => x !== id) : m).filter(m => m.length > 1);
    s.saveMeta();
    this.rebuild();
  }
  /** "Mark as duplicates" (ADR 0117): the selected songs are one recording, by the user's say-so (with any group
      they're already in); cleaned up like one. */
  markSame(ids: string[]) {
    const s = lib.store, set = new Set(ids);
    if (!s || lib.readOnly || set.size < 2) return;
    const keep: string[][] = [];
    for (const m of s.meta.dupManual ?? []) if (m.some(x => set.has(x))) m.forEach(x => set.add(x)); else keep.push(m);
    s.meta.dupManual = [...keep, [...set]];
    s.meta.dupApart = (s.meta.dupApart ?? []).filter(k => { const [a, b] = k.split('+'); return !(set.has(a) && set.has(b)); });
    s.saveMeta();
    this.rebuild();
  }
  /** "Not duplicates": remember and hide this group. */
  ignore(g: DupGroup) {
    const s = lib.store;
    if (!s) return;
    s.meta.ignoredDupes = [...(s.meta.ignoredDupes ?? []), g.key];
    s.saveMeta();
    this.groups = this.groups.filter(x => x.key !== g.key);
  }
  /** Point every playlist at one copy (keeping each list's order; a list never gets it twice). That copy
      becomes the group's best, the one a clean-up keeps (remembered). */
  useCopy(g: DupGroup, keep: string) {
    const s = lib.store;
    if (!s) return 0;
    if (g.best !== keep) {
      s.meta.dupBest = { ...s.meta.dupBest, [g.key]: keep }; s.saveMeta();
      this.groups = this.groups.map(x => x.key === g.key ? { ...x, best: keep } : x);
    }
    const others = new Set(g.ids.filter(id => id !== keep));
    let changed = 0;
    for (const l of [...s.lists.values()]) {
      if (!l.items.some(i => others.has(i))) continue;
      const items: string[] = [];
      for (const i of l.items) { const v = others.has(i) ? keep : i; if (!items.includes(v)) items.push(v); }
      lib.updateList(l.id, { items }); changed++;
    }
    return changed;
  }
}

export const dupes = new Dupes();
lib.onOpened = () => { dupes.reset(); void dupes.open(); };
lib.onSettled = () => dupes.schedule();
// With GLUE Home: when it attaches, and when it found duplicates again or another computer's came in (ADR 0164).
engineClient.onFeed.push(paths => { if (lib.homeRuns() && (!paths || paths.some(p => p.startsWith('dupes')))) void dupes.fromHome(); });

/** Keep each group's best copy and put the others aside in GLUE Home's duplicates folder, or into the
    Recycle Bin (ADR 0070). Only "same recording" groups, only files on this computer. The files go
    first; each copy that went folds into the best one (playlists, DJ libraries' records, rating,
    notes, tags, Prepare), so a copy whose file couldn't be moved changes nothing. */
export async function cleanUp(gs: DupGroup[], mode: 'move' | 'trash'): Promise<{ done: number; bytes: number; failed: { name: string; error: string }[] }> {
  const s = lib.store;
  if (!s) return { done: 0, bytes: 0, failed: [] };
  const plan = cleanUpPlan(gs);
  const results = await cleanDuplicates(mode, plan.map(p => ({ root: lib.rootState(p.t.rootId)!.root, path: p.t.relPath! })));
  const into = new Map<string, Track>(), failed: { name: string; error: string }[] = [];
  let bytes = 0;
  plan.forEach((p, i) => {
    if (results[i]?.ok) { into.set(p.t.id, p.best); bytes += p.t.size ?? 0; }
    else failed.push({ name: p.t.fileName, error: results[i]?.error ?? 'GLUE Home didn’t say' });
  });
  await lib.foldCopies(into);
  dupes.rebuild();
  return { done: into.size, bytes, failed };
}
/** What a clean-up would take away: each group's other copies with a file on this computer. */
export function cleanUpPlan(gs: DupGroup[]): { t: Track; best: Track; group: DupGroup }[] {
  const s = lib.store, out: { t: Track; best: Track; group: DupGroup }[] = [];
  if (!s) return out;
  for (const g of gs) {
    if (g.kind !== 'same') continue;
    const best = s.tracks.get(g.best);
    if (!best) continue;
    for (const id of g.ids) {
      const t = s.tracks.get(id);
      if (t && id !== g.best && t.status === 'linked' && !t.remote && t.rootId && t.relPath && lib.rootState(t.rootId)) out.push({ t, best, group: g });
    }
  }
  return out;
}
