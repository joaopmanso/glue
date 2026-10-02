//! src/core/audio/analyze.ts: samples → stats and mono mix → spectrum → tempo and key. The f32 storage points and the
//! order of every sum are JavaScript's (Float32Array stores round; the rest is f64).
use crate::fft::Fft;
use crate::js;
use crate::types::{AnalysisResult, Key, KeyResult, Mode, MusicResult, PcmLayout, SampleStats};
use std::f64::consts::PI;

/// What `runJob` analyses: raw PCM out of a WAV/AIFF file, decoded channels, or the built-in example.
pub enum Job<'a> {
  Pcm { bytes: &'a [u8], pcm: PcmLayout, sr: f64 },
  Float { channels: Vec<Vec<f32>>, sr: f64, bits: f64 },
  Demo,
}

/// `makePcmReader`: frame i of raw PCM into floats and, for integer formats, the raw ints.
pub struct PcmReader<'a> { u8: &'a [u8], b: usize, ch: usize, le: bool, base: usize, stride: usize, float: bool, unsigned8: bool }

impl<'a> PcmReader<'a> {
  pub fn new(u8: &'a [u8], pcm: &PcmLayout) -> PcmReader<'a> {
    PcmReader {
      u8, b: (pcm.block_align / pcm.ch) as usize, ch: pcm.ch as usize, le: pcm.le, base: pcm.off as usize, stride: pcm.block_align as usize,
      float: pcm.fmt == "float", unsigned8: pcm.unsigned8.unwrap_or(false),
    }
  }
  fn bytes<const N: usize>(&self, p: usize) -> [u8; N] {
    let mut a = [0u8; N];
    a.copy_from_slice(&self.u8[p..p + N]);
    if self.le { a } else { a.reverse(); a }
  }
  fn at(&self, p: usize) -> i32 { *self.u8.get(p).unwrap_or(&0) as i32 }
  pub fn read(&self, i: usize, f: &mut [f64], iv: &mut [i32]) {
    let mut p = self.base + i * self.stride;
    for c in 0..self.ch {
      if self.float {
        f[c] = if self.b == 8 { f64::from_le_bytes(self.bytes::<8>(p)) } else { f32::from_le_bytes(self.bytes::<4>(p)) as f64 };
      } else {
        let v: i32;
        if self.b == 2 { v = i16::from_le_bytes(self.bytes::<2>(p)) as i32; f[c] = v as f64 / 32768.0; }
        else if self.b == 3 {
          let w = if self.le { self.at(p) | (self.at(p + 1) << 8) | (self.at(p + 2) << 16) } else { (self.at(p) << 16) | (self.at(p + 1) << 8) | self.at(p + 2) };
          v = (w << 8) >> 8; f[c] = v as f64 / 8388608.0;
        }
        else if self.b == 4 { v = i32::from_le_bytes(self.bytes::<4>(p)); f[c] = v as f64 / 2147483648.0; }
        else { v = if self.unsigned8 { self.at(p) - 128 } else { (self.at(p) << 24) >> 24 }; f[c] = v as f64 / 128.0; }
        iv[c] = v;
      }
      p += self.b;
    }
  }
}

/// `analyzeSamples`: one pass over every sample: mono mix, level, clipping, wasted low bits, stereo identity.
pub fn analyze_samples(nch: usize, len: usize, bits: f64, is_int: bool, float_fmt: bool, read: &mut dyn FnMut(usize, &mut [f64], &mut [i32])) -> (Vec<f32>, SampleStats) {
  let mut mono = vec![0f32; len];
  let (mut f, mut iv, mut run) = (vec![0f64; nch], vec![0i32; nch], vec![0i32; nch]);
  let scale = if !is_int && !float_fmt && (8.0..=24.0).contains(&bits) { js::pow(2.0, bits - 1.0) } else { 0.0 };
  let (mut or_bits, mut non_int, mut peak, mut clip_runs, mut sum_sq, mut on16, mut on24) = (0i32, 0f64, 0f64, 0f64, 0f64, 0f64, 0f64);
  let (mut lr_max, mut s_ll, mut s_rr, mut s_lr) = (0f64, 0f64, 0f64, 0f64);
  for i in 0..len {
    read(i, &mut f, &mut iv);
    let mut m = 0f64;
    for c in 0..nch {
      let v = f[c]; m += v;
      let a = if v < 0.0 { -v } else { v };
      if a > peak { peak = a; }
      sum_sq += v * v;
      if a >= 0.99995 { run[c] += 1; if run[c] == 3 { clip_runs += 1.0; } } else { run[c] = 0; }
      if is_int { or_bits |= iv[c]; }
      else if scale != 0.0 {
        let x = v * scale; let r = js::round(x);
        if (x - r).abs() > 1e-4 { non_int += 1.0; } else { or_bits |= js::to_int32(r); }
      }
      if float_fmt {
        let x16 = v * 32768.0; if x16 == js::round(x16) { on16 += 1.0; }
        let x24 = v * 8388608.0; if x24 == js::round(x24) { on24 += 1.0; }
      }
    }
    mono[i] = (m / nch as f64) as f32;
    if nch >= 2 {
      let (l, r) = (f[0], f[1]);
      let d = if l > r { l - r } else { r - l };
      if d > lr_max { lr_max = d; }
      s_ll += l * l; s_rr += r * r; s_lr += l * r;
    }
  }
  let mut wasted = None;
  if or_bits != 0 {
    let u = or_bits as u32;
    let mut w = 0u32;
    while w < 32 && ((u >> w) & 1) == 0 { w += 1; }
    wasted = Some(w as f64);
  }
  let total = (len * nch) as f64;
  let assessed = (is_int || scale > 0.0) && non_int <= total * 0.001;
  let stats = SampleStats {
    peak, rms: (sum_sq / total.max(1.0)).sqrt(), clip_runs, wasted, assessed, non_int, float_fmt,
    on16: if float_fmt { on16 / total } else { 0.0 }, on24: if float_fmt { on24 / total } else { 0.0 },
    lr_identical: nch >= 2 && lr_max == 0.0 && peak > 0.0,
    lr_corr: if nch >= 2 && s_ll > 0.0 && s_rr > 0.0 { Some(s_lr / (s_ll * s_rr).sqrt()) } else { None },
    silent: peak == 0.0,
  };
  (mono, stats)
}

pub struct Spectrum { pub spec: Vec<f32>, pub cols: usize, pub rows: usize, pub ltas: Vec<f32>, pub n: usize, pub bin_hz: f64 }

/// `computeSpectrum`: Hann STFT, two real frames per complex FFT, max-pooled into `rows`; plus the average spectrum.
pub fn compute_spectrum(mono: &[f32], sr: f64, opt_cols: usize, opt_rows: usize) -> Spectrum {
  let len = mono.len();
  let mut n: usize = if sr <= 50000.0 { 4096 } else if sr <= 100000.0 { 8192 } else { 16384 };
  while n > 512 && n > len { n >>= 1; }
  let fft = Fft::new(n);
  let (half, bins) = (n / 2, n / 2 + 1);
  let mut win = vec![0f64; n];
  let mut ws = 0f64;
  for i in 0..n { win[i] = 0.5 - 0.5 * js::cos(2.0 * PI * i as f64 / (n - 1) as f64); ws += win[i]; }
  let norm = (2.0 / ws) * (2.0 / ws);
  let cols = if len > n { 1usize.max(opt_cols.min((((len - n) as f64) / ((n / 8) as f64)).floor() as usize + 1)) } else { 1 };
  let hop = if cols > 1 { (len - n) as f64 / (cols - 1) as f64 } else { 0.0 };
  let rows = opt_rows.min(half);
  let row_of: Vec<usize> = (0..bins).map(|k| (rows - 1).min(((k * rows) as f64 / bins as f64).floor() as usize)).collect();
  let mut spec = vec![0f32; cols * rows];
  let mut ltas_p = vec![0f64; bins];
  let (mut re, mut im, mut ma, mut mb) = (vec![0f64; n], vec![0f64; n], vec![0f64; rows], vec![0f64; rows]);
  let mut c = 0;
  while c < cols {
    let two = c + 1 < cols;
    let s0 = js::round(c as f64 * hop) as usize;
    let s1 = if two { js::round((c + 1) as f64 * hop) as usize } else { 0 };
    for i in 0..n {
      let (a, b) = (s0 + i, s1 + i);
      re[i] = if a < len { mono[a] as f64 * win[i] } else { 0.0 };
      im[i] = if two && b < len { mono[b] as f64 * win[i] } else { 0.0 };
    }
    fft.run(&mut re, &mut im);
    ma.fill(0.0); mb.fill(0.0);
    for k in 0..bins {
      let nk = (n - k) & (n - 1);
      let (zr, zi, wr, wi) = (re[k], im[k], re[nk], im[nk]);
      let (ar, ai) = ((zr + wr) * 0.5, (zi - wi) * 0.5);
      let pa = (ar * ar + ai * ai) * norm;
      let r = row_of[k];
      ltas_p[k] += pa; if pa > ma[r] { ma[r] = pa; }
      if two {
        let (br, bi) = ((zi + wi) * 0.5, (wr - zr) * 0.5);
        let pb = (br * br + bi * bi) * norm;
        ltas_p[k] += pb; if pb > mb[r] { mb[r] = pb; }
      }
    }
    let o = c * rows;
    for r in 0..rows { spec[o + r] = (10.0 * js::log10(ma[r] + 1e-30)) as f32; }
    if two { let o = (c + 1) * rows; for r in 0..rows { spec[o + r] = (10.0 * js::log10(mb[r] + 1e-30)) as f32; } }
    c += 2;
  }
  let ltas = (0..bins).map(|k| (10.0 * js::log10(ltas_p[k] / cols as f64 + 1e-30)) as f32).collect();
  Spectrum { spec, cols, rows, ltas, n, bin_hz: sr / n as f64 }
}

/// `decimate`: the mono mix at ~11 kHz (nothing above that matters for tempo and key).
pub fn decimate(mono: &[f32], sr: f64) -> (Vec<f32>, f64) {
  let dec = 1usize.max((sr / 11025.0).floor() as usize);
  let fs = sr / dec as f64;
  let len = mono.len() / dec;
  let mut x = vec![0f32; len];
  let mut p = 0;
  for item in x.iter_mut() { let mut s = 0f64; for _ in 0..dec { s += mono[p] as f64; p += 1; } *item = (s / dec as f64) as f32; }
  (x, fs)
}

pub struct Onsets { pub e: Vec<f32>, pub fr: f64, pub frames: usize }

/// `onsetEnvelope`: spectral flux with the slow trend removed.
pub fn onset_envelope(x: &[f32], fs: f64) -> Onsets {
  let (n, hop) = (1024usize, 128usize);
  let fft = Fft::new(n);
  let win: Vec<f64> = (0..n).map(|i| 0.5 - 0.5 * js::cos(2.0 * PI * i as f64 / n as f64)).collect();
  let len = x.len();
  let frames = if len > n { (len - n) / hop } else { 0 };
  let k_max = (n / 2).min(js::round(8000.0 / fs * n as f64) as usize);
  let mut env = vec![0f32; frames];
  let mut prev = vec![0f32; k_max];
  let (mut re, mut im) = (vec![0f64; n], vec![0f64; n]);
  for f in 0..frames {
    let s = f * hop;
    for i in 0..n { re[i] = x[s + i] as f64 * win[i]; im[i] = 0.0; }
    fft.run(&mut re, &mut im);
    let mut flux = 0f64;
    for k in 1..k_max {
      let v = js::log(1.0 + 1000.0 * (re[k] * re[k] + im[k] * im[k]).sqrt() / n as f64);
      let d = v - prev[k] as f64; if d > 0.0 { flux += d; }
      prev[k] = v as f32;
    }
    env[f] = flux as f32;
  }
  let fr = fs / hop as f64;
  let w = js::round(fr * 0.4) as usize;
  let mut cs = vec![0f64; frames + 1];
  for i in 0..frames { cs[i + 1] = cs[i] + env[i] as f64; }
  let mut e = vec![0f32; frames];
  for i in 0..frames {
    let a = i.saturating_sub(w);
    let b = frames.min(i + w + 1);
    e[i] = 0f64.max(env[i] as f64 - (cs[b] - cs[a]) / (b - a) as f64) as f32;
  }
  Onsets { e, fr, frames }
}

const MAJ: [f64; 12] = [0.748, 0.060, 0.488, 0.082, 0.670, 0.460, 0.096, 0.715, 0.104, 0.366, 0.057, 0.400];
const MIN: [f64; 12] = [0.712, 0.084, 0.474, 0.618, 0.049, 0.460, 0.105, 0.747, 0.404, 0.067, 0.133, 0.330];

/// `analyzeMusic`: tempo and key from the mono mix, both on a ~11 kHz copy (ADR 0006).
pub fn analyze_music(mono: &[f32], sr: f64) -> MusicResult {
  let (x, fs) = decimate(mono, sr);
  let len = x.len();
  let mut out = MusicResult { bpm: None, bpm_conf: 0.0, key: None };
  if (len as f64) < fs * 6.0 { return out; }

  // tempo: spectral-flux onset envelope, then a comb over its autocorrelation
  {
    let Onsets { e, fr, frames } = onset_envelope(&x, fs);
    let max_lag = (frames / 2).min(fr.ceil() as usize * 16 + 4);
    let mut acf = vec![0f64; max_lag + 1];
    for l in 1..=max_lag {
      let mut s = 0f64;
      for i in l..frames { s += e[i] as f64 * e[i - l] as f64; }
      acf[l] = s / (frames - l) as f64;
    }
    let at = |l: f64| -> f64 { let i = l.floor(); let t = l - i; let i = i as usize; if i + 1 > max_lag { 0.0 } else { acf[i] * (1.0 - t) + acf[i + 1] * t } };
    let score = |b: f64| -> f64 { let l = fr * 60.0 / b; let mut s = 0f64; for k in 1..=4 { s += at(k as f64 * l) / k as f64; } s };
    let prior = |b: f64| -> f64 { let q = js::log2(b / 122.0) / 0.9; js::exp(-0.5 * (q * q)) };
    let (mut best, mut best_s, mut sum, mut cnt) = (0f64, f64::NEG_INFINITY, 0f64, 0f64);
    let mut b = 60f64;
    while b <= 200.0 { let s = score(b); sum += s; cnt += 1.0; let v = s * prior(b); if v > best_s { best_s = v; best = b; } b += 0.05; }
    // Refine the period on far multiples of the lag: parabolic peaks at 2L, 4L … 16L, weighted by k.
    {
      let l0 = fr * 60.0 / best;
      let (mut num, mut den) = (0f64, 0f64);
      for k in [2.0, 4.0, 6.0, 8.0, 12.0, 16.0] {
        let c = k * l0;
        if c + 3.0 > max_lag as f64 { break; }
        let rc = js::round(c) as i64;
        let mut bi = rc;
        for j in rc - 2..=rc + 2 { if acf[j as usize] > acf[bi as usize] { bi = j; } }
        let (a, bb, d) = (acf[(bi - 1) as usize], acf[bi as usize], acf[(bi + 1) as usize]);
        let den2 = a - 2.0 * bb + d;
        let peak = bi as f64 + if den2 < 0.0 { 0.5 * (a - d) / den2 } else { 0.0 };
        if (peak - c).abs() < 2.5 { num += peak; den += k; }
      }
      if den != 0.0 { best = fr * 60.0 / (num / den); }
    }
    let mean = sum / cnt;
    if mean > 0.0 { out.bpm = Some(best); out.bpm_conf = 1f64.min(0f64.max((score(best) / mean - 1.0) / 2.0)); }
  }

  // key: tuning-corrected chroma, matched against major/minor key profiles
  {
    let (n, hop) = (8192usize, 4096usize);
    let fft = Fft::new(n);
    let win: Vec<f64> = (0..n).map(|i| 0.5 - 0.5 * js::cos(2.0 * PI * i as f64 / n as f64)).collect();
    let nf = n as f64;
    let k0 = (55.0 * nf / fs).ceil() as usize;
    let k1 = (n / 2 - 1).min((4200.0 * nf / fs).floor() as usize);
    let frames = if len > n { (len - n) / hop } else { 0 };
    let mut mags: Vec<Vec<f32>> = Vec::with_capacity(frames);
    let (mut re, mut im) = (vec![0f64; n], vec![0f64; n]);
    let (mut tc, mut ts) = (0f64, 0f64);
    for f in 0..frames {
      let s = f * hop;
      for i in 0..n { re[i] = x[s + i] as f64 * win[i]; im[i] = 0.0; }
      fft.run(&mut re, &mut im);
      let mut m = vec![0f32; k1 + 2];
      for k in k0 - 1..=k1 + 1 { m[k] = (re[k] * re[k] + im[k] * im[k]).sqrt() as f32; }
      for k in k0..=k1 {
        if m[k] > m[k - 1] && m[k] >= m[k + 1] && m[k] as f64 > 1e-3 * nf {
          let (a, b, c) = (m[k - 1] as f64, m[k] as f64, m[k + 1] as f64);
          let q = a - 2.0 * b + c;
          let d = 0.5 * (a - c) / if q != 0.0 && !q.is_nan() { q } else { 1e-12 };
          let cents = 1200.0 * js::log2(((k as f64 + d) * fs / nf) / 440.0);
          let ang = 2.0 * PI * cents / 100.0;
          tc += b * js::cos(ang); ts += b * js::sin(ang);
        }
      }
      mags.push(m);
    }
    let tuning = js::atan2(ts, tc) / (2.0 * PI) * 100.0;
    let reference = 440.0 * js::pow(2.0, tuning / 1200.0);
    let mut pc_of = vec![0usize; k1 + 1];
    let mut w_of = vec![0f32; k1 + 1];
    for k in k0..=k1 {
      let p = 12.0 * js::log2(k as f64 * fs / nf / reference) + 69.0;
      let r = js::round(p);
      pc_of[k] = (((r as i64 % 12) + 12) % 12) as usize;
      let cv = js::cos(PI * (p - r));
      w_of[k] = (cv * cv) as f32;
    }
    let mut chroma = [0f64; 12];
    for m in &mags {
      let mut c = [0f64; 12];
      for k in k0..=k1 {
        if !(m[k] > m[k - 1] && m[k] >= m[k + 1]) { continue; }
        let mut loc = 0f64;
        for j in -8i64..=8 { let idx = ((k1 + 1) as i64).min(((k0 - 1) as i64).max(k as i64 + j)) as usize; loc += m[idx] as f64; }
        if (m[k] as f64) < 2.5 * loc / 17.0 { continue; }
        c[pc_of[k]] += w_of[k] as f64 * (m[k] as f64 / nf).sqrt();
      }
      let mut mx = 0f64;
      for v in c { if v > mx { mx = v; } }
      if mx > 0.0 { for i in 0..12 { chroma[i] += c[i] / mx; } }
    }
    let corr = |prof: &[f64; 12], t: usize| -> f64 {
      let (mut mx, mut mp) = (0f64, 0f64);
      for i in 0..12 { mx += chroma[(i + t) % 12]; mp += prof[i]; }
      mx /= 12.0; mp /= 12.0;
      let (mut sxy, mut sxx, mut syy) = (0f64, 0f64, 0f64);
      for i in 0..12 { let a = chroma[(i + t) % 12] - mx; let b = prof[i] - mp; sxy += a * b; sxx += a * a; syy += b * b; }
      if sxx > 0.0 { sxy / (sxx * syy).sqrt() } else { 0.0 }
    };
    let mut cands: Vec<(f64, Mode, f64)> = Vec::with_capacity(24);
    for t in 0..12 { cands.push((t as f64, Mode::Major, corr(&MAJ, t))); cands.push((t as f64, Mode::Minor, corr(&MIN, t))); }
    // JavaScript's sort is stable: equal correlations keep their order.
    cands.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
    if cands[0].2 > 0.0 {
      out.key = Some(KeyResult { tonic: cands[0].0, mode: cands[0].1, r: cands[0].2, margin: cands[0].2 - cands[1].2, runner_up: Key { tonic: cands[1].0, mode: cands[1].1 }, tuning });
    }
  }
  out
}

/// `synthDemo`: the deterministic 12 s, 96 kHz example (a lossy-style 16 kHz wall, 16-bit samples, labelled 24-bit).
pub fn synth_demo() -> (Vec<Vec<f32>>, f64, f64) {
  let (sr, secs, n) = (96000usize, 12usize, 4096usize);
  let len = sr * secs;
  let hop = n / 2;
  let fft = Fft::new(n);
  let cut_bin = (16000.0 * n as f64 / sr as f64).floor() as usize;
  const TAU: f64 = std::f64::consts::TAU;   // the demo's 6.283185307179586
  let mut seed: u32 = 0x2545F491;
  let mut rnd = move || -> f64 { seed = seed.wrapping_mul(1664525).wrapping_add(1013904223); seed as f64 / 4294967296.0 };
  let chords: [&[f64]; 4] = [&[110.0, 138.6, 164.8, 220.0], &[98.0, 123.5, 146.8, 196.0], &[87.3, 110.0, 130.8, 174.6], &[82.4, 103.8, 123.5, 164.8]];
  let win: Vec<f64> = (0..n).map(|i| 0.5 - 0.5 * js::cos(TAU * i as f64 / n as f64)).collect();
  let mut out = vec![vec![0f32; len], vec![0f32; len]];
  let (mut re, mut im) = (vec![0f64; n], vec![0f64; n]);
  let srf = sr as f64;
  let mut s = 0usize;
  while s + n <= len {
    let t = (s as f64 + n as f64 / 2.0) / srf;
    let beat = (t % 0.5) / 0.5;
    let eighth = (t % 0.25) / 0.25;
    let chord = chords[((t / 2.0).floor() as usize) % 4];
    let hat = js::exp(-eighth * 14.0);
    let kick = js::exp(-beat * 9.0);
    let swell = 0.75 + 0.25 * js::sin(t * 0.9);
    for o in out.iter_mut() {
      re.fill(0.0); im.fill(0.0);
      for k in 1..=cut_bin {
        let fr = k as f64 * srf / n as f64;
        let tilt = 1.0 / (1.0 + fr / 180.0).sqrt();
        let a = 0.05 * tilt * if fr > 3500.0 { 0.25 + 1.6 * hat } else { 0.6 * swell };
        re[k] = gauss(&mut rnd) * a; im[k] = gauss(&mut rnd) * a;
      }
      for k in 1..=6 { let a = 3.5 * kick * (1.0 - k as f64 / 7.0); re[k] += a * gauss(&mut rnd); im[k] += a * gauss(&mut rnd); }
      for &f0 in chord {
        let mut h = 1;
        while f0 * (h as f64) < 16000.0 {
          let k = js::round(f0 * h as f64 * n as f64 / srf) as usize;
          let a = 1.2 * swell / js::pow(h as f64, 0.9);
          let ph = rnd() * TAU;
          re[k] += a * js::cos(ph); im[k] += a * js::sin(ph);
          h += 1;
        }
      }
      re[0] = 0.0; im[0] = 0.0; re[n / 2] = 0.0; im[n / 2] = 0.0;
      for k in 1..n / 2 { re[n - k] = re[k]; im[n - k] = -im[k]; }
      for v in im.iter_mut() { *v = -*v; }
      fft.run(&mut re, &mut im);
      for i in 0..n { o[s + i] = (o[s + i] as f64 + re[i] * win[i]) as f32; }
    }
    s += hop;
  }
  let mut peak = 0f64;
  for o in &out { for &v in o.iter() { let a = (v as f64).abs(); if a > peak { peak = a; } } }
  let g = 0.89 / peak;
  for o in out.iter_mut() {
    for v in o.iter_mut() {
      let a = rnd(); let b = rnd();
      let mut q = js::round(*v as f64 * g * 32767.0 + a - b);
      if q > 32767.0 { q = 32767.0; }
      if q < -32768.0 { q = -32768.0; }
      *v = (q / 32768.0) as f32;
    }
  }
  (out, srf, 24.0)
}

fn gauss(rnd: &mut impl FnMut() -> f64) -> f64 {
  let r = rnd();
  let u = if r != 0.0 { r } else { 1e-12 };
  let v = rnd();
  (-2.0 * js::log(u)).sqrt() * js::cos(std::f64::consts::TAU * v)
}

/// `runJob`: samples → spectrum → tempo/key (→ fingerprint, for the background analysis).
pub fn run_job(job: Job, fingerprint: bool) -> Result<AnalysisResult, String> {
  let (job, demo) = match job { Job::Demo => { let (c, sr, bits) = synth_demo(); (Job::Float { channels: c, sr, bits }, true) } j => (j, false) };
  let _ = demo;
  let (sr, nch, len, bits, mono, stats);
  match &job {
    Job::Pcm { bytes, pcm, sr: s } => {
      sr = *s;
      nch = pcm.ch as usize;
      len = (pcm.len / pcm.block_align).floor().max(0.0) as usize;
      let (is_int, float_fmt) = (pcm.fmt == "int", pcm.fmt == "float");
      bits = (pcm.block_align / pcm.ch) * 8.0;
      if len == 0 { return Err("The file contains no audio samples.".into()); }
      let r = PcmReader::new(bytes, pcm);
      let (m, st) = analyze_samples(nch, len, bits, is_int, float_fmt, &mut |i, f, iv| r.read(i, f, iv));
      mono = m; stats = st;
    }
    Job::Float { channels, sr: s, bits: b } => {
      sr = *s;
      nch = channels.len();
      len = channels.first().map(|c| c.len()).unwrap_or(0);
      bits = if *b != 0.0 && !b.is_nan() { *b } else { 0.0 };
      if len == 0 { return Err("The file contains no audio samples.".into()); }
      let (m, st) = analyze_samples(nch, len, bits, false, false, &mut |i, f, _| { for c in 0..nch { f[c] = channels[c][i] as f64; } });
      mono = m; stats = st;
    }
    Job::Demo => unreachable!(),
  }
  drop(job);
  crate::control::check()?;
  let s = compute_spectrum(&mono, sr, 1600, 1024);
  crate::control::check()?;
  let music = analyze_music(&mono, sr);
  crate::control::check()?;
  let fp = if fingerprint { Some(crate::audio::fingerprint::fingerprint(&mono, sr)) } else { None };
  Ok(AnalysisResult {
    fp, music, spec: s.spec, cols: s.cols, rows: s.rows, ltas: s.ltas, n: s.n, bin_hz: s.bin_hz, stats, sr, duration: len as f64 / sr,
    channels: nch, container_bits: bits,
  })
}
