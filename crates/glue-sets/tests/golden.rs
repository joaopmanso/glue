//! The mixer against the TypeScript's recording (tests/golden/sets, `tests/sets.golden.test.ts`): the same synthetic
//! songs, made here bit for bit, the same plans; every 256th frame within 1e-6, the length exact, energy and peak close.
use glue_sets::{dsp::resample, Mixer, Pcm, SetPlan, Sources, MIX_RATE};
use serde::Deserialize;
use std::collections::HashMap;

const DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/golden/sets");

/// `synth` in tests/sets.golden.test.ts: exact arithmetic only.
fn synth(seed: u32, secs: f64, bpm: f64, sr: f64) -> Pcm {
  let n = glue_audio::js::round(secs * sr) as usize;
  let (mut l, mut r) = (vec![0f32; n], vec![0f32; n]);
  let mut a = seed;
  let mut rnd = || { a = a.wrapping_mul(1664525).wrapping_add(1013904223); a as f64 / 4294967296.0 - 0.5 };
  let p = glue_audio::js::round(sr * 60.0 / bpm);
  let (f1, f2) = (55.0 + (seed % 7) as f64 * 5.0, 220.0 + (seed % 5) as f64 * 20.0);
  for i in 0..n {
    let fi = i as f64;
    let k = fi % p;
    let env = 1.0 - k / p;
    let kick = env * env * env * env;
    let p1 = (fi * f1) % sr / sr;
    let p2 = (fi * f2) % sr / sr;
    let p3 = (fi * (f2 + 3.0)) % sr / sr;
    let hat = (if k > p / 2.0 && k < p / 2.0 + 600.0 { 1.0 - (k - p / 2.0) / 600.0 } else { 0.0 }) * rnd();
    l[i] = (0.5 * kick * (p1 - 0.5) * 2.0 + 0.12 * (p2 - 0.5) + 0.15 * hat) as f32;
    r[i] = (0.5 * kick * (p1 - 0.5) * 2.0 + 0.12 * (p3 - 0.5) + 0.15 * hat) as f32;
  }
  Pcm { l, r }
}

#[derive(Deserialize)] struct Song { id: String, seed: u32, secs: f64, bpm: f64 }
#[derive(Deserialize)] struct Case { name: String, songs: Vec<Song>, plan: SetPlan, every: usize, frames: usize, length: usize, sumsq: [f64; 2], peak: f64 }
#[derive(Deserialize)] struct Resample { seed: u32, secs: f64, bpm: f64, from: f64, every: usize, length: usize }
#[derive(Deserialize)] struct File { cases: Vec<Case>, resample: Resample }

struct Songs(HashMap<String, Pcm>);
impl Sources for Songs { fn get(&self, id: &str) -> Option<&Pcm> { self.0.get(id) } }

fn floats(name: &str) -> Vec<f32> {
  let b = std::fs::read(format!("{DIR}/{name}")).expect(name);
  b.as_chunks::<4>().0.iter().map(|c| f32::from_le_bytes(*c)).collect()
}
fn file() -> File { serde_json::from_str(&std::fs::read_to_string(format!("{DIR}/cases.json")).unwrap()).unwrap() }

#[test]
fn mixes_as_the_typescript_does() {
  for c in file().cases {
    let songs = Songs(c.songs.iter().map(|s| (s.id.clone(), synth(s.seed, s.secs, s.bpm, MIX_RATE))).collect());
    let mut m = Mixer::new(&c.plan);
    assert_eq!(m.length, c.length, "{}: length", c.name);
    let want = floats(&format!("{}.bin", c.name));
    const B: usize = 3000;
    let (mut l, mut r) = (vec![0f32; B], vec![0f32; B]);
    let (mut f, mut sl, mut sr, mut peak, mut worst, mut k) = (0usize, 0f64, 0f64, 0f64, 0f64, 0usize);
    loop {
      let n = m.render(&songs, &mut l, &mut r, B, 0);
      if n == 0 { break; }
      for i in 0..n {
        let (x, y) = (l[i] as f64, r[i] as f64);
        sl += x * x; sr += y * y; peak = peak.max(x.abs()).max(y.abs());
        if (f + i) % c.every == 0 {
          worst = worst.max((x - want[k] as f64).abs()).max((y - want[k + 1] as f64).abs());
          k += 2;
        }
      }
      f += n;
    }
    assert_eq!(f, c.frames, "{}: frames", c.name);
    assert_eq!(k, want.len(), "{}: samples kept", c.name);
    assert!(worst < 1e-6, "{}: off by {worst}", c.name);
    assert!((sl - c.sumsq[0]).abs() <= 1e-6 * c.sumsq[0].max(1.0) && (sr - c.sumsq[1]).abs() <= 1e-6 * c.sumsq[1].max(1.0), "{}: energy", c.name);
    assert!((peak - c.peak).abs() < 1e-6, "{}: peak", c.name);
  }
}

#[test]
fn resamples_as_the_typescript_does() {
  let r = file().resample;
  let x = synth(r.seed, r.secs, r.bpm, r.from).l;
  let y = resample(&x, r.from, MIX_RATE);
  assert_eq!(y.len(), r.length);
  let want = floats("resample.bin");
  for (i, w) in want.iter().enumerate() { assert!((y[i * r.every] - w).abs() < 1e-6, "sample {}", i * r.every); }
}
