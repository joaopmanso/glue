/* Group tracks that are the same recording (ADR 0013 tier 2, ADR 0025).
   Candidates come from an index of 16-bit pieces of the fingerprint words: two versions of one
   recording share many pieces at a consistent time offset, unrelated tracks only by chance. Each
   candidate pair is then confirmed by bit error rate at the best alignment. */
import { ber, FP_FRAME_SEC, type Fingerprint } from '../audio/fingerprint';
import type { AnalysisSummary, Track } from '../../store/types';
import { songName, versionOf } from './names';

export const SAME_BER = 0.3;          // at or below: same recording (unrelated audio ≈ 0.5)
export const MIN_OVERLAP_SEC = 20;    // at least this much sound in common
const LOUD_MIN = 64, MAX_RUN = 60;     // skip quiet frames; ignore pieces that are everywhere

export interface Match { a: string; b: string; ber: number; offsetSec: number; overlapSec: number }

export function findSameRecordings(fps: { id: string; fp: Fingerprint }[]): Match[] {
  // Index: (piece, track, frame). Each frame gives two pieces: low 16 bands and high 16 bands.
  let total = 0;
  for (const { fp } of fps) total += fp.words.length * 2;
  const key = new Uint32Array(total), trk = new Int32Array(total), pos = new Int32Array(total);
  let n = 0;
  fps.forEach(({ fp }, t) => {
    for (let i = 0; i < fp.words.length; i++) {
      if (fp.loud[i] < LOUD_MIN) continue;
      const w = fp.words[i];
      key[n] = (w & 0xffff) >>> 0; trk[n] = t; pos[n] = i; n++;
      key[n] = ((w >>> 16) | 0x10000) >>> 0; trk[n] = t; pos[n] = i; n++;   // tagged: high half
    }
  });
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((x, y) => key[x] - key[y]);

  // Votes for (track a, track b, offset b − a).
  const votes = new Map<number, Map<number, number>>();
  for (let s = 0; s < n;) {
    let e = s + 1;
    while (e < n && key[order[e]] === key[order[s]]) e++;
    if (e - s <= MAX_RUN) {
      for (let i = s; i < e; i++) for (let j = i + 1; j < e; j++) {
        let p = order[i], q = order[j];
        if (trk[p] === trk[q]) continue;
        if (trk[p] > trk[q]) { const x = p; p = q; q = x; }
        const pair = trk[p] * 65536 + trk[q], off = pos[q] - pos[p];
        let m = votes.get(pair);
        if (!m) { m = new Map(); votes.set(pair, m); }
        m.set(off, (m.get(off) ?? 0) + 1);
      }
    }
    s = e;
  }

  return confirm(fps, votes);
}

/** The pairs that got votes, checked by bit error rate at their best offsets. */
function confirm(fps: { id: string; fp: Fingerprint }[], votes: Map<number, Map<number, number>>): Match[] {
  const out: Match[] = [];
  const minFrames = MIN_OVERLAP_SEC / FP_FRAME_SEC;
  for (const [pair, m] of votes) {
    // Best offsets, with neighbours pooled (alignment within a frame or two).
    const pooled: [number, number][] = [];
    for (const [off, c] of m) pooled.push([off, c + (m.get(off - 1) ?? 0) + (m.get(off + 1) ?? 0)]);
    pooled.sort((x, y) => y[1] - x[1]);
    if (!pooled.length || pooled[0][1] < 4) continue;
    const a = fps[Math.floor(pair / 65536)], b = fps[pair % 65536];
    let best = { ber: 1, frames: 0, off: 0 };
    for (const [off] of pooled.slice(0, 3)) for (let d = -2; d <= 2; d++) {
      const r = ber(a.fp, b.fp, off + d);
      if (r.frames >= minFrames && r.ber < best.ber) best = { ...r, off: off + d };
    }
    if (best.ber <= SAME_BER) out.push({ a: a.id, b: b.id, ber: best.ber, offsetSec: best.off * FP_FRAME_SEC, overlapSec: best.frames * FP_FRAME_SEC });
  }
  return out.sort((x, y) => x.ber - y.ber);
}

/** The matches involving the `fresh` songs (with every other song, and among themselves): the same ones
    findSameRecordings finds for those pairs, without sorting every piece of the collection again
    (2026-09-27). A piece's key is 17 bits, so pieces are counted per key, and only the fresh songs'
    pieces are indexed. */
