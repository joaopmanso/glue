//! src/core/audio/fingerprint.ts: acoustic fingerprints for "same recording" duplicates (ADR 0025), Haitsma–Kalker
//! style: resampled to 5512.5 Hz, 0.37 s frames every 46 ms, 32 bits a frame from 33 log bands (300–2000 Hz).
use crate::fft::Fft;
use crate::js;
pub use crate::types::Fingerprint;
use std::f64::consts::PI;

pub const FP_RATE: f64 = 5512.5;
pub const FP_N: usize = 2048;
pub const FP_HOP: usize = 256;
pub const FP_SECONDS: f64 = 150.0;
const BANDS: usize = 33;
const F_LO: f64 = 300.0;
const F_HI: f64 = 2000.0;

/// `resample`: a windowed-sinc lowpass (2.4 kHz), evaluated only where the 5512.5 Hz output needs it.
fn resample(mono: &[f32], sr: f64, start: usize, count: usize) -> Vec<f32> {
  const TAPS: i64 = 24;
  let fc = 2400.0 / sr;
  let mut h = vec![0f32; (2 * TAPS + 1) as usize];
  let mut sum = 0f64;
  for j in -TAPS..=TAPS {
    let jf = j as f64;
    let x = if j == 0 { 2.0 * fc } else { js::sin(2.0 * PI * fc * jf) / (PI * jf) };
    let w = 0.42 + 0.5 * js::cos(PI * jf / TAPS as f64) + 0.08 * js::cos(2.0 * PI * jf / TAPS as f64);
    h[(j + TAPS) as usize] = (x * w) as f32;
    sum += x * w;
  }
  for v in h.iter_mut() { *v = (*v as f64 / sum) as f32; }
  let step = sr / FP_RATE;
  let len = mono.len() as i64;
  (0..count).map(|k| {
    let c = js::round(start as f64 + k as f64 * step) as i64;
    let mut acc = 0f64;
    let (a, b) = (0i64.max(c - TAPS), (len - 1).min(c + TAPS));
    let mut i = a;
    while i <= b { acc += mono[i as usize] as f64 * h[(i - c + TAPS) as usize] as f64; i += 1; }
    acc as f32
  }).collect()
}

pub fn fingerprint(mono: &[f32], sr: f64) -> Fingerprint {
  let want = (mono.len() as f64).min(js::round(FP_SECONDS * sr)) as usize;
  let start = (mono.len() - want) / 2;
  let x = resample(mono, sr, start, (want as f64 / sr * FP_RATE).floor() as usize);
  let frames = if x.len() >= FP_N { (x.len() - FP_N) / FP_HOP + 1 } else { 0 };
  let mut words = vec![0u32; frames.saturating_sub(1)];
  let mut loud = vec![0u8; frames.saturating_sub(1)];
  if frames < 2 { return Fingerprint { words, loud }; }
  let edges: Vec<usize> = (0..=BANDS).map(|m| js::round(F_LO * js::pow(F_HI / F_LO, m as f64 / BANDS as f64) / FP_RATE * FP_N as f64) as usize).collect();
  let win: Vec<f32> = (0..FP_N).map(|i| (0.5 - 0.5 * js::cos(2.0 * PI * i as f64 / (FP_N - 1) as f64)) as f32).collect();
  let fft = Fft::new(FP_N);
  let (mut re, mut im) = (vec![0f64; FP_N], vec![0f64; FP_N]);
  let (mut prev, mut cur) = (vec![0f64; BANDS], vec![0f64; BANDS]);
  let mut levels = vec![0f32; frames];
  for n in 0..frames {
    let o = n * FP_HOP;
    for i in 0..FP_N { re[i] = x[o + i] as f64 * win[i] as f64; im[i] = 0.0; }
    fft.run(&mut re, &mut im);
    let mut total = 0f64;
    for m in 0..BANDS {
      let mut e = 0f64;
      for k in edges[m]..edges[m + 1] { e += re[k] * re[k] + im[k] * im[k]; }
      cur[m] = e; total += e;
    }
    levels[n] = (10.0 * js::log10(total + 1e-20)) as f32;
    if n > 0 {
      let mut w = 0u32;
      for m in 0..32 { if (cur[m] - cur[m + 1]) - (prev[m] - prev[m + 1]) > 0.0 { w |= 1 << m; } }
      words[n - 1] = w;
    }
    std::mem::swap(&mut prev, &mut cur);
  }
  let mut max = f64::NEG_INFINITY;
  for &l in &levels[1..] { max = js::max(max, l as f64); }
  for n in 1..frames { loud[n - 1] = 0f64.max(255f64.min(js::round((levels[n] as f64 - max + 60.0) / 60.0 * 255.0))) as u8; }
  Fingerprint { words, loud }
}
