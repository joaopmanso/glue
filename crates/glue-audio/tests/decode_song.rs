//! `decode_song` (ADR 0204): any of GLUE's formats into at most two channels of floats at the file's own rate.
use glue_audio::decode_song;

fn fixture(name: &str) -> Vec<u8> { std::fs::read(format!("{}/../../tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))).unwrap() }

#[test]
fn decodes_every_format_for_mixing() {
  for (name, sr) in [("wav-44k-24.wav", 44100.0), ("aiff-44k-24.aiff", 44100.0), ("flac-96k-24.flac", 96000.0), ("mp3-128k.mp3", 44100.0), ("aac-128k.m4a", 44100.0), ("sound-22k-16.wav", 22050.0)] {
    let (chs, rate) = decode_song(&fixture(name), name).unwrap_or_else(|e| panic!("{name}: {e}"));
    assert_eq!(rate, sr, "{name}");
    assert!((1..=2).contains(&chs.len()), "{name}: {} channels", chs.len());
    let n = chs[0].len();
    assert!(n as f64 > rate * 0.5, "{name}: {n} frames");
    assert!(chs.iter().all(|c| c.len() == n), "{name}: channels of one length");
    assert!(chs[0].iter().any(|x| x.abs() > 0.01), "{name}: not silent");
  }
}
