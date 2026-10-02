//! Lossy and Apple Lossless files (tests/fixtures/lossy, made by scripts/lossy-fixtures.mjs from the demo).
use glue_audio::analyse;
use std::path::PathBuf;

fn fixture(name: &str) -> Vec<u8> { std::fs::read(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/lossy").join(name)).unwrap() }
fn run(name: &str) -> glue_audio::Analysis {
  let b = fixture(name);
  analyse(&b, name, b.len() as f64, 0.0, String::new()).unwrap_or_else(|e| panic!("{name}: {e}"))
}

/// ALAC is lossless: its samples, so its analysis, are the FLAC's of the same audio (the 342 M4As the WebView couldn't
/// decode, ADR 0147).
#[test]
fn alac_is_the_same_as_flac() {
  let (a, f) = (run("demo-alac.m4a"), run("demo-alac.flac"));
  assert_eq!(a.info.codec, "ALAC");
  assert_eq!(a.result.stats, f.result.stats);
  assert_eq!(a.result.ltas, f.result.ltas);
  assert_eq!(a.thumb, f.thumb);
  assert_eq!(a.fingerprint, f.fingerprint);
  assert_eq!((a.summary.label.as_str(), a.summary.bpm, a.summary.key.as_ref().map(|k| k.tonic)), (f.summary.label.as_str(), f.summary.bpm, f.summary.key.as_ref().map(|k| k.tonic)));
}

#[test]
fn lossy_files_decode() {
  for name in ["demo-320.mp3", "demo-128.mp3", "demo-noxing.mp3", "demo-256.m4a", "demo.ogg"] {
    let a = run(name);
    println!("{name}: {} · {} · {} · bpm {:?} · {:.3} s · {} Hz", a.info.codec, a.summary.label, a.summary.headline, a.summary.bpm, a.result.duration, a.result.sr);
    assert!(a.result.duration > 11.0, "{name}: {} s", a.result.duration);
  }
}

/// Past its deadline an analysis stops with the website's passing failure ("took too long"), on every decoder's path.
#[test]
fn a_deadline_stops_the_analysis() {
  for name in ["demo-alac.flac", "demo-320.mp3"] {
    let b = fixture(name);
    glue_audio::control::set_deadline(Some(std::time::Instant::now()));
    let r = analyse(&b, name, b.len() as f64, 0.0, String::new());
    glue_audio::control::set_deadline(None);
    assert!(matches!(&r, Err(glue_audio::Failure::Broken(m)) if m.contains("took too long")), "{name}");
  }
}
