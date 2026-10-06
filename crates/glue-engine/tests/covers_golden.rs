//! The cover look-up held to the website's (ADR 0086, 0156): tests/golden/covers.json, recorded from
//! src/core/library/coverSearch.ts, names.ts and home/ui/lookup.ts by tests/covers.golden.test.ts.
use glue_engine::covers::{kept_at, lookup_key, norm, pick, same, search_url, Query, Service, SERVICES};
use glue_engine::names::bare;
use serde_json::Value;

fn golden() -> Value {
  let at = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden/covers.json");
  serde_json::from_str(&std::fs::read_to_string(at).unwrap()).unwrap()
}
fn service(s: &str) -> Service { SERVICES.into_iter().find(|x| x.name() == s).unwrap() }

#[test]
fn names_as_the_website_judges_them() {
  for n in golden()["names"].as_array().unwrap() {
    let s = n["in"].as_str().unwrap();
    assert_eq!(bare(s), n["bare"].as_str().unwrap(), "bare({s:?})");
    assert_eq!(norm(s), n["norm"].as_str().unwrap(), "norm({s:?})");
  }
}

#[test]
fn the_same_keys_kept_files_and_addresses() {
  for x in golden()["queries"].as_array().unwrap() {
    let q = Query::from_json(&x["q"]);
    let key = lookup_key(&q);
    assert_eq!(key.as_deref(), x["key"].as_str(), "{q:?}");
    assert_eq!(key.map(|k| kept_at(&k)).as_deref(), x["file"].as_str(), "{q:?}");
    for s in SERVICES { assert_eq!(search_url(s, &q).as_deref(), x["urls"][s.name()].as_str(), "{q:?} {}", s.name()); }
  }
}

#[test]
fn the_same_names_and_picks() {
  let g = golden();
  for x in g["same"].as_array().unwrap() { assert_eq!(same(x["a"].as_str().unwrap(), x["b"].as_str().unwrap()), x["same"].as_bool().unwrap(), "{x}"); }
  for x in g["picks"].as_array().unwrap() {
    let q = Query::from_json(&x["q"]);
    assert_eq!(pick(service(x["service"].as_str().unwrap()), &q, &x["answer"]).as_deref(), x["pick"].as_str(), "{x}");
  }
}
