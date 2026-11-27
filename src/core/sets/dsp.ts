/* The set's signal processing (ADR 0199). Pure and deterministic, so a mix rendered into a file is what the preview
   plays: a resampler, varispeed, key lock (WSOLA), a 3-band isolator, a one-knob filter, a beat-synced echo and a
   lookahead limiter. */

// ---------- resampling ----------

/** Any rate to `to` (windowed sinc, 32 taps, anti-aliased when going down). */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const ratio = from / to, n = Math.floor(x.length * to / from + 1e-9), out = new Float32Array(n);
  const cut = Math.min(1, 1 / ratio), half = 16, width = Math.ceil(half / cut);
  const PH = 512, table = new Float32Array((PH + 1) * 2 * width);
  // h(d) = cut · sinc(cut · d) · Blackman over ±width, tabulated per fractional phase.
  for (let ph = 0; ph <= PH; ph++) {
    const frac = ph / PH;
    for (let k = -width + 1; k <= width; k++) {
      const d = k - frac, w = Math.abs(d) >= width ? 0 : 0.42 + 0.5 * Math.cos(Math.PI * d / width) + 0.08 * Math.cos(2 * Math.PI * d / width);
      const s = d === 0 ? 1 : Math.sin(Math.PI * cut * d) / (Math.PI * cut * d);
      table[ph * 2 * width + (k + width - 1)] = cut * s * w;
    }
  }
  for (let i = 0; i < n; i++) {
    const p = i * ratio, i0 = Math.floor(p), ph = Math.round((p - i0) * PH), row = ph * 2 * width;
    let s = 0;
    for (let k = -width + 1; k <= width; k++) { const j = i0 + k; if (j >= 0 && j < x.length) s += x[j] * table[row + k + width - 1]; }
    out[i] = s;
  }
  return out;
}

