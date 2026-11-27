/* The set's tempo map (ADR 0199): BPM as a function of the mix beat, linear between knots, and the seconds of each mix
   beat (and back), in closed form. Pure. */
import type { SetPlan } from './types';

export interface Knot { beat: number; bpm: number }

/** The knots of a plan. 'fixed': one BPM. 'songs': each hand-over at the outgoing song's BPM, eased from one hand-over
    to the next over the song between them. */
export function knotsOf(plan: Pick<SetPlan, 'tempo' | 'items'>): Knot[] {
  const it = plan.items;
  if (!it.length) return [{ beat: 0, bpm: plan.tempo.bpm || 120 }];
  if (plan.tempo.mode === 'fixed') return [{ beat: 0, bpm: plan.tempo.bpm || it[0].bpm }];
  const k: Knot[] = [{ beat: it[0].start, bpm: it[0].bpm }];
  for (let i = 0; i + 1 < it.length; i++) {
    const a = it[i], b = it[i + 1], s = b.start, e = Math.max(s, a.start + a.beats);
    // The hand-over holds the outgoing song's tempo; before it, the tempo eases into it. A cut (no overlap) jumps to the
    // incoming song's tempo, from which it eases on.
    if (e > s) k.push({ beat: s, bpm: a.bpm }, { beat: e, bpm: a.bpm });
    else k.push({ beat: s, bpm: a.bpm }, { beat: s, bpm: b.bpm });
  }
  const last = it[it.length - 1];
  k.push({ beat: last.start + last.beats, bpm: last.bpm });
  // In order of beats (stable: a jump's two knots keep theirs); the same knot twice once.
  const out: Knot[] = [];
  for (const x of k.sort((p, q) => p.beat - q.beat)) {
    const y = out[out.length - 1];
    if (y && Math.abs(x.beat - y.beat) < 1e-9 && Math.abs(x.bpm - y.bpm) < 1e-9) continue;
    if (y && x.beat < y.beat) continue;
    out.push(x);
  }
  return out;
}

/** A tempo map: BPM at a beat, the time of a beat, the beat at a time. */
export class TempoMap {
  private k: Knot[];
  private t: number[];   // the time of each knot
  constructor(knots: Knot[]) {
    this.k = knots.length ? knots : [{ beat: 0, bpm: 120 }];
    // Beat 0 is time 0; before the first knot the tempo is the first knot's.
    this.t = [60 * this.k[0].beat / this.k[0].bpm];
    for (let i = 1; i < this.k.length; i++) this.t[i] = this.t[i - 1] + this.span(this.k[i - 1].bpm, this.k[i].bpm, this.k[i].beat - this.k[i - 1].beat);
  }
  /** Seconds to go `db` beats while the tempo goes linearly (in beats) from b0 to b1. */
  private span(b0: number, b1: number, db: number): number {
    if (db === 0) return 0;
    const k = (b1 - b0) / db;
    return Math.abs(k) < 1e-12 ? 60 * db / b0 : 60 / k * Math.log(b1 / b0);
  }
  private idx(beat: number) { let i = 0; while (i + 1 < this.k.length && this.k[i + 1].beat <= beat) i++; return i; }
  bpmAt(beat: number): number {
    const k = this.k, i = this.idx(beat);
    if (i + 1 >= k.length || beat < k[0].beat) return beat < k[0].beat ? k[0].bpm : k[k.length - 1].bpm;
    const a = k[i], b = k[i + 1];
    return a.bpm + (b.bpm - a.bpm) * (beat - a.beat) / (b.beat - a.beat);
  }
  /** The time (s) of a mix beat. */
  time(beat: number): number {
    const k = this.k;
    if (beat < k[0].beat) return this.t[0] - 60 * (k[0].beat - beat) / k[0].bpm;
    const i = this.idx(beat);
    return this.t[i] + this.span(k[i].bpm, this.bpmAt(beat), beat - k[i].beat);
  }
  /** The mix beat at a time (s). */
  beat(time: number): number {
    const k = this.k, t = this.t;
    if (time < t[0]) return k[0].beat - (t[0] - time) * k[0].bpm / 60;
    let i = 0;
    while (i + 1 < k.length && t[i + 1] <= time) i++;
    const a = k[i], dt = time - t[i];
    if (i + 1 >= k.length) return a.beat + dt * a.bpm / 60;
    const b = k[i + 1], kk = (b.bpm - a.bpm) / (b.beat - a.beat);
    if (Math.abs(kk) < 1e-12) return a.beat + dt * a.bpm / 60;
    // bpm(x) = a.bpm + kk·x; t = 60/kk · ln(bpm/a.bpm) ⇒ x = a.bpm · (e^{kk·t/60} − 1) / kk.
    return a.beat + a.bpm * (Math.exp(kk * dt / 60) - 1) / kk;
  }
}

/** A plan's tempo map. */
export const tempoOf = (plan: Pick<SetPlan, 'tempo' | 'items'>) => new TempoMap(knotsOf(plan));
