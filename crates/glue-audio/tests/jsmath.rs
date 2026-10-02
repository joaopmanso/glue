//! V8's Math functions, bit for bit, on the inputs the analysis uses (the same grids as scripts/jsmath.mjs).
use glue_audio::js;
use std::f64::consts::PI;

fn grid(name: &str) -> Vec<f64> {
  let mut o = Vec::new();
  match name {
    "cos_tw" => { let mut n = 512u32; while n <= 16384 { for i in 0..n { o.push(2.0 * PI * i as f64 / n as f64); o.push(2.0 * PI * i as f64 / (n - 1) as f64); } n *= 2; } }
    "sin_tw" => { let mut n = 512u32; while n <= 16384 { for i in 0..n { o.push(2.0 * PI * i as f64 / n as f64); } n *= 2; } }
    "log10" => { let mut x = 1e-31; for _ in 0..200000 { o.push(x + 1e-30); x *= 1.000414; } }
    "pow10" => { for i in 0..=43000 { o.push((-310.0 + i as f64 / 100.0) / 10.0); } }
    "log2" => { for i in 1..=100000 { o.push(i as f64 / 997.0 + 1e-6); } }
    "log" => { for i in 0..100000 { o.push(1.0 + i as f64 * 0.37); } }
    "exp" => { for i in 0..100000 { o.push(-50.0 + i as f64 / 1000.0); } }
    "pow2" => { for i in 0..100000 { o.push(-40.0 + i as f64 / 1000.0); } }
    "sqrt" => { for i in 0..100000 { o.push(i as f64 * 1.7 + 0.001); } }
    "atan2" => { for i in 0..20000i64 { o.push(((i * 13) % 211) as f64 - 105.5); o.push(((i * 7) % 173) as f64 - 86.25 + 0.01 * (i % 5) as f64); } }
    _ => unreachable!(),
  }
  o
}

fn outputs(name: &str) -> Vec<f64> {
  let ins = grid(name);
  match name {
    "atan2" => ins.chunks(2).map(|p| js::atan2(p[0], p[1])).collect(),
    _ => ins.iter().map(|&x| match name {
      "cos_tw" => js::cos(x), "sin_tw" => js::sin(x), "log10" => js::log10(x), "pow10" => js::pow(10.0, x),
      "log2" => js::log2(x), "log" => js::log(x), "exp" => js::exp(x), "pow2" => js::pow(2.0, x), "sqrt" => js::sqrt(x),
      _ => unreachable!(),
    }).collect(),
  }
}

/// V8's outputs (every 37th of each grid), from `node scripts/jsmath.mjs`.
fn v8() -> Vec<(String, Vec<f64>)> {
  let b = include_bytes!("data/jsmath.bin");
  let (mut p, mut out) = (0usize, Vec::new());
  let u32at = |p: usize| u32::from_le_bytes(b[p..p + 4].try_into().unwrap()) as usize;
  while p < b.len() {
    let n = u32at(p); let name = String::from_utf8(b[p + 4..p + 4 + n].to_vec()).unwrap(); p += 4 + n;
    let k = u32at(p); p += 4;
    out.push((name, (0..k).map(|i| f64::from_le_bytes(b[p + 8 * i..p + 8 * i + 8].try_into().unwrap())).collect()));
    p += 8 * k;
  }
  out
}

#[test]
fn math_within_2_ulp_of_v8() {
  for (name, want) in v8() {
    let got: Vec<f64> = outputs(&name).into_iter().step_by(37).collect();
    assert_eq!(got.len(), want.len(), "{name}: grid size");
    for (i, (g, w)) in got.iter().zip(&want).enumerate() {
      let d = (g.to_bits() as i64 - w.to_bits() as i64).abs();
      assert!(d <= 2, "{name}[{}]: {g} vs V8's {w} ({d} ulp)", i * 37);
    }
  }
}

#[test]
fn round_like_js() {
  assert_eq!(js::round(2.5), 3.0);
  assert_eq!(js::round(-2.5), -2.0);
  assert_eq!(js::round(0.49999999999999994), 0.0);
  assert!(js::round(-0.4).is_sign_negative());
}

/// Where a grid differs: `JSMATH_DUMP=<dir> cargo test --test jsmath -- --ignored` with the dumps of
/// `node scripts/jsmath.mjs dump <fn> <dir>/jm-<fn>.bin`.
#[test]
#[ignore]
fn where_it_differs() {
  let dir = std::env::var("JSMATH_DUMP").unwrap();
  for name in ["cos_tw", "sin_tw", "exp", "log", "log10", "pow10", "pow2", "log2", "atan2", "sqrt"] {
    let Ok(b) = std::fs::read(format!("{dir}/jm-{name}.bin")) else { continue };
    let want: Vec<f64> = b.chunks(8).map(|c| f64::from_le_bytes(c.try_into().unwrap())).collect();
    let (got, ins) = (outputs(name), grid(name));
    let (mut n, mut max) = (0usize, 0i64);
    let mut first = None;
    for i in 0..want.len() {
      if want[i].to_bits() != got[i].to_bits() {
        n += 1;
        let d = (want[i].to_bits() as i64 - got[i].to_bits() as i64).abs();
        if d > max { max = d; }
        if first.is_none() { first = Some((ins[i], want[i], got[i])); }
      }
    }
    println!("{name}: {n} of {} differ, max {max} ulp, first {first:?}", want.len());
  }
}
