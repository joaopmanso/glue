/* The sound profile (ADR 0197): how loud, how busy and how bright a song is, the shape of its spectrum, and its
   loudness over time. Automatic playlists use it to follow an energy curve and pick songs that sound alike; the set
   builder will use the curve for intros, drops and outros. One pass of 2048-sample frames (~46 ms, no overlap) over the
   analysis's mono mix, brought to 44–48 kHz. Mirrored line for line in crates/glue-audio/src/audio/sound.rs. */
import { makeFFT } from './fft';
import type { SoundProfile } from '../types';

/** Spectrum bands of the timbre: 40 Hz … 16 kHz in equal steps of pitch. */
export const SOUND_BANDS = 16;
/** The timbre's length: the bands' shape, then the spectral centroid (log2 Hz), flatness, low end (< 150 Hz) and
    highs (> 5 kHz), each a share of the power. */
export const TIMBRE_LEN = SOUND_BANDS + 4;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toB64(u: Uint8Array): string {
  let o = '';
  for (let i = 0; i < u.length; i += 3) {
    const a = u[i], b = i + 1 < u.length ? u[i + 1] : 0, c = i + 2 < u.length ? u[i + 2] : 0, n = (a << 16) | (b << 8) | c;
    o += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < u.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < u.length ? B64[n & 63] : '=');
  }
  return o;
}
export function fromB64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, ''), out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let bits = 0, acc = 0, j = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[j++] = (acc >> bits) & 255; }
  }
  return out.subarray(0, j);
}

/** BS.1770's loudness of a mean square. */
const lufsOf = (m: number) => -0.691 + 10 * Math.log10(m + 1e-12);
const r2 = (x: number) => Math.round(x * 100) / 100, r3 = (x: number) => Math.round(x * 1000) / 1000;

