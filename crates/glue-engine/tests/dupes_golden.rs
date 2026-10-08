//! GLUE Home's duplicates' matching against the website's (tests/golden/dupes, recorded by tests/dupes.golden.test.ts):
//! the same synthetic fingerprints, the same matches, byte for byte.
use base64::Engine as _;
use glue_engine::dupes::{decode, find_matches_for, find_same_recordings, Match};
use glue_store::json::stringify;
use serde_json::Value;

fn out(ms: &[Match]) -> String { stringify(&Value::Array(ms.iter().map(|m| m.to_json()).collect())) }

#[test]
fn the_matches_are_the_websites() {
  let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden/dupes/matches.json");
  let g: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
  let songs: Vec<(String, glue_engine::dupes::Fingerprint)> = g["songs"].as_array().unwrap().iter().map(|s| {
    let b = base64::engine::general_purpose::STANDARD.decode(s["fp"].as_str().unwrap()).unwrap();
    (s["id"].as_str().unwrap().to_string(), decode(&b).unwrap())
  }).collect();
  assert_eq!(out(&find_same_recordings(&songs)), stringify(&g["all"]), "all pairs");
  let fresh = g["fresh"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect();
  assert_eq!(out(&find_matches_for(&songs, &fresh)), stringify(&g["forFresh"]), "the new songs' pairs");
}
