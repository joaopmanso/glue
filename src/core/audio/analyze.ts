import { fingerprint } from './fingerprint';
import { makeFFT } from './fft';
import type { AnalysisJob, AnalysisResult, MusicResult, KeyResult, PcmLayout, ProgressFn, SampleStats, Spectrum } from '../types';

type FrameReader = (i: number, f: Float64Array, iv: Int32Array) => void;

/** Reads frame i of raw PCM into floats (f) and, for integer formats, the raw ints (iv). */
export function makePcmReader(u8: Uint8Array, pcm: PcmLayout): FrameReader {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const B = pcm.blockAlign / pcm.ch, ch = pcm.ch, le = pcm.le, base = pcm.off, stride = pcm.blockAlign;
  const isFloat = pcm.fmt === 'float', unsigned8 = !!pcm.unsigned8;
  return function (i, f, iv) {
    let p = base + i * stride;
    for (let c = 0; c < ch; c++, p += B) {
      if (isFloat) { f[c] = B === 8 ? dv.getFloat64(p, le) : dv.getFloat32(p, le); continue; }
      let v: number;
      if (B === 2) { v = dv.getInt16(p, le); f[c] = v / 32768; }
      else if (B === 3) {
        v = le ? (u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16)) : ((u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2]);
        v = (v << 8) >> 8; f[c] = v / 8388608;
      }
      else if (B === 4) { v = dv.getInt32(p, le); f[c] = v / 2147483648; }
      else { v = unsigned8 ? u8[p] - 128 : (u8[p] << 24) >> 24; f[c] = v / 128; }
      iv[c] = v;
    }
  };
}

/** One pass over every sample: mono mix, level, clipping, wasted low bits, stereo identity. */
export function analyzeSamples(nch: number, len: number, bits: number, isInt: boolean, floatFmt: boolean,
  read: FrameReader, progress: ProgressFn): { mono: Float32Array; stats: SampleStats } {
  const mono = new Float32Array(len);
  const f = new Float64Array(nch), iv = new Int32Array(nch), run = new Int32Array(nch);
  const scale = (!isInt && !floatFmt && bits >= 8 && bits <= 24) ? Math.pow(2, bits - 1) : 0;
  let orBits = 0, nonInt = 0, peak = 0, clipRuns = 0, sumSq = 0, on16 = 0, on24 = 0;
  let lrMax = 0, sLL = 0, sRR = 0, sLR = 0;
  for (let i = 0; i < len; i++) {
    read(i, f, iv);
    let m = 0;
    for (let c = 0; c < nch; c++) {
      const v = f[c]; m += v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sumSq += v * v;
      if (a >= 0.99995) { if (++run[c] === 3) clipRuns++; } else run[c] = 0;
      if (isInt) orBits |= iv[c];
      else if (scale) {
        const x = v * scale, r = Math.round(x);
        if (Math.abs(x - r) > 1e-4) nonInt++; else orBits |= r;
      }
      if (floatFmt) {
        const x16 = v * 32768; if (x16 === Math.round(x16)) on16++;
        const x24 = v * 8388608; if (x24 === Math.round(x24)) on24++;
      }
    }
    mono[i] = m / nch;
    if (nch >= 2) {
      const L = f[0], R = f[1], d = L > R ? L - R : R - L;
      if (d > lrMax) lrMax = d;
      sLL += L * L; sRR += R * R; sLR += L * R;
    }
    if ((i & 0x3ffff) === 0) progress('Reading samples', i / len);
  }
  let wasted: number | null = null;
  if (orBits !== 0) { wasted = 0; while (wasted < 32 && ((orBits >>> wasted) & 1) === 0) wasted++; }
  const total = len * nch;
  const assessed = (isInt || scale > 0) && nonInt <= total * 0.001;
  return {
    mono,
    stats: {
      peak, rms: Math.sqrt(sumSq / Math.max(1, total)), clipRuns, wasted, assessed, nonInt,
      floatFmt, on16: floatFmt ? on16 / total : 0, on24: floatFmt ? on24 / total : 0,
      lrIdentical: nch >= 2 && lrMax === 0 && peak > 0,
      lrCorr: nch >= 2 && sLL > 0 && sRR > 0 ? sLR / Math.sqrt(sLL * sRR) : null,
      silent: peak === 0,
    },
  };
}

