/* The set's mixer (ADR 0199): the same engine for the exported file and the preview. It renders in fixed hops counted
   from the set's start, so blocks of any size give the same samples; seeking starts the hops again from there.
   Each song: its PCM at the mix rate, read at the position its beats ask (varispeed, or WSOLA with key lock), its trim,
   the isolator, the filter, the echo and the volume of its hand-overs; then the decks summed into a limiter. */
import { controlsAt } from './automation';
import { cubicAt, Echo, Isolator, Limiter, OneKnob, Wsola } from './dsp';
import { tempoOf, type TempoMap } from './tempo';
import { MIX_RATE, type SetItem, type SetPlan } from './types';

export interface Pcm { l: Float32Array; r: Float32Array }
/** The songs' audio at MIX_RATE, when it's there (null: not yet, or not decodable: silence). */
export interface Sources { get(id: string): Pcm | null }

const H = Wsola.H, TAIL = 3;

interface Deck { ws: Wsola; isoL: Isolator; isoR: Isolator; fL: OneKnob; fR: OneKnob; eL: Echo; eR: Echo }
const deck = (sr: number): Deck => ({ ws: new Wsola(), isoL: new Isolator(sr), isoR: new Isolator(sr), fL: new OneKnob(), fR: new OneKnob(), eL: new Echo(sr), eR: new Echo(sr) });

export class Mixer {
  readonly sr = MIX_RATE;
  readonly items: SetItem[];
  readonly tempo: TempoMap;
  /** The set's length in frames. */
  readonly length: number;
  private t0: number[]; private t1: number[]; private tail: number[];
  private decks = new Map<number, Deck>();
  private lim!: Limiter;
  private hop = 0;
  private bufL = new Float32Array(H); private bufR = new Float32Array(H); private pos = H;
  private skip = 0;
  private dryL = new Float32Array(H); private dryR = new Float32Array(H);
  private mixL = new Float32Array(H); private mixR = new Float32Array(H);

  constructor(plan: Pick<SetPlan, 'items' | 'tempo'>, private src: Sources) {
    this.items = plan.items;
    this.tempo = tempoOf(plan);
    this.t0 = this.items.map(it => this.tempo.time(it.start));
    this.t1 = this.items.map(it => this.tempo.time(it.start + it.beats));
    this.tail = this.items.map(it => it.fx?.style === 'echo' ? TAIL : 0);
    this.length = Math.ceil(Math.max(0, ...this.t1.map((t, i) => t + this.tail[i])) * this.sr);
    this.seek(0);
  }

  /** The songs sounding between two frames (and a second either side): the ones to have decoded. */
  needed(f0: number, f1: number): string[] {
    const a = f0 / this.sr - 1, b = f1 / this.sr + 1;
    return this.items.filter((_, i) => this.t0[i] < b && this.t1[i] + this.tail[i] > a).map(it => it.id);
  }

  /** Start again at a frame. */
  seek(frame: number) {
    const f = Math.max(0, Math.floor(frame));
    this.hop = Math.floor(f / H);
    this.decks.clear();
    this.lim = new Limiter(this.sr);
    this.pos = H;
    // The limiter delays by LOOK: drop that, and the hop's frames before `f`.
    this.skip = f - this.hop * H + Limiter.LOOK;
  }

  /** Up to `n` frames into L and R from `off`; how many (fewer at the end). */
  render(L: Float32Array, R: Float32Array, n: number, off = 0): number {
    let done = 0;
    while (done < n) {
      if (this.pos >= H) { this.next(); this.pos = 0; }
      if (this.skip > 0) { const k = Math.min(this.skip, H - this.pos); this.skip -= k; this.pos += k; continue; }
      const outFrame = this.hop * H - H + this.pos - Limiter.LOOK;
      if (outFrame >= this.length) break;
      const k = Math.min(n - done, H - this.pos, this.length - outFrame);
      L.set(this.bufL.subarray(this.pos, this.pos + k), off + done);
      R.set(this.bufR.subarray(this.pos, this.pos + k), off + done);
      this.pos += k; done += k;
    }
    return done;
  }

  /** One hop of the mix into the buffer. */
  private next() {
    const sr = this.sr, f0 = this.hop * H, ta = f0 / sr, tb = (f0 + H) / sr;
    const b0 = this.tempo.beat(ta), b1 = this.tempo.beat(tb);
    this.mixL.fill(0); this.mixR.fill(0);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!(this.t0[i] < tb + 0.05 && this.t1[i] + this.tail[i] > ta)) { this.decks.delete(i); continue; }
      let d = this.decks.get(i);
      if (!d) { d = deck(sr); this.decks.set(i, d); }
      this.dry(it, d, b0, b1);
      const c0 = controlsAt(this.items, i, b0), c1 = controlsAt(this.items, i, b1);
      const trim = Math.pow(10, (it.trim ?? 0) / 20), delay = 0.75 * 60 / this.tempo.bpmAt(b0) * sr;
      d.fL.set(c0.filter, sr); d.fR.set(c0.filter, sr);
      for (let j = 0; j < H; j++) {
        const u = j / H, g = c0.gain + (c1.gain - c0.gain) * u, lo = c0.low + (c1.low - c0.low) * u;
        const mi = c0.mid + (c1.mid - c0.mid) * u, hi = c0.high + (c1.high - c0.high) * u, ec = c0.echo + (c1.echo - c0.echo) * u;
        const xl = d.fL.run(d.isoL.run(this.dryL[j] * trim, lo, mi, hi)), xr = d.fR.run(d.isoR.run(this.dryR[j] * trim, lo, mi, hi));
        this.mixL[j] += xl * g + d.eL.run(xl * g, ec, delay);
        this.mixR[j] += xr * g + d.eR.run(xr * g, ec, delay);
      }
    }
    this.lim.run(this.mixL, this.mixR, 0, H);
    this.bufL.set(this.mixL); this.bufR.set(this.mixR);
    this.hop++;
  }

  /** The song's own sound over the hop: read where its beats are (silent outside its span). */
  private dry(it: SetItem, d: Deck, b0: number, b1: number) {
    const pcm = this.src.get(it.id), sr = this.sr, end = it.start + it.beats;
    this.dryL.fill(0); this.dryR.fill(0);
    if (!pcm || b1 <= it.start || b0 >= end) { d.ws.reset(); return; }
    const p = (b: number) => (it.in + (b - it.start) * 60 / it.bpm) * sr, p0 = p(b0), p1 = p(b1);
    if (it.keyLock) d.ws.hop(pcm.l, pcm.r, p0, this.dryL, this.dryR, 0);
    else for (let j = 0; j < H; j++) { const q = p0 + (p1 - p0) * j / H; this.dryL[j] = cubicAt(pcm.l, q); this.dryR[j] = cubicAt(pcm.r, q); }
    // Nothing before its start or after its end (within the hop).
    for (let j = 0; j < H; j++) { const b = b0 + (b1 - b0) * j / H; if (b < it.start || b >= end) { this.dryL[j] = 0; this.dryR[j] = 0; } }
  }
}