export function findMatchesFor(fps: { id: string; fp: Fingerprint }[], fresh: Set<string>): Match[] {
  const KEYS = 1 << 17, count = new Uint32Array(KEYS);
  const isFresh = fps.map(x => fresh.has(x.id));
  for (const { fp } of fps) for (let i = 0; i < fp.words.length; i++) {
    if (fp.loud[i] < LOUD_MIN) continue;
    const w = fp.words[i];
    count[w & 0xffff]++; count[(w >>> 16) | 0x10000]++;
  }
  // The fresh songs' pieces by key (only keys rare enough to count), as start offsets into two arrays.
  const start = new Uint32Array(KEYS + 1);
  const each = (t: number, fn: (key: number, pos: number) => void) => {
    const fp = fps[t].fp;
    for (let i = 0; i < fp.words.length; i++) {
      if (fp.loud[i] < LOUD_MIN) continue;
      const w = fp.words[i], lo = w & 0xffff, hi = (w >>> 16) | 0x10000;
      if (count[lo] >= 2 && count[lo] <= MAX_RUN) fn(lo, i);
      if (count[hi] >= 2 && count[hi] <= MAX_RUN) fn(hi, i);
    }
  };
  fps.forEach((_, t) => { if (isFresh[t]) each(t, k => { start[k + 1]++; }); });
  for (let k = 0; k < KEYS; k++) start[k + 1] += start[k];
  const fill = start.slice(0, KEYS), ft = new Int32Array(start[KEYS]), fpos = new Int32Array(start[KEYS]);
  fps.forEach((_, t) => { if (isFresh[t]) each(t, (k, i) => { const j = fill[k]++; ft[j] = t; fpos[j] = i; }); });
  // Votes, as in findSameRecordings: every pair of pieces with the same key, once.
  const votes = new Map<number, Map<number, number>>();
  fps.forEach((_, t) => each(t, (k, i) => {
    for (let j = start[k]; j < start[k + 1]; j++) {
      const f = ft[j];
      if (f === t || (isFresh[t] && f > t)) continue;   // fresh with fresh: counted from one side
      const [a, pa, b, pb] = f < t ? [f, fpos[j], t, i] : [t, i, f, fpos[j]];
      const pair = a * 65536 + b, off = pb - pa;
      let m = votes.get(pair);
      if (!m) { m = new Map(); votes.set(pair, m); }
      m.set(off, (m.get(off) ?? 0) + 1);
    }
  }));
  return confirm(fps, votes);
}

