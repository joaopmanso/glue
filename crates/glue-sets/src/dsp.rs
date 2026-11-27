//! The set's signal processing (ADR 0199, 0201): `src/core/sets/dsp.ts`, line for line. JavaScript's numbers: maths in
//! f64, and f32 wherever the TypeScript stores into a Float32Array.
use glue_audio::js;
use std::f64::consts::PI;

/// `Math.floor` as an index (may be negative).
#[inline] fn fl(x: f64) -> i64 { x.floor() as i64 }
#[inline] fn at(x: &[f32], i: i64) -> f64 { if i >= 0 && (i as usize) < x.len() { x[i as usize] as f64 } else { 0.0 } }

// ---------- resampling ----------

/// Any rate to `to` (windowed sinc, 32 taps, anti-aliased when going down). `resample`.
pub fn resample(x: &[f32], from: f64, to: f64) -> Vec<f32> {
  if from == to { return x.to_vec(); }
  let ratio = from / to;
  let n = (x.len() as f64 * to / from + 1e-9).floor() as usize;
  let cut = js::min(1.0, 1.0 / ratio);
  let half = 16.0;
  let width = (half / cut).ceil() as i64;
  const PH: i64 = 512;
  let w2 = (2 * width) as usize;
  let mut table = vec![0f32; (PH as usize + 1) * w2];
  for ph in 0..=PH {
    let frac = ph as f64 / PH as f64;
    for k in (-width + 1)..=width {
      let d = k as f64 - frac;
      let wd = width as f64;
      let w = if d.abs() >= wd { 0.0 } else { 0.42 + 0.5 * js::cos(PI * d / wd) + 0.08 * js::cos(2.0 * PI * d / wd) };
      let s = if d == 0.0 { 1.0 } else { js::sin(PI * cut * d) / (PI * cut * d) };
      table[ph as usize * w2 + (k + width - 1) as usize] = (cut * s * w) as f32;
    }
  }
  let mut out = vec![0f32; n];
  let len = x.len() as i64;
  for (i, o) in out.iter_mut().enumerate() {
    let p = i as f64 * ratio;
    let i0 = fl(p);
    let ph = js::round((p - i0 as f64) * PH as f64) as usize;
    let row = ph * w2;
    let mut s = 0.0f64;
    for k in (-width + 1)..=width {
      let j = i0 + k;
      if j >= 0 && j < len { s += x[j as usize] as f64 * table[row + (k + width - 1) as usize] as f64; }
    }
    *o = s as f32;
  }
  out
}

/// Catmull-Rom read at a fractional position (0 outside). `cubicAt`.
pub fn cubic_at(x: &[f32], p: f64) -> f64 {
  let i = fl(p);
  let t = p - i as f64;
  if i < 1 || i + 2 >= x.len() as i64 { return if i >= 0 && (i as usize) < x.len() { x[i as usize] as f64 } else { 0.0 }; }
  let u = i as usize;
  let (a, b, c, d) = (x[u - 1] as f64, x[u] as f64, x[u + 1] as f64, x[u + 2] as f64);
  b + 0.5 * t * (c - a + t * (2.0 * a - 5.0 * b + 4.0 * c - d + t * (3.0 * (b - c) + d - a)))
}

// ---------- key lock: WSOLA ----------

pub const WSOLA_N: usize = 2048;
pub const WSOLA_H: usize = 1024;

/// Waveform-similarity overlap-add (`Wsola`).
pub struct Wsola { win: Vec<f32>, tail_l: Vec<f32>, tail_r: Vec<f32>, prev: i64 }

impl Default for Wsola { fn default() -> Self { Self::new() } }