/** Catmull-Rom read at a fractional position (0 outside). */
export function cubicAt(x: Float32Array, p: number): number {
  const i = Math.floor(p), t = p - i;
  if (i < 1 || i + 2 >= x.length) return i >= 0 && i < x.length ? x[i] : 0;
  const a = x[i - 1], b = x[i], c = x[i + 1], d = x[i + 2];
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

// ---------- key lock: WSOLA ----------

/** Waveform-similarity overlap-add: grains of `N` samples every `H` = N/2, each placed where it best continues the last
    one, near the position asked. The tempo follows the positions given; the pitch stays. */
export class Wsola {
  static readonly N = 2048;
  static readonly H = 1024;
  private win = new Float32Array(Wsola.N);
  private tailL = new Float32Array(Wsola.H);
  private tailR = new Float32Array(Wsola.H);
  private prev = -1;
  constructor() { for (let i = 0; i < Wsola.N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / Wsola.N); }
  reset() { this.prev = -1; this.tailL.fill(0); this.tailR.fill(0); }
  /** H samples of output for a grain asked at source position `p` (samples). */
  hop(L: Float32Array, R: Float32Array, p: number, oL: Float32Array, oR: Float32Array, off: number) {
    const { N, H } = Wsola, n = L.length, at = (x: Float32Array, i: number) => i >= 0 && i < n ? x[i] : 0;
    let q = Math.round(p);
    if (this.prev >= 0) {
      // The natural continuation of the last grain, compared with candidates around q (coarse, then fine).
      const nat = this.prev + H, S = 512, ov = 512, step = 4;
      let best = 0, bestC = -Infinity;
      for (let d = -S; d <= S; d += 8) {
        let c = 0;
        for (let i = 0; i < ov; i += step) c += (at(L, nat + i) + at(R, nat + i)) * (at(L, q + d + i) + at(R, q + d + i));
        if (c > bestC) { bestC = c; best = d; }
      }
      const coarse = best;
      for (let d = coarse - 7; d <= coarse + 7; d++) {
        let c = 0;
        for (let i = 0; i < ov; i += 2) c += (at(L, nat + i) + at(R, nat + i)) * (at(L, q + d + i) + at(R, q + d + i));
        if (c > bestC) { bestC = c; best = d; }
      }
      q += best;
    }
    for (let i = 0; i < H; i++) {
      oL[off + i] = this.tailL[i] + at(L, q + i) * this.win[i];
      oR[off + i] = this.tailR[i] + at(R, q + i) * this.win[i];
    }
    for (let i = 0; i < H; i++) { this.tailL[i] = at(L, q + H + i) * this.win[H + i]; this.tailR[i] = at(R, q + H + i) * this.win[H + i]; }
    this.prev = q;
  }
}

// ---------- filters ----------

/** A biquad (RBJ), Direct Form I, per channel state. */
export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  set(kind: 'lp' | 'hp', f: number, q: number, sr: number) {
    const w = 2 * Math.PI * Math.min(f, sr * 0.49) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    if (kind === 'lp') { this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = this.b0; }
    else { this.b0 = (1 + c) / 2 / a0; this.b1 = -(1 + c) / a0; this.b2 = this.b0; }
    this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
}

const BW = Math.SQRT1_2;
/** A Linkwitz-Riley 4th-order low or high pass: two Butterworths. */
class LR4 {
  private a = new Biquad(); private b = new Biquad();
  constructor(kind: 'lp' | 'hp', f: number, sr: number) { this.a.set(kind, f, BW, sr); this.b.set(kind, f, BW, sr); }
  run(x: number) { return this.b.run(this.a.run(x)); }
}

/** A DJ mixer's 3-band isolator (250 Hz, 2.5 kHz): each band 0 (killed) … 1; all at 1, the sound is whole (an
    all-pass). One channel. */
export class Isolator {
  private lo: LR4; private hi1: LR4; private mid: LR4; private hi2: LR4;
  constructor(sr: number) { this.lo = new LR4('lp', 250, sr); this.hi1 = new LR4('hp', 250, sr); this.mid = new LR4('lp', 2500, sr); this.hi2 = new LR4('hp', 2500, sr); }
  run(x: number, gl: number, gm: number, gh: number): number {
    const l = this.lo.run(x), rest = this.hi1.run(x);
    return gl * l + gm * this.mid.run(rest) + gh * this.hi2.run(rest);
  }
}

/** One knob: −1 … 0 a low pass closing (20 kHz → 200 Hz), 0 off, 0 … 1 a high pass opening (20 Hz → 2 kHz). One channel;
    `set` once per block. */
export class OneKnob {
  private f = new Biquad(); private v = 0;
  set(v: number, sr: number) {
    if (Math.abs(v - this.v) < 1e-4 && Math.abs(v) > 0.01) return;
    this.v = v;
    if (v < -0.01) this.f.set('lp', 20000 * Math.pow(200 / 20000, -v), 0.9, sr);
    else if (v > 0.01) this.f.set('hp', 20 * Math.pow(100, v), 0.9, sr);
  }
  run(x: number) { return Math.abs(this.v) <= 0.01 ? x : this.f.run(x); }
}

/** A beat-synced echo (3/4 of a beat, feedback 0.5): `send` of the input goes in, the echoes come out. One channel. */
export class Echo {
  private buf: Float32Array; private w = 0;
  constructor(sr: number) { this.buf = new Float32Array(Math.ceil(sr * 3)); }
  run(x: number, send: number, delay: number): number {
    const n = this.buf.length, d = Math.max(1, Math.min(n - 1, Math.round(delay)));
    const y = this.buf[(this.w - d + n) % n];
    this.buf[this.w] = x * send + y * 0.5;
    this.w = (this.w + 1) % n;
    return y;
  }
}

/** A lookahead limiter: never over `ceiling`, its gain falling at once (on the delayed signal) and recovering in ~0.2 s.
    Stereo, processed in 64-sample steps from its own start. */
export class Limiter {
  static readonly LOOK = 256;
  private dl: Float32Array; private dr: Float32Array; private w = 0; private g = 1;
  private rel: number;
  constructor(sr: number, private ceiling = 0.966) { this.dl = new Float32Array(Limiter.LOOK); this.dr = new Float32Array(Limiter.LOOK); this.rel = 1 - Math.exp(-1 / (0.2 * sr)); }
  /** In place, `n` a multiple of 64. Adds LOOK samples of latency. */
  run(L: Float32Array, R: Float32Array, off: number, n: number) {
    const look = Limiter.LOOK;
    for (let c = 0; c < n; c += 64) {
      // The loudest of this step and what's in the delay line ahead of it.
      let pk = 0;
      for (let i = 0; i < 64; i++) pk = Math.max(pk, Math.abs(L[off + c + i]), Math.abs(R[off + c + i]));
      for (let i = 0; i < look; i++) pk = Math.max(pk, Math.abs(this.dl[i]), Math.abs(this.dr[i]));
      const need = pk > this.ceiling ? this.ceiling / pk : 1;
      for (let i = 0; i < 64; i++) {
        if (need < this.g) this.g = need; else this.g += (need - this.g) * this.rel;
        const j = off + c + i, xl = L[j], xr = R[j];
        const yl = this.dl[this.w] * this.g, yr = this.dr[this.w] * this.g;
        this.dl[this.w] = xl; this.dr[this.w] = xr; this.w = (this.w + 1) % look;
        L[j] = Math.max(-this.ceiling, Math.min(this.ceiling, yl));
        R[j] = Math.max(-this.ceiling, Math.min(this.ceiling, yr));
      }
    }
  }
}
