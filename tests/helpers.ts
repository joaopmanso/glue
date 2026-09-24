import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeFFT } from '../src/core/audio/fft';

export const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL('./fixtures/' + name, import.meta.url))));
export const hasFile = (p: string) => existsSync(p);

let seed = 12345;
export function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 - 0.5; }

/** Stereo white noise band-limited with a brick wall at `cutHz` (FFT overlap-add), as Float32 channels. */
export function bandLimitedNoise(sr: number, secs: number, cutHz: number, level = 0.25): Float32Array[] {
  const N = 4096, hop = N / 2, len = Math.floor(sr * secs), fft = makeFFT(N);
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const kCut = Math.floor(cutHz * N / sr), out = [new Float32Array(len), new Float32Array(len)];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= len; s += hop) for (const o of out) {
    re.fill(0); im.fill(0);
    for (let k = 1; k <= Math.min(kCut, N / 2 - 1); k++) { re[k] = rnd(); im[k] = rnd(); }
    for (let k = 1; k < N / 2; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    for (let k = 0; k < N; k++) im[k] = -im[k];
    fft(re, im);
    for (let i = 0; i < N; i++) o[s + i] += re[i] * win[i];
  }
  let peak = 0; for (const o of out) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(o[i]));
  for (const o of out) for (let i = 0; i < len; i++) o[i] = o[i] / peak * level;
  return out;
}

/** Stereo noise (pink tilt) that rolls off gently: flat to `startHz`, then `dbPerKHz` lower per kHz,
    all the way up (a mastering lowpass or a dark master, not an encoder's wall). */
export function rolledOff(sr: number, secs: number, startHz: number, dbPerKHz: number, level = 0.25): Float32Array[] {
  const N = 4096, hop = N / 2, len = Math.floor(sr * secs), fft = makeFFT(N);
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const gain = new Float64Array(N / 2);
  for (let k = 1; k < N / 2; k++) { const f = k * sr / N; gain[k] = Math.pow(10, -(f > startHz ? dbPerKHz * (f - startHz) / 1000 : 0) / 20) / Math.sqrt(Math.sqrt(f / 100)); }
  const out = [new Float32Array(len), new Float32Array(len)], re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= len; s += hop) for (const o of out) {
    re.fill(0); im.fill(0);
    for (let k = 1; k < N / 2; k++) { re[k] = rnd() * gain[k]; im[k] = rnd() * gain[k]; }
    for (let k = 1; k < N / 2; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    for (let k = 0; k < N; k++) im[k] = -im[k];
    fft(re, im);
    for (let i = 0; i < N; i++) o[s + i] += re[i] * win[i];
  }
  let peak = 0; for (const o of out) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(o[i]));
  for (const o of out) for (let i = 0; i < len; i++) o[i] = o[i] / peak * level;
  return out;
}

/**
 * Music-like stereo test signal: many sine partials up to `cutHz` with a pink (1/√f) tilt, so the
 * spectrum has a natural slope and a perfectly sharp edge (no window leakage past the cutoff).
 */
export function bandLimitedTones(sr: number, secs: number, cutHz: number, partials = 300, level = 0.25): Float32Array[] {
  const len = Math.floor(sr * secs), out = [new Float32Array(len), new Float32Array(len)];
  for (const o of out) {
    for (let p = 0; p < partials; p++) {
      const f = 40 * Math.pow(cutHz * 0.995 / 40, (p + 0.5 + rnd() * 0.5) / partials);
      const a = 1 / Math.sqrt(f), w = 2 * Math.PI * f / sr, ph = (rnd() + 0.5) * 2 * Math.PI;
      // complex oscillator by rotation: cheap and drift-free enough for a few seconds
      let c = Math.cos(ph), s = Math.sin(ph);
      const cw = Math.cos(w), sw = Math.sin(w);
      for (let i = 0; i < len; i++) { o[i] += a * s; const c2 = c * cw - s * sw; s = s * cw + c * sw; c = c2; }
    }
  }
  let peak = 0; for (const o of out) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(o[i]));
  for (const o of out) for (let i = 0; i < len; i++) o[i] = o[i] / peak * level;
  return out;
}

/** Quantise float channels to n-bit integers (as floats on that grid), with TPDF dither. */
export function quantize(chs: Float32Array[], bits: number): Float32Array[] {
  const q = Math.pow(2, bits - 1);
  return chs.map(c => c.map(v => Math.max(-q, Math.min(q - 1, Math.round(v * q + rnd() + rnd()))) / q));
}

/** Drum-and-chords test signal with a known tempo and key (MIDI note chords). */
export function synthMusic(bpm: number, sr: number, secs: number, chords: number[][]): Float32Array {
  const n = sr * secs, x = new Float32Array(n), beat = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / sr, bp = (t % beat) / beat, bar = Math.floor(t / (beat * 4));
    let v = 0.5 * Math.sin(2 * Math.PI * 55 * t * (1 + 2 * Math.exp(-bp * 30))) * Math.exp(-bp * 8);
    const hp = ((t + beat / 2) % beat) / beat; v += 0.15 * rnd() * Math.exp(-hp * 40);
    for (const m of chords[bar % chords.length]) {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      v += 0.06 * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.3 * Math.sin(6 * Math.PI * f * t));
    }
    x[i] = v * 0.5;
  }
  return x;
}
