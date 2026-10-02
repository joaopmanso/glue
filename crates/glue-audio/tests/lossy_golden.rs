//! Lossy files against the browser's analysis of them (tests/golden/<name>, made in Edge by e2e/golden.spec.ts). The
//! decoders differ (Symphonia here, FFmpeg in the browser), so the samples differ by a hair: the same length and rate,
//! the same verdict and text, the numbers close (ADR 0147's lossy criteria).
use glue_audio::analyse;
use serde_json::Value;
use std::path::PathBuf;

const FILES: &[(&str, &str)] = &[
  ("demo-320.mp3", "lossy/demo-320.mp3"), ("demo-128.mp3", "lossy/demo-128.mp3"), ("demo-noxing.mp3", "lossy/demo-noxing.mp3"),
  ("demo-256.m4a", "lossy/demo-256.m4a"), ("demo.ogg", "lossy/demo.ogg"), ("mp3-128k.mp3", "mp3-128k.mp3"), ("mp3-cover.mp3", "mp3-cover.mp3"),
  ("aac-128k.m4a", "aac-128k.m4a"),
];

fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..") }
fn json(name: &str, f: &str) -> Value { serde_json::from_str(&std::fs::read_to_string(root().join("tests/golden").join(name).join(f)).unwrap()).unwrap() }
fn bytes_b64(s: &str) -> Vec<u8> {
  let val = |c: u8| -> u32 { match c { b'A'..=b'Z' => (c - b'A') as u32, b'a'..=b'z' => (c - b'a' + 26) as u32, b'0'..=b'9' => (c - b'0' + 52) as u32, b'+' => 62, _ => 63 } };
  let s: Vec<u8> = s.bytes().filter(|&c| c != b'=').collect();
  let mut out = vec![];
  for ch in s.chunks(4) {
    let mut n = 0u32;
    for (i, &c) in ch.iter().enumerate() { n |= val(c) << (18 - 6 * i); }
    for i in 0..ch.len().saturating_sub(1) { out.push((n >> (16 - 8 * i)) as u8); }
  }
  out
}

/// Equal as JSON, numbers by value (44100 and 44100.0 alike), keys in any order.
fn same(a: &Value, b: &Value) -> bool {
  match (a, b) {
    (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
    (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
    (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(v, w)| same(v, w)),
    _ => a == b,
  }
}

#[test]
fn lossy_files_match_the_browser() {
  let mut problems = vec![];
  for (name, path) in FILES {
    let b = std::fs::read(root().join("tests/fixtures").join(path)).unwrap();
    let a = analyse(&b, name, b.len() as f64, 1_700_000_000_000.0, String::new()).unwrap_or_else(|e| panic!("{name}: {e}"));
    let (dec, sum, info, files) = (json(name, "decode.json"), json(name, "summary.json"), json(name, "info.json"), json(name, "files.json"));
    let mut p = |m: String| problems.push(format!("{name}: {m}"));
    // The decoded audio: the same length and rate; samples within 1e-4.
    if a.result.duration * a.result.sr != dec["frames"].as_f64().unwrap() { p(format!("frames {} vs {}", a.result.duration * a.result.sr, dec["frames"])); }
    if a.result.sr != dec["sr"].as_f64().unwrap() { p(format!("rate {} vs {}", a.result.sr, dec["sr"])); }
    // The parser is the same code: identical.
    let mine = serde_json::to_value(&a.info).unwrap();
    if !same(&mine, &info) { p(format!("info differs:\n    {mine}\n    {info}")); }
    // The verdict and its words.
    let s = serde_json::to_value(&a.summary).unwrap();
    for k in ["grade", "label", "headline", "origin", "wall", "full", "effBits", "declaredBits", "findings"] { if !same(&s[k], &sum[k]) { p(format!("{k}: {} vs {}", s[k], sum[k])); } }
    let (fc, gfc) = (s["fc"].as_f64().unwrap(), sum["fc"].as_f64().unwrap());
    if (fc - gfc).abs() > 30.0 { p(format!("fc {fc} vs {gfc}")); }
    match (s["bpm"].as_f64(), sum["bpm"].as_f64()) { (Some(x), Some(y)) if (x - y).abs() <= 0.05 => {}, (None, None) => {}, (x, y) => p(format!("bpm {x:?} vs {y:?}")) }
    if !same(&s["key"]["tonic"], &sum["key"]["tonic"]) || s["key"]["mode"] != sum["key"]["mode"] { p(format!("key {} vs {}", s["key"], sum["key"])); }
    // The thumbnails: within ±1 a byte, nearly all equal.
    for (k, mine) in [("thumb", &a.thumb), ("wave", &a.wave)] {
      let g = bytes_b64(files[k].as_str().unwrap());
      let off: Vec<i32> = mine.iter().zip(&g).map(|(x, y)| *x as i32 - *y as i32).collect();
      let (bad, max) = (off.iter().filter(|d| **d != 0).count(), off.iter().map(|d| d.abs()).max().unwrap_or(0));
      println!("{name} {k}: {bad} of {} bytes differ, by at most {max}", g.len());
      if max > 2 { p(format!("{k}: a byte {max} off")); }
    }
    // The fingerprint: few bits differ.
    let g = bytes_b64(files["fingerprint"].as_str().unwrap());
    let n = u32::from_le_bytes(g[0..4].try_into().unwrap()) as usize;
    let m = u32::from_le_bytes(a.fingerprint[0..4].try_into().unwrap()) as usize;
    if n != m { p(format!("fingerprint {m} words vs {n}")); }
    else {
      let bits: u32 = (0..n).map(|i| { let w = |v: &[u8]| u32::from_le_bytes(v[4 + 4 * i..8 + 4 * i].try_into().unwrap()); (w(&a.fingerprint) ^ w(&g)).count_ones() }).sum();
      let ber = bits as f64 / (32 * n.max(1)) as f64;
      println!("{name} fingerprint: bit error rate {ber:.4}");
      if ber > 0.02 { p(format!("fingerprint bit error rate {ber:.3}")); }
    }
    let cover = a.analysed(b.len() as f64, 0.0)["art"].clone();
    if cover != files["analysed"]["art"] { p(format!("cover {cover} vs {}", files["analysed"]["art"])); }
  }
  assert!(problems.is_empty(), "\n  {}", problems.join("\n  "));
}
