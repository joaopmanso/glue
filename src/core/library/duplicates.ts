/* Group tracks that are the same recording (ADR 0013 tier 2, ADR 0025).
   Candidates come from an index of 16-bit pieces of the fingerprint words: two versions of one
   recording share many pieces at a consistent time offset, unrelated tracks only by chance. Each
   candidate pair is then confirmed by bit error rate at the best alignment. */
import { ber, FP_FRAME_SEC, type Fingerprint } from '../audio/fingerprint';

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