/** Hann STFT, two real frames per complex FFT, max-pooled into `rows`; plus the average spectrum. */
export function computeSpectrum(mono: Float32Array, sr: number, opt: { cols?: number; rows?: number }, progress: ProgressFn): Spectrum {
  const len = mono.length;
  let N = sr <= 50000 ? 4096 : sr <= 100000 ? 8192 : 16384;
  while (N > 512 && N > len) N >>= 1;
  const fft = makeFFT(N), half = N / 2, bins = half + 1;
  const win = new Float64Array(N);
  let ws = 0;
  for (let i = 0; i < N; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); ws += win[i]; }
  const norm = (2 / ws) * (2 / ws);
  const cols = len > N ? Math.max(1, Math.min(opt.cols || 1600, Math.floor((len - N) / (N / 8)) + 1)) : 1;
  const hop = cols > 1 ? (len - N) / (cols - 1) : 0;
  const rows = Math.min(opt.rows || 1024, half);
  const rowOf = new Uint16Array(bins);
  for (let k = 0; k < bins; k++) rowOf[k] = Math.min(rows - 1, Math.floor(k * rows / bins));
  const spec = new Float32Array(cols * rows), ltasP = new Float64Array(bins);
  const re = new Float64Array(N), im = new Float64Array(N), mA = new Float64Array(rows), mB = new Float64Array(rows);
  for (let c = 0; c < cols; c += 2) {
    const two = c + 1 < cols;
    const s0 = Math.round(c * hop), s1 = two ? Math.round((c + 1) * hop) : 0;
    for (let i = 0; i < N; i++) {
      const a = s0 + i, b = s1 + i;
      re[i] = a < len ? mono[a] * win[i] : 0;
      im[i] = two && b < len ? mono[b] * win[i] : 0;
    }
    fft(re, im);
    mA.fill(0); mB.fill(0);
    for (let k = 0; k < bins; k++) {
      const nk = (N - k) & (N - 1);
      const zr = re[k], zi = im[k], wr = re[nk], wi = im[nk];
      const ar = (zr + wr) * 0.5, ai = (zi - wi) * 0.5;
      const pA = (ar * ar + ai * ai) * norm, r = rowOf[k];
      ltasP[k] += pA; if (pA > mA[r]) mA[r] = pA;
      if (two) {
        const br = (zi + wi) * 0.5, bi = (wr - zr) * 0.5;
        const pB = (br * br + bi * bi) * norm;
        ltasP[k] += pB; if (pB > mB[r]) mB[r] = pB;
      }
    }
    let o = c * rows;
    for (let r = 0; r < rows; r++) spec[o + r] = 10 * Math.log10(mA[r] + 1e-30);
    if (two) { o = (c + 1) * rows; for (let r = 0; r < rows; r++) spec[o + r] = 10 * Math.log10(mB[r] + 1e-30); }
    if ((c & 31) === 0) progress('Computing spectrum', c / cols);
  }
  const ltas = new Float32Array(bins);
  for (let k = 0; k < bins; k++) ltas[k] = 10 * Math.log10(ltasP[k] / cols + 1e-30);
  return { spec, cols, rows, ltas, N, binHz: sr / N };
}

