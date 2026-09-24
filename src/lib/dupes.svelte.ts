/* Duplicate groups for the open collection (ADR 0013, 0025):
   - same recording: acoustic fingerprints match (any names, formats, rips);
   - probable: same normalised artist + title and length within 3 s, but no fingerprint match (yet).
   Recomputed after the background analysis settles, and on demand. */
import { lib } from './library.svelte';
import { cacheDir } from '../platform';
import { readFingerprint } from '../store/fingerprints';
import type { Fingerprint } from '../core/audio/fingerprint';
import type { Match } from '../core/library/duplicates';
import { groupMatches } from '../core/library/duplicates';
import type { DupReply, DupRequest } from '../workers/duplicates.worker';
import type { AnalysisSummary, Track } from '../store/types';

export interface DupGroup { key: string; kind: 'same' | 'probable'; ids: string[]; best: string; similarity: number | null }

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

class Dupes {
  groups = $state.raw<DupGroup[]>([]);
  running = $state(false);
  at = $state<number | null>(null);
  private worker: Worker | null = null;
  private reqId = 0;
  private timer = 0;

  /** Group of a track, if any (for the table badge). */
  groupOf = $derived.by(() => { const m = new Map<string, DupGroup>(); for (const g of this.groups) for (const id of g.ids) m.set(id, g); return m; });

  schedule(ms = 1500) { clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.scan(), ms); }
  reset() { clearTimeout(this.timer); this.groups = []; this.at = null; }

  async scan() {
    const s = lib.store, dir = await cacheDir();
    if (!s || !dir || this.running) return;
    this.running = true;
    try {
      const cid = s.meta.id, tracks: { id: string; fp: Fingerprint }[] = [];
      for (const t of s.tracks.values()) {
        if (!s.analysis.get(t.id)?.fp) continue;
        const fp = await readFingerprint(dir, cid, t.id);
        if (fp && fp.words.length) tracks.push({ id: t.id, fp });
      }
      const matches = tracks.length > 1 ? await this.match(tracks) : [];
      if (lib.store !== s) return;
      this.groups = this.build(matches);
      this.at = Date.now();
    } catch (e) { console.warn('Duplicate scan failed', e); }
    finally { this.running = false; }
  }

  private match(tracks: { id: string; fp: Fingerprint }[]): Promise<Match[]> {
    this.worker ??= new Worker(new URL('../workers/duplicates.worker.ts', import.meta.url), { type: 'module' });
    const id = ++this.reqId, w = this.worker;
    return new Promise((resolve, reject) => {
      const on = (e: MessageEvent<DupReply>) => {
        if (e.data.id !== id) return;
        w.removeEventListener('message', on);
        if ('error' in e.data) reject(new Error(e.data.error)); else resolve(e.data.matches);
      };
      w.addEventListener('message', on);
      w.postMessage({ id, tracks } satisfies DupRequest);
    });
  }

  private build(matches: Match[]): DupGroup[] {
    const s = lib.store!, ignored = new Set(s.meta.ignoredDupes ?? []);
    const best = (ids: string[]) => ids.reduce((b, id) => copyScore(s.tracks.get(id)!, s.analysis.get(id) ?? null) > copyScore(s.tracks.get(b)!, s.analysis.get(b) ?? null) ? id : b);
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
      out.push({ key: groupKey(ids), kind: 'probable', ids, best: best(ids), similarity: null });
    }
    return out.sort((a, b) => (a.kind === b.kind ? b.ids.length - a.ids.length : a.kind === 'same' ? -1 : 1));
  }

  /** "Not duplicates": remember and hide this group. */
  ignore(g: DupGroup) {
    const s = lib.store;
    if (!s) return;
    s.meta.ignoredDupes = [...(s.meta.ignoredDupes ?? []), g.key];
    s.saveMeta();
    this.groups = this.groups.filter(x => x.key !== g.key);
  }
  /** Point every playlist at one copy (keeping each list's order; a list never gets it twice). */
  useCopy(g: DupGroup, keep: string) {
    const s = lib.store;
    if (!s) return 0;
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
lib.onOpened = () => { dupes.reset(); dupes.schedule(300); };
lib.onSettled = () => dupes.schedule();
