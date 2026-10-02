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

/// An MP3 frame that says more than it holds (its side information claims more bits than the frame has: what
/// Symphonia calls "invalid main_data offset"; FFmpeg decodes what it can) keeps the song's length and time: that
/// frame is silence. Skipping it shifted the rest of the song (the desktop's check, 2026-10-02: "1-01 Donna Lee.mp3",
/// 7 such frames).
#[test]
fn a_damaged_mp3_frame_keeps_the_time() {
  let good = fixture("demo-noxing.mp3");   // no LAME tag: its length is what's decoded
  let (mut o, mut n) = (good.windows(2).position(|w| w[0] == 0xff && w[1] & 0xe0 == 0xe0).unwrap(), 0);
  let br = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  while n < 200 { let (bi, pad) = ((good[o + 2] >> 4) as usize, ((good[o + 2] >> 1) & 1) as usize); o += 144_000 * br[bi] / 44_100 + pad; n += 1; }
  assert_eq!((good[o], good[o + 1] & 0xe1), (0xff, 0xe1), "a frame header, no CRC");
  // Three of its four part2_3_lengths (12 bits each, at bits 20, 79 and 138 of the side information: 59 bits a granule
  // and channel, after main_data_begin, the private bits and scfsi) at their largest: the last channel's data starts
  // past all the data there is.
  let mut bad = good.clone();
  for at in [20usize, 79, 138] { for k in 0..12 { let bit = at + k; bad[o + 4 + bit / 8] |= 0x80 >> (bit % 8); } }
  let (a, b) = (analyse(&good, "a.mp3", good.len() as f64, 0.0, String::new()).unwrap(), analyse(&bad, "b.mp3", bad.len() as f64, 0.0, String::new()).unwrap());
  assert_eq!(a.result.duration, b.result.duration);
  // And the rest in its place: the waveform as the undamaged file's.
  let off = a.wave.iter().zip(&b.wave).filter(|(x, y)| x != y).count();
  assert!(off < 20, "{off} waveform bytes moved");
}
