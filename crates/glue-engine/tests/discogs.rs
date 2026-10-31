//! Discogs with the user's token (ADR 0186): the token checked, covers looked up there last, the token sent to its API
//! only.
use glue_engine::covers::Query;
use glue_engine::{Engine, Host};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// A 1×1 PNG.
const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

#[derive(Default)]
struct Seen { config: Value, web: HashMap<String, Vec<u8>>, asked: Vec<(String, Vec<(String, String)>)> }
#[derive(Clone, Default)]
struct H(Arc<Mutex<Seen>>);
impl Host for H {
  fn lease_held(&self) -> bool { false }
  fn incoming_dir(&self) -> PathBuf { std::env::temp_dir() }
  fn config(&self) -> Value { self.0.lock().unwrap().config.clone() }
  fn patch_config(&self, f: &dyn Fn(&Value) -> Option<Value>) -> Option<Value> {
    let mut g = self.0.lock().unwrap();
    let p = f(&g.config)?;
    for (k, v) in p.as_object().unwrap() { g.config[k] = v.clone(); }
    Some(g.config.clone())
  }
  fn web_get(&self, url: &str) -> Result<Vec<u8>, String> { self.web_get_with(url, &[]) }
  fn web_get_with(&self, url: &str, headers: &[(&str, &str)]) -> Result<Vec<u8>, String> {
    let mut g = self.0.lock().unwrap();
    g.asked.push((url.into(), headers.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()));
    g.web.iter().find(|(k, _)| url.starts_with(k.as_str())).map(|(_, v)| v.clone()).ok_or_else(|| "the service said 404".into())
  }
}
fn temp(name: &str) -> PathBuf {
  let d = std::env::temp_dir().join(format!("glue-discogs-{name}-{}", std::process::id()));
  let _ = std::fs::remove_dir_all(&d);
  std::fs::create_dir_all(&d).unwrap();
  d
}
fn engine(name: &str, config: Value) -> (Arc<Engine<H>>, H) {
  let h = H::default();
  h.0.lock().unwrap().config = config;
  (Engine::new(temp(name), temp(&format!("{name}-cache")), h.clone()), h)
}
fn png() -> Vec<u8> { use base64::Engine as _; base64::engine::general_purpose::STANDARD.decode(PNG).unwrap() }
/// The cover's look-up, waited for (it runs on its own thread).
fn looked_up<X: Host>(e: &Arc<Engine<X>>, q: &Query) -> String {
  e.cover_want(q.clone());
  for _ in 0..200 { if let Some(h) = e.cover_known(q) { return h; } std::thread::sleep(std::time::Duration::from_millis(50)); }
  panic!("never looked up");
}

#[test]
fn the_token_is_checked_with_discogs() {
  let (e, h) = engine("check", json!({ "discogsToken": " abc " }));
  h.0.lock().unwrap().web.insert("https://api.discogs.com/oauth/identity".into(), br#"{"id":1,"username":"djtest"}"#.to_vec());
  e.discogs_check();
  let c = h.config();
  assert_eq!(c["discogsUser"], "djtest");
  assert!(c["discogsAt"].as_i64().is_some() && c["discogsError"].is_null());
  let g = h.0.lock().unwrap();
  assert_eq!(g.asked[0].1, vec![("Authorization".to_string(), "Discogs token=abc".to_string())], "trimmed, as Discogs wants it");
  drop(g);
  // A token Discogs refuses: said so.
  h.0.lock().unwrap().web.clear();
  e.discogs_check();
  assert!(h.config()["discogsUser"].is_null());
  assert!(h.config()["discogsError"].as_str().is_some_and(|m| !m.is_empty()));
  // No token: nothing kept.
  h.patch_config(&|_| Some(json!({ "discogsToken": "" })));
  e.discogs_check();
  assert!(h.config()["discogsError"].is_null());
}

#[test]
fn discogs_is_asked_last_with_the_token_and_only_its_api_gets_it() {
  let q = Query { artist: "Kloudmen".into(), album: "White Label 01".into(), title: "Genorale".into() };
  // No token: Discogs isn't asked.
  let (e, h) = engine("none", json!({}));
  assert_eq!(looked_up(&e, &q), "");
  assert!(h.0.lock().unwrap().asked.iter().all(|(u, _)| !u.contains("discogs")));
  // With one: the other three find nothing, Discogs does.
  let (e, h) = engine("with", json!({ "discogsToken": "abc" }));
  {
    let mut g = h.0.lock().unwrap();
    g.web.insert("https://api.discogs.com/database/search".into(), json!({ "results": [{ "title": "Kloudmen - White Label 01", "cover_image": "https://i.discogs.com/wl01.jpeg" }] }).to_string().into_bytes());
    g.web.insert("https://i.discogs.com/wl01.jpeg".into(), png());
  }
  let hash = looked_up(&e, &q);
  assert!(!hash.is_empty(), "found on Discogs");
  let g = h.0.lock().unwrap();
  let names: Vec<&str> = g.asked.iter().map(|(u, _)| u.as_str()).collect();
  assert!(names[0].starts_with("https://api.deezer.com/") && names[1].starts_with("https://itunes.apple.com/") && names[2].starts_with("https://musicbrainz.org/"), "{names:?}");
  for (u, hs) in &g.asked {
    let token = hs.iter().any(|(k, _)| k == "Authorization");
    assert_eq!(token, u.starts_with("https://api.discogs.com/"), "the token to Discogs' API only: {u}");
  }
  assert!(names.contains(&"https://i.discogs.com/wl01.jpeg"));
}

#[test]
fn nothing_found_before_the_token_is_looked_up_again() {
  let q = Query { artist: "Kloudmen".into(), album: "White Label 02".into(), title: String::new() };
  let (e, h) = engine("again", json!({}));
  assert_eq!(looked_up(&e, &q), "");
  assert_eq!(e.cover_known(&q).as_deref(), Some(""), "nothing, for a month");
  // The token, checked now: that old "nothing" is asked again.
  h.patch_config(&|_| Some(json!({ "discogsToken": "abc", "discogsAt": glue_engine::now().0 + 1 })));
  assert_eq!(e.cover_known(&q), None);
}