/** Tempo and key from the mono mix, both on a ~11 kHz copy (nothing above that matters here). See ADR 0006. */
export function analyzeMusic(mono: Float32Array, sr: number, progress: ProgressFn): MusicResult {
  const dec = Math.max(1, Math.floor(sr / 11025)), fs = sr / dec, len = Math.floor(mono.length / dec);
  const x = new Float32Array(len);
  for (let i = 0, p = 0; i < len; i++) { let s = 0; for (let k = 0; k < dec; k++) s += mono[p++]; x[i] = s / dec; }
  const out: MusicResult = { bpm: null, bpmConf: 0, key: null };
  if (len < fs * 6) return out;   // too short to say anything

  // --- tempo: spectral-flux onset envelope, then a comb over its autocorrelation ---
  {
    const N = 1024, hop = 128, fft = makeFFT(N), win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const frames = Math.floor((len - N) / hop), kMax = Math.min(N / 2, Math.round(8000 / fs * N));
    const env = new Float32Array(frames), prev = new Float32Array(kMax), re = new Float64Array(N), im = new Float64Array(N);
    for (let f = 0; f < frames; f++) {
      const s = f * hop;
      for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      let flux = 0;
      for (let k = 1; k < kMax; k++) {
        const v = Math.log(1 + 1000 * Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N);
        const d = v - prev[k]; if (d > 0) flux += d;
        prev[k] = v;
      }
      env[f] = flux;
      if ((f & 1023) === 0) progress('Detecting tempo and key', 0.5 * f / frames);
    }
    // remove the slow trend so only the pulses remain
    const fr = fs / hop, w = Math.round(fr * 0.4), cs = new Float64Array(frames + 1);
    for (let i = 0; i < frames; i++) cs[i + 1] = cs[i] + env[i];
    const e = new Float32Array(frames);
    for (let i = 0; i < frames; i++) { const a = Math.max(0, i - w), b = Math.min(frames, i + w + 1); e[i] = Math.max(0, env[i] - (cs[b] - cs[a]) / (b - a)); }
    const maxLag = Math.min(Math.floor(frames / 2), Math.ceil(fr) * 16 + 4), acf = new Float64Array(maxLag + 1);
    for (let L = 1; L <= maxLag; L++) { let s = 0; for (let i = L; i < frames; i++) s += e[i] * e[i - L]; acf[L] = s / (frames - L); }
    const at = (L: number) => { const i = Math.floor(L), t = L - i; return i + 1 > maxLag ? 0 : acf[i] * (1 - t) + acf[i + 1] * t; };
    const score = (b: number) => { const L = fr * 60 / b; let s = 0; for (let k = 1; k <= 4; k++) s += at(k * L) / k; return s; };
    const prior = (b: number) => Math.exp(-0.5 * Math.pow(Math.log2(b / 122) / 0.9, 2));
    let best = 0, bestS = -Infinity, sum = 0, cnt = 0;
    for (let b = 60; b <= 200; b += 0.05) { const s = score(b); sum += s; cnt++; const v = s * prior(b); if (v > bestS) { bestS = v; best = b; } }
    // One frame of lag is ~0.3% at 128 BPM, so refine the period on far multiples of it,
    // where a frame of error divides down: parabolic peaks at 2L, 4L … 16L, weighted by k.
    {
      const L0 = fr * 60 / best;
      let num = 0, den = 0;
      for (const k of [2, 4, 6, 8, 12, 16]) {
        const c = k * L0;
        if (c + 3 > maxLag) break;
        let bi = Math.round(c);
        for (let j = Math.round(c) - 2; j <= Math.round(c) + 2; j++) if (acf[j] > acf[bi]) bi = j;
        const a = acf[bi - 1], b = acf[bi], d = acf[bi + 1], den2 = a - 2 * b + d;
        const peak = bi + (den2 < 0 ? 0.5 * (a - d) / den2 : 0);
        if (Math.abs(peak - c) < 2.5) { num += peak; den += k; }   // Σ(k·L_k) / Σk
      }
      if (den) best = fr * 60 / (num / den);
    }
    const mean = sum / cnt;
    if (mean > 0) { out.bpm = best; out.bpmConf = Math.min(1, Math.max(0, (score(best) / mean - 1) / 2)); }
  }

  // --- key: tuning-corrected chroma, matched against major/minor key profiles ---
  {
    const N = 8192, hop = 4096, fft = makeFFT(N), win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const k0 = Math.ceil(55 * N / fs), k1 = Math.min(N / 2 - 1, Math.floor(4200 * N / fs));
    const frames = Math.max(0, Math.floor((len - N) / hop));
    const mags: Float32Array[] = [], re = new Float64Array(N), im = new Float64Array(N);
    let tc = 0, ts = 0;   // circular mean of peak deviations from the 440 Hz grid
    for (let f = 0; f < frames; f++) {
      const s = f * hop;
      for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      const m = new Float32Array(k1 + 2);
      for (let k = k0 - 1; k <= k1 + 1; k++) m[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      for (let k = k0; k <= k1; k++) {
        if (m[k] > m[k - 1] && m[k] >= m[k + 1] && m[k] > 1e-3 * N) {
          const a = m[k - 1], b = m[k], c = m[k + 1], d = 0.5 * (a - c) / (a - 2 * b + c || 1e-12);
          const cents = 1200 * Math.log2(((k + d) * fs / N) / 440), ang = 2 * Math.PI * cents / 100;
          tc += b * Math.cos(ang); ts += b * Math.sin(ang);
        }
      }
      mags.push(m);
      if ((f & 31) === 0) progress('Detecting tempo and key', 0.5 + 0.4 * f / Math.max(1, frames));
    }
    const tuning = Math.atan2(ts, tc) / (2 * Math.PI) * 100;   // cents, −50…50
    const ref = 440 * Math.pow(2, tuning / 1200);
    const pcOf = new Int8Array(k1 + 1), wOf = new Float32Array(k1 + 1);
    for (let k = k0; k <= k1; k++) {
      const p = 12 * Math.log2(k * fs / N / ref) + 69, r = Math.round(p);
      pcOf[k] = ((r % 12) + 12) % 12;
      wOf[k] = Math.pow(Math.cos(Math.PI * (p - r)), 2);
    }
    const chroma = new Float64Array(12);
    for (const m of mags) {
      // Only tonal peaks vote (kick sweeps and noise don't), with square-root weighting so a
      // note's fundamental outweighs its overtones (the 3rd harmonic of A is an E).
      const c = new Float64Array(12);
      for (let k = k0; k <= k1; k++) {
        if (!(m[k] > m[k - 1] && m[k] >= m[k + 1])) continue;
        let loc = 0; for (let j = -8; j <= 8; j++) loc += m[Math.min(k1 + 1, Math.max(k0 - 1, k + j))];
        if (m[k] < 2.5 * loc / 17) continue;
        c[pcOf[k]] += wOf[k] * Math.sqrt(m[k] / N);
      }
      let mx = 0; for (let i = 0; i < 12; i++) if (c[i] > mx) mx = c[i];
      if (mx > 0) for (let i = 0; i < 12; i++) chroma[i] += c[i] / mx;   // each frame votes equally
    }
    // Temperley (Kostka–Payne) profiles, index 0 = tonic
    const MAJ = [0.748, 0.060, 0.488, 0.082, 0.670, 0.460, 0.096, 0.715, 0.104, 0.366, 0.057, 0.400];
    const MIN = [0.712, 0.084, 0.474, 0.618, 0.049, 0.460, 0.105, 0.747, 0.404, 0.067, 0.133, 0.330];
    const corr = (prof: number[], t: number) => {
      let mx = 0, mp = 0; for (let i = 0; i < 12; i++) { mx += chroma[(i + t) % 12]; mp += prof[i]; }
      mx /= 12; mp /= 12;
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < 12; i++) { const a = chroma[(i + t) % 12] - mx, b = prof[i] - mp; sxy += a * b; sxx += a * a; syy += b * b; }
      return sxx > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
    };
    const cands: { tonic: number; mode: 'major' | 'minor'; r: number }[] = [];
    for (let t = 0; t < 12; t++) { cands.push({ tonic: t, mode: 'major', r: corr(MAJ, t) }); cands.push({ tonic: t, mode: 'minor', r: corr(MIN, t) }); }
    cands.sort((a, b) => b.r - a.r);
    if (cands[0].r > 0) {
      const key: KeyResult = { tonic: cands[0].tonic, mode: cands[0].mode, r: cands[0].r, margin: cands[0].r - cands[1].r, runnerUp: { tonic: cands[1].tonic, mode: cands[1].mode }, tuning };
      out.key = key;
    }
  }
  progress('Detecting tempo and key', 1);
  return out;
}

