/* The Prepare tab's waveform and beat grid (ADR 0052). Pure: runs in the analysis worker.
   - Three bands (lows < 200 Hz, mids, highs > 2.5 kHz) at RATE points per second, each point the RMS
     of its window, and the peak level; all scaled 0–255 against the track's own loudest point.
   - The onset envelope the tempo detector uses (ADR 0006), kept at 8 bits, so the grid can be placed
     again for another BPM without decoding the track again. */
import { decimate, onsetEnvelope } from './analyze';

export const RATE = 150;
/** An onset peaks in the flux about 0.7 of a window after the window starts (measured on clicks at
    known times: centre-of-window was 18.6 ms early at every tempo). */
const ONSET_LAG = 0.7;

export interface Waveform {
  rate: number;            // points per second
  low: Uint8Array; mid: Uint8Array; high: Uint8Array; peak: Uint8Array;
  env: Uint8Array;         // onset envelope, 0–255
  envRate: number;         // its frames per second
  envT0: number;           // when an onset that peaks in frame 0 is heard (s)
  duration: number;
}

/** A 2nd-order section (RBJ cookbook), run in place over a copy. */
function biquad(x: Float32Array, sr: number, kind: 'lp' | 'hp', f0: number): Float32Array {
  const w = 2 * Math.PI * f0 / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2);
  const b0 = kind === 'lp' ? (1 - cw) / 2 : (1 + cw) / 2, b1 = kind === 'lp' ? 1 - cw : -(1 + cw), b2 = b0;
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export function computeWaveform(mono: Float32Array, sr: number): Waveform {
  const low = biquad(biquad(mono, sr, 'lp', 200), sr, 'lp', 200);
  const high = biquad(biquad(mono, sr, 'hp', 2500), sr, 'hp', 2500);
  const win = sr / RATE, n = Math.max(1, Math.floor(mono.length / win));
  const bands = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let j = 0; j < n; j++) {
    const a = Math.floor(j * win), b = Math.min(mono.length, Math.floor((j + 1) * win));
    let sl = 0, sm = 0, sh = 0, pk = 0;
    for (let i = a; i < b; i++) {
      const l = low[i], h = high[i], m = mono[i] - l - h;
      sl += l * l; sm += m * m; sh += h * h;
      const v = Math.abs(mono[i]); if (v > pk) pk = v;
    }
    const k = Math.max(1, b - a);
    bands[0][j] = Math.sqrt(sl / k); bands[1][j] = Math.sqrt(sm / k); bands[2][j] = Math.sqrt(sh / k); bands[3][j] = pk;
  }
  // Each band against its own loudest point, with a gentle curve so quiet parts stay visible.
  const [bl, bm, bh, bp] = bands.map(arr => {
    let max = 0; for (const v of arr) if (v > max) max = v;
    const out = new Uint8Array(arr.length);
    if (max > 0) for (let i = 0; i < arr.length; i++) out[i] = Math.round(255 * Math.pow(arr[i] / max, 0.75));
    return out;
  });
  const { x, fs } = decimate(mono, sr), o = onsetEnvelope(x, fs);
  let emax = 0; for (const v of o.e) if (v > emax) emax = v;
  const env = new Uint8Array(o.e.length);
  if (emax > 0) for (let i = 0; i < env.length; i++) env[i] = Math.round(255 * Math.min(1, o.e[i] / emax));
  return { rate: RATE, low: bl, mid: bm, high: bh, peak: bp, env, envRate: o.fr, envT0: ONSET_LAG * o.N / fs, duration: mono.length / sr };
}

/** Where the beats fall for a tempo: the first beat's time (s, the earliest one at or after 0) and which
    of each four is the bar's first (0–3). The phase is the one whose beats line up with the strongest
    onsets; the downbeat, the beat of the four that's loudest in `level` (the lows and peaks, where
    kicks and accents show; the onset envelope flattens loudness). */
export function beatGrid(env: Uint8Array | Float32Array, envRate: number, envT0: number, bpm: number,
  level?: { data: ArrayLike<number>; rate: number }): { beat0: number; bar: number } {
  const P = envRate * 60 / bpm, n = env.length;
  if (!(P > 1) || n < P * 4) return { beat0: 0, bar: 0 };
  const at = (f: number) => { const i = Math.floor(f), t = f - i; return i + 1 >= n || i < 0 ? 0 : env[i] * (1 - t) + env[i + 1] * t; };
  const score = (ph: number) => { let s = 0; for (let f = ph; f < n - 1; f += P) s += at(f); return s; };
  // Coarse over one period, then parabolic refinement around the best.
  const step = 0.25;
  let best = 0, bestS = -1;
  for (let ph = 0; ph < P; ph += step) { const s = score(ph); if (s > bestS) { bestS = s; best = ph; } }
  const a = score(best - step < 0 ? best - step + P : best - step), c = score(best + step), d = a - 2 * bestS + c;
  let ph = best + (d < 0 ? 0.5 * step * (a - c) / d : 0);
  ph = ((ph % P) + P) % P;
  // Frame f's onset is heard at envT0 + f / envRate; the first beat is the earliest at or after 0.
  const period = 60 / bpm;
  let beat0 = envT0 + ph / envRate;
  while (beat0 - period >= 0) beat0 -= period;
  while (beat0 < 0) beat0 += period;
  // The downbeat: which of the four beats is loudest (the most at each beat, within 30 ms after it).
  const bars = [0, 0, 0, 0];
  if (level) {
    const L = level.data, span = Math.max(1, Math.round(0.03 * level.rate));
    for (let k = 0, t = beat0; t * level.rate < L.length; k++, t += period) {
      const i = Math.round(t * level.rate); let m = 0;
      for (let j = i; j < Math.min(L.length, i + span); j++) if (L[j] > m) m = L[j];
      bars[k % 4] += m;
    }
  } else for (let k = 0, f = ph; f < n - 1; k++, f += P) bars[k % 4] += at(f);
  return { beat0, bar: bars.indexOf(Math.max(...bars)) };
}

/** The beats (their times, s) between t0 and t1 for a grid; \`n\` is each beat's number (0 = the first). */
export function beatsBetween(beat0: number, bpm: number, t0: number, t1: number): { t: number; n: number }[] {
  const p = 60 / bpm, out: { t: number; n: number }[] = [];
  if (!(p > 0)) return out;
  for (let n = Math.max(0, Math.ceil((t0 - beat0) / p)), t = beat0 + n * p; t <= t1; n++, t = beat0 + n * p) out.push({ t, n });
  return out;
}
