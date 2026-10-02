//! The native analysis engine in GLUE Home (crates/glue-audio, ADR 0147). For now (0.44) it's linked and tested here;
//! the service page still analyses until GLUE Home switches over (ADR 0147's batches).

/// What GLUE Home's native results say made them (`AnalysisSummary.engine`).
#[allow(dead_code)]
pub const ENGINE: &str = glue_audio::out::summary::ENGINE;

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
}