impl Wsola {
  pub fn new() -> Self {
    let win = (0..WSOLA_N).map(|i| (0.5 - 0.5 * js::cos(2.0 * PI * i as f64 / WSOLA_N as f64)) as f32).collect();
    Wsola { win, tail_l: vec![0.0; WSOLA_H], tail_r: vec![0.0; WSOLA_H], prev: -1 }
  }
  pub fn reset(&mut self) { self.prev = -1; self.tail_l.fill(0.0); self.tail_r.fill(0.0); }
  /// H samples of output for a grain asked at source position `p` (samples).
  pub fn hop(&mut self, l: &[f32], r: &[f32], p: f64, ol: &mut [f32], or: &mut [f32], off: usize) {
    let h = WSOLA_H as i64;
    let mut q = js::round(p) as i64;
    if self.prev >= 0 {
      let nat = self.prev + h;
      let s = 512i64;
      let ov = h;
      let score = |d: i64, step: i64| -> f64 {
        let (mut c, mut e) = (0.0f64, 1e-12f64);
        let mut i = 0;
        while i < ov {
          let a = at(l, nat + i) + at(r, nat + i);
          let b = at(l, q + d + i) + at(r, q + d + i);
          c += a * b; e += b * b;
          i += step;
        }
        c / js::sqrt(e) * js::sqrt(step as f64)
      };
      let mut best = nat - q;
      let mut best_c = if best.abs() <= s { score(best, 2) } else { f64::NEG_INFINITY };
      let mut d = -s;
      while d <= s { let c = score(d, 4); if c > best_c { best_c = c; best = d; } d += 8; }
      let coarse = best;
      for d in (coarse - 7)..=(coarse + 7) { let c = score(d, 2); if c > best_c { best_c = c; best = d; } }
      q += best;
    }
    for i in 0..WSOLA_H {
      ol[off + i] = (self.tail_l[i] as f64 + at(l, q + i as i64) * self.win[i] as f64) as f32;
      or[off + i] = (self.tail_r[i] as f64 + at(r, q + i as i64) * self.win[i] as f64) as f32;
    }
    for i in 0..WSOLA_H {
      self.tail_l[i] = (at(l, q + h + i as i64) * self.win[WSOLA_H + i] as f64) as f32;
      self.tail_r[i] = (at(r, q + h + i as i64) * self.win[WSOLA_H + i] as f64) as f32;
    }
    self.prev = q;
  }
}

// ---------- filters ----------

/// A biquad (RBJ), Direct Form I (`Biquad`).
#[derive(Clone)]
pub struct Biquad { b0: f64, b1: f64, b2: f64, a1: f64, a2: f64, x1: f64, x2: f64, y1: f64, y2: f64 }

impl Default for Biquad { fn default() -> Self { Biquad { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 } } }

#[derive(Clone, Copy, PartialEq)]
pub enum Pass { Lp, Hp }

impl Biquad {
  pub fn set(&mut self, kind: Pass, f: f64, q: f64, sr: f64) -> &mut Self {
    let w = 2.0 * PI * js::min(f, sr * 0.49) / sr;
    let c = js::cos(w);
    let al = js::sin(w) / (2.0 * q);
    let a0 = 1.0 + al;
    if kind == Pass::Lp { self.b0 = (1.0 - c) / 2.0 / a0; self.b1 = (1.0 - c) / a0; self.b2 = self.b0; }
    else { self.b0 = (1.0 + c) / 2.0 / a0; self.b1 = -(1.0 + c) / a0; self.b2 = self.b0; }
    self.a1 = -2.0 * c / a0; self.a2 = (1.0 - al) / a0;
    self
  }
  #[inline] pub fn run(&mut self, x: f64) -> f64 {
    let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
    self.x2 = self.x1; self.x1 = x; self.y2 = self.y1; self.y1 = y;
    y
  }
}

const BW: f64 = std::f64::consts::FRAC_1_SQRT_2;
/// A Linkwitz-Riley 4th-order low or high pass: two Butterworths.
struct Lr4 { a: Biquad, b: Biquad }
impl Lr4 {
  fn new(kind: Pass, f: f64, sr: f64) -> Self { let mut a = Biquad::default(); let mut b = Biquad::default(); a.set(kind, f, BW, sr); b.set(kind, f, BW, sr); Lr4 { a, b } }
  #[inline] fn run(&mut self, x: f64) -> f64 { let y = self.a.run(x); self.b.run(y) }
}