/** Deterministic 12 s, 96 kHz example: lossy-style 16 kHz wall, 16-bit samples, labelled 24-bit. */
export function synthDemo(): { channels: Float32Array[]; sr: number; bits: number } {
  const sr = 96000, secs = 12, len = sr * secs, N = 4096, hop = N / 2;
  const fft = makeFFT(N), cutBin = Math.floor(16000 * N / sr), TAU = 6.283185307179586;
  let seed = 0x2545F491;
  function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  function gauss() { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
  const chords = [[110, 138.6, 164.8, 220], [98, 123.5, 146.8, 196], [87.3, 110, 130.8, 174.6], [82.4, 103.8, 123.5, 164.8]];
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(TAU * i / N);
  const out = [new Float32Array(len), new Float32Array(len)];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= len; s += hop) {
    const t = (s + N / 2) / sr;
    const beat = (t % 0.5) / 0.5, eighth = (t % 0.25) / 0.25;
    const chord = chords[Math.floor(t / 2) % 4];
    const hat = Math.exp(-eighth * 14), kick = Math.exp(-beat * 9), swell = 0.75 + 0.25 * Math.sin(t * 0.9);
    for (let c = 0; c < 2; c++) {
      re.fill(0); im.fill(0);
      for (let k = 1; k <= cutBin; k++) {
        const fr = k * sr / N, tilt = 1 / Math.sqrt(1 + fr / 180);
        const a = 0.05 * tilt * (fr > 3500 ? (0.25 + 1.6 * hat) : 0.6 * swell);
        re[k] = gauss() * a; im[k] = gauss() * a;
      }
      for (let k = 1; k <= 6; k++) { const a = 3.5 * kick * (1 - k / 7); re[k] += a * gauss(); im[k] += a * gauss(); }
      for (const f0 of chord) {
        for (let h = 1; f0 * h < 16000; h++) {
          const k = Math.round(f0 * h * N / sr), a = 1.2 * swell / Math.pow(h, 0.9), ph = rnd() * TAU;
          re[k] += a * Math.cos(ph); im[k] += a * Math.sin(ph);
        }
      }
      re[0] = 0; im[0] = 0; re[N / 2] = 0; im[N / 2] = 0;
      for (let k = 1; k < N / 2; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
      for (let k = 0; k < N; k++) im[k] = -im[k];
      fft(re, im);
      const o = out[c];
      for (let i = 0; i < N; i++) o[s + i] += re[i] * win[i];
    }
  }
  let peak = 0;
  for (const o of out) for (let i = 0; i < len; i++) { const a = Math.abs(o[i]); if (a > peak) peak = a; }
  const g = 0.89 / peak;
  for (const o of out) for (let i = 0; i < len; i++) {
    let q = Math.round(o[i] * g * 32767 + rnd() - rnd());
    if (q > 32767) q = 32767; if (q < -32768) q = -32768;
    o[i] = q / 32768;
  }
  return { channels: out, sr, bits: 24 };
}

/** Full analysis of one job: samples → spectrum → tempo/key. Runs in the worker (or main thread as fallback). */
export function runJob(input: AnalysisJob, progress: ProgressFn, opts: { fingerprint?: boolean } = {}): AnalysisResult {
  let job = input, demoPcm: Int16Array | null = null;
  if (job.type === 'demo') {
    progress('Generating example', 0);
    const d = synthDemo();
    const L = d.channels[0], R = d.channels[1];
    demoPcm = new Int16Array(L.length * 2);   // interleaved copy for the player
    for (let i = 0; i < L.length; i++) {
      demoPcm[2 * i] = Math.min(32767, Math.round(L[i] * 32768));
      demoPcm[2 * i + 1] = Math.min(32767, Math.round(R[i] * 32768));
    }
    job = { type: 'float', channels: d.channels, sr: d.sr, bits: d.bits };
  }
  const sr = job.sr;
  let nch: number, len: number, bits: number, isInt = false, floatFmt = false, read: FrameReader;
  if (job.type === 'pcm') {
    const u8 = new Uint8Array(job.buffer), p = job.pcm;
    nch = p.ch; len = Math.floor(p.len / p.blockAlign);
    isInt = p.fmt === 'int'; floatFmt = p.fmt === 'float';
    bits = (p.blockAlign / p.ch) * 8;
    read = makePcmReader(u8, p);
  } else {
    const chs = job.channels;
    nch = chs.length; len = chs[0].length; bits = job.bits || 0;
    read = function (i, f) { for (let c = 0; c < nch; c++) f[c] = chs[c][i]; };
  }
  if (!len) throw new Error('The file contains no audio samples.');
  const a = analyzeSamples(nch, len, bits, isInt, floatFmt, read, progress);
  const s = computeSpectrum(a.mono, sr, { cols: 1600, rows: 1024 }, progress);
  const music = analyzeMusic(a.mono, sr, progress);
  const fp = opts.fingerprint ? fingerprint(a.mono, sr) : undefined;
  return {
    fp,
    music,
    spec: s.spec, cols: s.cols, rows: s.rows, ltas: s.ltas, N: s.N, binHz: s.binHz,
    stats: a.stats, sr, duration: len / sr, channels: nch, containerBits: bits, demoPcm,
  };
}
