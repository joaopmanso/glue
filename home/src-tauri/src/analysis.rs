//! The native analysis engine in GLUE Home (crates/glue-audio, ADR 0147, 0148). A song of the library is analysed by the
//! engine's queue (crates/glue-engine, ADR 0154), which reads it with `read_song` here.
//! The native engine check (`verify`) is the engine's (crates/glue-engine/src/verify.rs, ADR 0160).
//! Songs arriving in the incoming folder are analysed by the engine too (room.rs `analyse_incoming`, ADR 0158), and
//! covers and waveforms from kept details are its (crates/glue-engine/src/answers.rs, ADR 0156).
use std::fs;

/// What GLUE Home's native results say made them (`AnalysisSummary.engine`).
#[allow(dead_code)]
pub const ENGINE: &str = glue_audio::out::summary::ENGINE;

/// A song's file, read whole, giving way to songs being played (`Paced`, ADR 0138). `read only part`: a network folder
/// that dropped mid-file (passing: tried again later, never analysed from a part).
pub(crate) fn read_song(file: &std::path::Path, name: &str) -> Result<Vec<u8>, String> {
  let f = fs::File::open(file).map_err(|e| format!("{name} could not be read ({e})"))?;
  glue_engine::analyse::read_whole(file, name, crate::local::Paced { inner: std::io::BufReader::with_capacity(1 << 20, f), pri: crate::local::Pri::Analysis, busy: crate::local::playing_now })
}

#[cfg(test)]
mod tests {
  use std::path::PathBuf;

  #[test]
  fn analyses_a_fixture_like_the_website() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests");
    let bytes = std::fs::read(root.join("fixtures/flac-96k-24.flac")).unwrap();
    let a = glue_audio::analyse(&bytes, "flac-96k-24.flac", bytes.len() as f64, 0.0, String::new()).unwrap();
    let want: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(root.join("golden/flac-96k-24.flac/summary.json")).unwrap()).unwrap();
    assert_eq!(a.summary.label, want["label"].as_str().unwrap());
    assert_eq!(a.summary.headline, want["headline"].as_str().unwrap());
    assert!(super::ENGINE.starts_with("glue-audio "));
  }

  /// A song analysed into the cache: every part, the result last; one that can't be decoded: only its failed result.
  #[test]
  fn analyses_a_song_into_the_cache() {
    use std::cell::RefCell;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures");
    let written = RefCell::new(Vec::<(String, Vec<u8>)>::new());
    let put = |rel: String, d: &[u8]| { written.borrow_mut().push((rel, d.to_vec())); Ok(()) };
    let k = |d: &str, e: &str| glue_engine::analyse::key(d, "p1", "c1", "ab01", e);
    let r = glue_engine::analyse::analyse_into(std::fs::read(root.join("flac-cover.flac")).unwrap(), "x.flac", 5.0, &k, &put).unwrap();
    assert!(r.get("failed").is_none(), "{r}");
    let w = written.borrow();
    let names: Vec<&str> = w.iter().map(|(n, _)| n.as_str()).collect();
    for want in ["t/p1/c1/ab/ab01.bin", "w/p1/c1/ab/ab01.bin", "d/p1/c1/ab/ab01.bin", "d/p1/c1/ab/ab01.json", "c/p1/c1/ab/ab01.txt", "p/p1/c1/ab/ab01.bin"] { assert!(names.contains(&want), "{want} in {names:?}"); }
    assert!(names.iter().any(|n| n.starts_with("a/") && n.ends_with("-320.jpg")));
    assert_eq!(*names.last().unwrap(), "s/p1/c1/ab/ab01.json");
    let s: serde_json::Value = serde_json::from_slice(&w.last().unwrap().1).unwrap();
    assert_eq!(s["mtime"], 5.0);
    assert!(s["summary"]["engine"].as_str().unwrap().starts_with("glue-audio"));
    drop(w);
    written.borrow_mut().clear();
    let r = glue_engine::analyse::analyse_into(b"RIFF\x10\0\0\0WAVEjunkjunk".to_vec(), "y.wav", 5.0, &k, &put).unwrap();
    assert!(r["failed"].is_string(), "{r}");
    let w = written.borrow();
    assert_eq!(w.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(), ["s/p1/c1/ab/ab01.json"]);
    let s: serde_json::Value = serde_json::from_slice(&w[0].1).unwrap();
    assert!(s["summary"]["error"].is_string());
  }

  /// A waveform made again from kept details; none from details of another version.
  #[test]
  fn a_wave_from_details_is_the_analysis_wave() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures");
    let bytes = std::fs::read(root.join("flac-96k-24.flac")).unwrap();
    let a = glue_audio::analyse(&bytes, "x.flac", bytes.len() as f64, 0.0, String::new()).unwrap();
    let w = glue_engine::analyse::wave_of(&serde_json::to_vec(&a.details.0).unwrap(), &glue_audio::out::files::zlib(&a.details.1));
    assert_eq!(w.len(), glue_audio::out::files::WAVE_BYTES);
    // From the stored (quantised) spectrum, as the website makes it (crates/glue-audio/tests/golden.rs holds it to the
    // website's byte for byte): not the analysis's own.
    assert!(w.iter().any(|&b| b > 0));
    assert!(glue_engine::analyse::wave_of(b"{\"v\":1}", &[]).is_empty());
  }
}
