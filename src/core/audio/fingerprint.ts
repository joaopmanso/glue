/* Acoustic fingerprints for "same recording" duplicates (ADR 0025).
   Haitsma–Kalker (Philips) style: the audio is resampled to 5512.5 Hz, cut into 0.37 s frames every
   23 ms, and each frame gives 32 bits: does the energy difference between neighbouring bands
   (33 log bands, 300–2000 Hz) grow or shrink from one frame to the next? Those signs survive lossy
   encoding, level changes and resampling. Two files are the same recording when, at the best time
   alignment, few bits differ (bit error rate); unrelated audio sits near 50 %. */
import { makeFFT } from './fft';

export const FP_RATE = 5512.5;
export const FP_N = 2048;                 // 0.37 s frames
export const FP_HOP = 256;                // 46.4 ms
export const FP_SECONDS = 150;            // at most this much, centred in the track
export const FP_FRAME_SEC = FP_HOP / FP_RATE;
const BANDS = 33, F_LO = 300, F_HI = 2000;

export interface Fingerprint { words: Uint32Array; loud: Uint8Array }   // loud: frame level, 0 = silent … 255

/** Lowpass (windowed sinc, 2.4 kHz) evaluated only where the 5512.5 Hz output needs it. */
function resample(mono: Float32Array, sr: number, start: number, count: number): Float32Array {
  const TAPS = 24, fc = 2400 / sr, h = new Float32Array(2 * TAPS + 1);
  let sum = 0;
  for (let j = -TAPS; j <= TAPS; j++) {
    const x = j === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * j) / (Math.PI * j);
    const w = 0.42 + 0.5 * Math.cos(Math.PI * j / TAPS) + 0.08 * Math.cos(2 * Math.PI * j / TAPS);   // Blackman
    h[j + TAPS] = x * w; sum += x * w;
  }
  for (let j = 0; j < h.length; j++) h[j] /= sum;
  const out = new Float32Array(count), step = sr / FP_RATE;
  for (let k = 0; k < count; k++) {
    const c = Math.round(start + k * step);
    let acc = 0;
    const a = Math.max(0, c - TAPS), b = Math.min(mono.length - 1, c + TAPS);
    for (let i = a; i <= b; i++) acc += mono[i] * h[i - c + TAPS];
    out[k] = acc;
  }
  return out;
}

export function fingerprint(mono: Float32Array, sr: number): Fingerprint {
  const want = Math.min(mono.length, Math.round(FP_SECONDS * sr));
  const start = Math.floor((mono.length - want) / 2);
  const x = resample(mono, sr, start, Math.floor(want / sr * FP_RATE));
  const frames = x.length >= FP_N ? Math.floor((x.length - FP_N) / FP_HOP) + 1 : 0;
  const words = new Uint32Array(Math.max(0, frames - 1)), loud = new Uint8Array(Math.max(0, frames - 1));
  if (frames < 2) return { words, loud };
  const edges = new Int32Array(BANDS + 1);
  for (let m = 0; m <= BANDS; m++) edges[m] = Math.round(F_LO * Math.pow(F_HI / F_LO, m / BANDS) / FP_RATE * FP_N);
  const win = new Float32Array(FP_N);
  for (let i = 0; i < FP_N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FP_N - 1));
  const fft = makeFFT(FP_N), re = new Float64Array(FP_N), im = new Float64Array(FP_N);
  let prev = new Float64Array(BANDS), cur = new Float64Array(BANDS);
  const levels = new Float32Array(frames);
  for (let n = 0; n < frames; n++) {
    const o = n * FP_HOP;
    for (let i = 0; i < FP_N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let total = 0;
    for (let m = 0; m < BANDS; m++) {
      let e = 0;
      for (let k = edges[m]; k < edges[m + 1]; k++) e += re[k] * re[k] + im[k] * im[k];
      cur[m] = e; total += e;
    }
    levels[n] = 10 * Math.log10(total + 1e-20);
    if (n > 0) {
      let w = 0;
      for (let m = 0; m < 32; m++) if ((cur[m] - cur[m + 1]) - (prev[m] - prev[m + 1]) > 0) w |= 1 << m;
      words[n - 1] = w >>> 0;
    }
    const t = prev; prev = cur; cur = t;
  }
  // Frame level relative to the loudest frame: 255 = loudest, 0 = 60 dB below or quieter.
  let max = -Infinity;
  for (let n = 1; n < frames; n++) max = Math.max(max, levels[n]);
  for (let n = 1; n < frames; n++) loud[n - 1] = Math.max(0, Math.min(255, Math.round((levels[n] - max + 60) / 60 * 255)));
  return { words, loud };
}

export const popcount = (v: number) => { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24; };
const LOUD_MIN = 64;   // frames quieter than −45 dB (re the loudest) don't count

/** Bit error rate of b shifted by `offset` frames against a (b[i + offset] ~ a[i]), over frames both have sound in. */
export function ber(a: Fingerprint, b: Fingerprint, offset: number): { ber: number; frames: number } {
  let errs = 0, n = 0;
  const i0 = Math.max(0, -offset), i1 = Math.min(a.words.length, b.words.length - offset);
  for (let i = i0; i < i1; i++) {
    if (a.loud[i] < LOUD_MIN || b.loud[i + offset] < LOUD_MIN) continue;
    errs += popcount(a.words[i] ^ b.words[i + offset]); n++;
  }
  return { ber: n ? errs / (32 * n) : 1, frames: n };
}
