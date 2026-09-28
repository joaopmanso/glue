/* Duplicate groups for the open collection (ADR 0013, 0025):
   - same recording: acoustic fingerprints match (any names, formats, rips);
   - probable: same normalised artist + title and length within 3 s, but no fingerprint match (yet).
   Recomputed after the background analysis settles, and on demand.
   Fast to show (2026-09-27): the last result is kept and shown the moment a collection opens;
   fingerprints come from one pack per shard; only songs fingerprinted since are matched again. */
import { lib } from './library.svelte';
import { cacheDir, cleanDuplicates } from '../platform';
import { readFingerprint, readPacks, writeFingerprint, writePack } from '../store/fingerprints';
import { readJSON, writeJSON } from '../store/fsx';
import { shardOf } from '../store/types';
import { fingerprintOf } from './analysis';
import { jobOf } from './audioJob';
import type { Fingerprint } from '../core/audio/fingerprint';
import type { Match } from '../core/library/duplicates';
import { groupMatches } from '../core/library/duplicates';
import { time, timeAsync } from '../core/perf';
import type { DupReply, DupRequest } from '../workers/duplicates.worker';
import type { AnalysisSummary, Track } from '../store/types';

/** confirmed: a probable group the user said is the same recording (it can be cleaned up like one). */
export interface DupGroup { key: string; kind: 'same' | 'probable'; ids: string[]; best: string; similarity: number | null; confirmed?: boolean }

const GRADE: Record<string, number> = { ok: 3, info: 2, warn: 1, bad: 0 };
/** Higher is better: genuine before suspect, lossless before lossy, then resolution / bitrate. */
export function copyScore(t: Track, a: AnalysisSummary | null): number {
  const f = t.format;
  const q = f ? (f.lossless ? 1e6 + (f.sampleRate / 1000) * (f.bits || 16) : f.bitrate) : 0;
  return (a && !a.error ? GRADE[a.grade] ?? 1 : 1) * 1e7 + q;
}
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\((original|extended|radio|club)?\s*(mix|edit|version)\)|\[[^\]]*\]|\bfeat\.?.*$|\bft\.?.*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const groupKey = (ids: string[]) => [...ids].sort().join('+');
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

  /** Probable groups follow songs' names: after tracks change (info edited, an import), the groups are
      made again from the last matches (no new matching), a moment later. */
  private seenTracks = -1;
  private rebuildTimer = 0;
  constructor() {
    $effect.root(() => {
      $effect(() => {
        void lib.version;
        const st = lib.store;
        if (!st || !this.known || st.rev.tracks === this.seenTracks) return;
        this.seenTracks = st.rev.tracks;
        clearTimeout(this.rebuildTimer);
        this.rebuildTimer = window.setTimeout(() => { if (lib.store === st && !this.running) this.rebuild(); }, 400);
      });
    });
  }

  /** Group of a track, if any (for the table badge). */
  groupOf = $derived.by(() => { const m = new Map<string, DupGroup>(); for (const g of this.groups) for (const id of g.ids) m.set(id, g); return m; });

  schedule(ms = 1500) { clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.scan(), ms); }
  reset() { clearTimeout(this.timer); this.groups = []; this.at = null; this.matches = []; this.known = null; }

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
    this.schedule(300);
  }

  /** `full`: match everything again ("Check again"), not just the songs fingerprinted since. */
  async scan(full = false) {
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
      for (const sh of dirty) await writePack(dir, cid, sh, tracks.filter(x => shardOf(x.id) === sh)).catch(() => {});
    } catch (e) { console.warn('Duplicate scan failed', e); }
    finally { this.running = false; }
    if (this.toFill.length && !this.filling) void this.fill();
  }

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
    const s = lib.store!, ignored = new Set(s.meta.ignoredDupes ?? []), confirmed = new Set(s.meta.dupConfirmed ?? []);
    // The copy the user chose ("Use in playlists"), else the best by quality.
    const best = (ids: string[]) => { const chosen = s.meta.dupBest?.[groupKey(ids)]; return chosen && ids.includes(chosen) ? chosen : ids.reduce((b, id) => copyScore(s.tracks.get(id)!, s.analysis.get(id) ?? null) > copyScore(s.tracks.get(b)!, s.analysis.get(b) ?? null) ? id : b); };
    const out: DupGroup[] = [];
    const inGroup = new Set<string>();
    for (const ids of groupMatches(matches)) {
      const live = ids.filter(id => s.tracks.has(id));
      if (live.length < 2 || ignored.has(groupKey(live))) continue;
      const bers = matches.filter(m => live.includes(m.a) && live.includes(m.b)).map(m => m.ber);
      out.push({ key: groupKey(live), kind: 'same', ids: live, best: best(live), similarity: 1 - 2 * Math.max(...bers) });
      live.forEach(id => inGroup.add(id));
    }
    // Probable: same artist + title, similar length, not already matched by sound.
    const byName = new Map<string, Track[]>();
    for (const t of s.tracks.values()) {
      if (inGroup.has(t.id) || !t.title) continue;
      const k = norm(t.artist) + '|' + norm(t.title);
      if (k.length < 3) continue;
      const g = byName.get(k); if (g) g.push(t); else byName.set(k, [t]);
    }
    for (const g of byName.values()) {
      if (g.length < 2) continue;
      const near = g.filter(t => g.some(u => u !== t && (t.duration == null || u.duration == null || Math.abs(t.duration - u.duration) <= 3)));
      const ids = near.map(t => t.id);
      if (ids.length < 2 || ignored.has(groupKey(ids))) continue;
      const key = groupKey(ids);
      out.push(confirmed.has(key) ? { key, kind: 'same', ids, best: best(ids), similarity: null, confirmed: true } : { key, kind: 'probable', ids, best: best(ids), similarity: null });
    }
    return out.sort((a, b) => (a.kind === b.kind ? b.ids.length - a.ids.length : a.kind === 'same' ? -1 : 1));
  }

  /** The groups again from the last matches (after songs left the collection). */
  rebuild() { if (lib.store) this.groups = this.build(this.matches); }

  /** "Same recording": the user confirms a probable group (remembered); it's cleaned up like one. */
  confirm(g: DupGroup) {
    const s = lib.store;
    if (!s || g.kind !== 'probable') return;
    s.meta.dupConfirmed = [...(s.meta.dupConfirmed ?? []), g.key];
    s.saveMeta();
    this.groups = this.groups.map((x): DupGroup => x.key === g.key ? { ...x, kind: 'same', confirmed: true } : x).sort((a, b) => (a.kind === b.kind ? b.ids.length - a.ids.length : a.kind === 'same' ? -1 : 1));
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