/// A DJ mixer's 3-band isolator (250 Hz, 2.5 kHz). One channel.
pub struct Isolator { lo: Lr4, hi1: Lr4, mid: Lr4, hi2: Lr4 }
impl Isolator {
  pub fn new(sr: f64) -> Self { Isolator { lo: Lr4::new(Pass::Lp, 250.0, sr), hi1: Lr4::new(Pass::Hp, 250.0, sr), mid: Lr4::new(Pass::Lp, 2500.0, sr), hi2: Lr4::new(Pass::Hp, 2500.0, sr) } }
  #[inline] pub fn run(&mut self, x: f64, gl: f64, gm: f64, gh: f64) -> f64 {
    let l = self.lo.run(x);
    let rest = self.hi1.run(x);
    gl * l + gm * self.mid.run(rest) + gh * self.hi2.run(rest)
  }
}

/// One knob: −1 … 0 a low pass closing, 0 off, 0 … 1 a high pass opening. One channel (`OneKnob`).
#[derive(Default)]
pub struct OneKnob { f: Biquad, v: f64 }
impl OneKnob {
  pub fn set(&mut self, v: f64, sr: f64) {
    if (v - self.v).abs() < 1e-4 && v.abs() > 0.01 { return; }
    self.v = v;
    if v < -0.01 { self.f.set(Pass::Lp, 20000.0 * js::pow(200.0 / 20000.0, -v), 0.9, sr); }
    else if v > 0.01 { self.f.set(Pass::Hp, 20.0 * js::pow(100.0, v), 0.9, sr); }
  }
  #[inline] pub fn run(&mut self, x: f64) -> f64 { if self.v.abs() <= 0.01 { x } else { self.f.run(x) } }
}

/// A beat-synced echo (3/4 of a beat, feedback 0.5). One channel.
pub struct Echo { buf: Vec<f32>, w: usize }
impl Echo {
  pub fn new(sr: f64) -> Self { Echo { buf: vec![0.0; (sr * 3.0).ceil() as usize], w: 0 } }
  #[inline] pub fn run(&mut self, x: f64, send: f64, delay: f64) -> f64 {
    let n = self.buf.len();
    let d = js::max(1.0, js::min((n - 1) as f64, js::round(delay))) as usize;
    let y = self.buf[(self.w + n - d) % n] as f64;
    self.buf[self.w] = (x * send + y * 0.5) as f32;
    self.w = (self.w + 1) % n;
    y
  }
}

/// A lookahead limiter (`Limiter`): the gain a peak needs held LOOK samples and averaged over them.
pub struct Limiter { dl: Vec<f32>, dr: Vec<f32>, gl: Vec<f32>, w: usize, env: f64, hold: usize, sum: f64, rel: f64, ceiling: f64 }

pub const LOOK: usize = 256;

impl Limiter {
  pub fn new(sr: f64) -> Self {
    Limiter { dl: vec![0.0; LOOK], dr: vec![0.0; LOOK], gl: vec![1.0; LOOK], w: 0, env: 1.0, hold: 0, sum: LOOK as f64, rel: 1.0 - js::exp(-1.0 / (0.25 * sr)), ceiling: 0.966 }
  }
  /// In place. Adds LOOK samples of latency.
  pub fn run(&mut self, l: &mut [f32], r: &mut [f32], off: usize, n: usize) {
    let inv = 1.0 / LOOK as f64;
    for i in off..off + n {
      let (xl, xr) = (l[i], r[i]);
      let pk = js::max((xl as f64).abs(), (xr as f64).abs());
      let need = if pk > self.ceiling { self.ceiling / pk } else { 1.0 };
      if need <= self.env { self.env = need; self.hold = LOOK; }
      else if self.hold > 0 { self.hold -= 1; }
      else { self.env = js::min(need, self.env + (1.0 - self.env) * self.rel); }
      let w = self.w;
      self.sum += self.env - self.gl[w] as f64; self.gl[w] = self.env as f32;
      let g = js::min(1.0, self.sum * inv);
      let yl = self.dl[w] as f64 * g;
      let yr = self.dr[w] as f64 * g;
      self.dl[w] = xl; self.dr[w] = xr; self.w = (w + 1) % LOOK;
      if self.w == 0 { let mut t = 0.0; for k in 0..LOOK { t += self.gl[k] as f64; } self.sum = t; }
      l[i] = js::max(-self.ceiling, js::min(self.ceiling, yl)) as f32;
      r[i] = js::max(-self.ceiling, js::min(self.ceiling, yr)) as f32;
    }
  }
}