export function soundProfile(mono: Float32Array, sr: number): SoundProfile | null {
  const dec = Math.max(1, Math.floor(sr / 44100)), fs = sr / dec, len = Math.floor(mono.length / dec);
  if (len < fs * 6) return null;   // too short to say anything
  const N = 2048, half = N / 2, fft = makeFFT(N), win = new Float64Array(N), binHz = fs / N;
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const top = Math.min(16000, fs * 0.49), edge = new Int32Array(SOUND_BANDS + 1);
  for (let b = 0; b <= SOUND_BANDS; b++) edge[b] = Math.max(b ? edge[b - 1] + 1 : 1, Math.round(40 * Math.pow(top / 40, b / SOUND_BANDS) / binHz));
  // Loudness weighting, BS.1770's K-weighting roughly: under 60 Hz falls away, above 1.5 kHz counts 4 dB more.
  const kw = new Float64Array(half), lgf = new Float64Array(half);
  for (let k = 1; k < half; k++) { const f = k * binHz; kw[k] = (f < 60 ? Math.pow(f / 60, 4) : 1) * (f > 1500 ? 2.512 : 1); lgf[k] = Math.log2(f); }
  const k150 = Math.round(150 / binHz), k5k = Math.round(5000 / binHz), kEnd = edge[SOUND_BANDS];
  // A frame's mean square from its spectrum (Parseval, one side, the Hann window's power 0.375).
  const norm = 2 / (N * N * 0.375), frames = Math.floor(len / N);
  const ms = new Float64Array(frames), L = new Float64Array(frames * SOUND_BANDS);
  const cen = new Float64Array(frames), flat = new Float64Array(frames), lo = new Float64Array(frames), hi = new Float64Array(frames);
  const re = new Float64Array(N), im = new Float64Array(N), p = new Float64Array(half);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) {
      const s = (f * N + i) * dec;
      let v = 0;
      for (let d = 0; d < dec; d++) v += mono[s + d];
      re[i] = v / dec * win[i]; im[i] = 0;
    }
    fft(re, im);
    let w = 0, tot = 0, c = 0, l = 0, h = 0;
    for (let k = 1; k < half; k++) { const q = re[k] * re[k] + im[k] * im[k]; p[k] = q; w += q * kw[k]; }
    for (let k = edge[0]; k < kEnd; k++) { tot += p[k]; c += p[k] * lgf[k]; if (k < k150) l += p[k]; if (k >= k5k) h += p[k]; }
    ms[f] = w * norm;
    let lsum = 0, dsum = 0;
    for (let b = 0; b < SOUND_BANDS; b++) {
      let e = 0;
      for (let k = edge[b]; k < edge[b + 1]; k++) e += p[k];
      const d = e * norm / (edge[b + 1] - edge[b]);   // power per bin: flatness compares bands of any width
      L[f * SOUND_BANDS + b] = 10 * Math.log10(e * norm + 1e-12);
      lsum += Math.log(d + 1e-20); dsum += d;
    }
    cen[f] = tot > 0 ? c / tot : 0;
    flat[f] = dsum > 0 ? Math.exp(lsum / SOUND_BANDS) / (dsum / SOUND_BANDS) : 0;
    lo[f] = tot > 0 ? l / tot : 0;
    hi[f] = tot > 0 ? h / tot : 0;
  }

  // Integrated loudness: 400 ms blocks, gated at −70 LUFS and 10 LU under the first mean.
  const fps = fs / N, blk = Math.max(1, Math.round(0.4 * fps)), nb = Math.floor(frames / blk), bm = new Float64Array(nb);
  for (let i = 0; i < nb; i++) { let s = 0; for (let j = 0; j < blk; j++) s += ms[i * blk + j]; bm[i] = s / blk; }
  let s1 = 0, n1 = 0;
  for (let i = 0; i < nb; i++) if (lufsOf(bm[i]) > -70) { s1 += bm[i]; n1++; }
  if (!n1) return null;   // silence
  const gate = lufsOf(s1 / n1) - 10;
  let s2 = 0, n2 = 0;
  for (let i = 0; i < nb; i++) { const x = lufsOf(bm[i]); if (x > -70 && x > gate) { s2 += bm[i]; n2++; } }
  const lufs = n2 ? lufsOf(s2 / n2) : lufsOf(s1 / n1);

  // The timbre, over the frames that play (within 20 LU of the song's loudness): each band against the frame's mean
  // band (the spectrum's shape, whatever the volume), and the frame's centroid, flatness, low end and highs.
  const shape = new Float64Array(SOUND_BANDS), flux = new Float64Array(frames);
  let act = 0, sc = 0, sf = 0, sl = 0, sh = 0;
  for (let f = 0; f < frames; f++) {
    if (f > 0) { let x = 0; for (let b = 0; b < SOUND_BANDS; b++) { const d = L[f * SOUND_BANDS + b] - L[(f - 1) * SOUND_BANDS + b]; if (d > 0) x += d; } flux[f] = x; }
    if (!(lufsOf(ms[f]) > lufs - 20)) continue;
    act++;
    let m = 0;
    for (let b = 0; b < SOUND_BANDS; b++) m += L[f * SOUND_BANDS + b];
    m /= SOUND_BANDS;
    for (let b = 0; b < SOUND_BANDS; b++) shape[b] += L[f * SOUND_BANDS + b] - m;
    sc += cen[f]; sf += flat[f]; sl += lo[f]; sh += hi[f];
  }
  if (!act) return null;
  const timbre: number[] = [];
  for (let b = 0; b < SOUND_BANDS; b++) timbre.push(r2(shape[b] / act));
  timbre.push(r3(sc / act), r3(sf / act), r3(sl / act), r3(sh / act));

  // How busy: onsets per second, peaks of the band flux above its mean plus half a deviation (over the audible frames,
  // above −70 LUFS), at least 2 frames apart.
  let fm = 0, fv = 0, na = 0;
  for (let f = 1; f < frames; f++) if (lufsOf(ms[f]) > -70) { fm += flux[f]; na++; }
  fm /= Math.max(1, na);
  for (let f = 1; f < frames; f++) if (lufsOf(ms[f]) > -70) fv += (flux[f] - fm) * (flux[f] - fm);
  const thr = fm + 0.5 * Math.sqrt(fv / Math.max(1, na));
  let count = 0, last = -10;
  for (let f = 1; f + 1 < frames; f++) {
    if (!(lufsOf(ms[f]) > -70) || !(flux[f] > thr) || flux[f] < flux[f - 1] || !(flux[f] > flux[f + 1]) || f - last < 2) continue;
    count++; last = f;
  }

  // Loudness over time: about every 2 s, in quarter-dB steps from −60 LUFS (0 … 255).
  const step = Math.max(1, Math.round(2 * fps)), nc = Math.ceil(frames / step), curve = new Uint8Array(nc);
  for (let i = 0; i < nc; i++) {
    const a = i * step, b = Math.min(frames, a + step);
    let s = 0;
    for (let f = a; f < b; f++) s += ms[f];
    curve[i] = Math.max(0, Math.min(255, Math.round((lufsOf(s / (b - a)) + 60) * 4)));
  }
  return { lufs: r2(lufs), onsets: r2(count / (frames / fps)), timbre, curve: toB64(curve), step: r3(step * N / fs) };
}

/** The loudness curve's values in LUFS, `step` seconds apart. */
export function curveOf(s: Pick<SoundProfile, 'curve'>): number[] {
  return Array.from(fromB64(s.curve), v => v / 4 - 60);
}