/** Connected groups of matching tracks (union–find). */
export function groupMatches(matches: Match[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  for (const { a, b } of matches) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, string[]>();
  for (const x of parent.keys()) { const r = find(x); const g = groups.get(r); if (g) g.push(x); else groups.set(r, [x]); }
  return [...groups.values()].filter(g => g.length > 1);
}

/** Lengths close enough for one recording: 10 s apart at most, or 6 % on long songs (a rip trimmed of its
    silence, not a radio edit against its extended mix). Unknown lengths pass. */
export function similarLength(a: number | null | undefined, b: number | null | undefined): boolean {
  if (!a || !b) return true;
  return Math.abs(a - b) <= Math.max(10, 0.06 * Math.max(a, b));
}
type Songish = { title: string; album: string; duration: number | null };
/** Two copies that could be the same recording: the same version words, and lengths close enough. */
export const sameVersion = (a: Songish, b: Songish) => versionOf(a.title, a.album) === versionOf(b.title, b.album) && similarLength(a.duration, b.duration);
/** A pair of songs, either way round. */
export const pairKey = (a: string, b: string) => a < b ? a + '+' + b : b + '+' + a;

type Copy = { title: string; album: string; artist: string; duration: number | null; fileName: string };
/** Copies "probably the same song" share this: artist and title (names.ts `songName`). */
export const nameKey = (t: { artist?: string | null; title?: string | null }) => songName(t.artist) + '|' + songName(t.title);
/** Songs probably of one recording by their names ("probable"): the same `nameKey`, then split into copies of the same
    version within 3 s of each other (unknown lengths pass), so a title's remix, a cappella and original mix are
    three groups, not one (each had a twin of its own length; measured on the user's collection, 2026-10-02).
    `apart`: pairs the user kept apart. */
export function nameGroups<T extends Songish & { artist: string }>(tracks: Iterable<T>, apart: (a: T, b: T) => boolean = () => false): T[][] {
  const byKey = new Map<string, T[]>();
  for (const t of tracks) {
    if (!t.title) continue;
    const k = nameKey(t);
    if (k.length < 3) continue;
    const g = byKey.get(k); if (g) g.push(t); else byKey.set(k, [t]);
  }
  const near = (t: T, u: T) => (t.duration == null || u.duration == null || Math.abs(t.duration - u.duration) <= 3) && sameVersion(t, u) && !apart(t, u);
  const out: T[][] = [];
  for (const g of byKey.values()) {
    if (g.length < 2) continue;
    const left = new Set(g);
    for (const t of g) {
      if (!left.delete(t)) continue;
      const part = [t];
      for (let i = 0; i < part.length; i++) for (const u of left) if (near(part[i], u)) { left.delete(u); part.push(u); }
      if (part.length > 1) out.push(part);
    }
  }
  return out;
}
const stem = (f: string) => (f || '').replace(/\.[^.]+$/, '');
/** How sure GLUE is that a group's copies are one recording, 0–100 (the user, 2026-09-30: "choose all over 95 %"):
    - by the user's say-so (marked, or confirmed): 100;
    - by sound: from the fingerprint similarity (1 − 2 × bit error rate; matches start at 0.4, identical is 1),
      60 at the weakest match to 100, less 10 when the names disagree and 10 when the lengths spread over 2 s;
    - by name only ("probable"): 50, or 60 with lengths within a second. */
export function certainty(kind: 'same' | 'probable', similarity: number | null, said: boolean, copies: Copy[]): number {
  if (said) return 100;
  const lens = copies.map(c => c.duration).filter((d): d is number => !!d), spread = lens.length > 1 ? Math.max(...lens) - Math.min(...lens) : 0;
  if (kind === 'probable') return spread <= 1 ? 60 : 50;
  const names = new Set(copies.map(c => songName(c.artist) + '|' + songName(c.title || stem(c.fileName))));
  let c = 60 + 40 * Math.max(0, Math.min(1, ((similarity ?? 0.4) - 0.4) / 0.55));
  if (names.size > 1) c -= 10;
  if (spread > 2) c -= 10;
  return Math.max(0, Math.min(100, Math.round(c)));
}
/** What to look at before removing a group's copies in bulk (the user: "if one copy says instrumental on the title
    and the other doesn't"): version words in the title or the file name that differ, lengths more than 3 s apart,
    other artists. Nothing: nothing to look at. */
export function concerns(copies: Copy[]): string[] {
  const out: string[] = [];
  const marks = copies.map(c => [...new Set([...versionOf(c.title, c.album).split(','), ...versionOf(stem(c.fileName)).split(',')].filter(Boolean))].sort().join(', '));
  if (new Set(marks).size > 1) out.push('versions differ: ' + [...new Set(marks.map(m => m || 'none'))].join(' / '));
  const lens = copies.map(c => c.duration).filter((d): d is number => !!d);
  if (lens.length > 1 && Math.max(...lens) - Math.min(...lens) > 3) out.push('lengths differ by ' + Math.round(Math.max(...lens) - Math.min(...lens)) + ' s');
  const artists = new Set(copies.map(c => songName(c.artist)).filter(Boolean));
  if (artists.size > 1) out.push('other artists');
  return out;
}

const GRADE: Record<string, number> = { ok: 3, info: 2, warn: 1, bad: 0 };
/** Higher is better: genuine before suspect, lossless before lossy, then a copy in the user's main music folder
    (ADR 0121: lossless still comes first, so a lossless copy elsewhere beats an MP3 there), then resolution /
    bitrate. */
export function copyScore(t: Track, a: AnalysisSummary | null, mainRoot?: string | null): number {
  const f = t.format;
  const q = f ? (f.lossless ? 1e6 + (f.sampleRate / 1000) * (f.bits || 16) : f.bitrate) : 0;
  const main = mainRoot && t.rootId === mainRoot ? 5e5 : 0;   // over any resolution (≤ 6,144) or bitrate, under lossless
  return (a && !a.error ? GRADE[a.grade] ?? 1 : 1) * 1e7 + q + main;
}
