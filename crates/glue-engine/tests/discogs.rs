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

fn put(d: &std::path::Path, rel: &str, v: Value) { let p = d.join(rel); std::fs::create_dir_all(p.parent().unwrap()).unwrap(); std::fs::write(p, v.to_string()).unwrap(); }
fn item(id: i64, artist: &str, title: &str, cover: &str) -> Value {
  json!({ "id": id, "instance_id": id * 10, "date_added": "2026-10-01T10:00:00-07:00", "rating": 4, "basic_information": {
    "id": id, "title": title, "year": 2019, "artists": [{ "name": artist }], "labels": [{ "name": "Hessle Audio", "catno": "HES 041" }],
    "formats": [{ "name": "Vinyl", "qty": "1", "descriptions": ["12\"", "EP"] }], "genres": ["Electronic"], "styles": ["Dubstep", "Techno"],
    "thumb": "", "cover_image": cover } })
}

#[test]
fn the_collection_and_wantlist_are_read_into_the_profiles_file_with_their_covers() {
  let glue = temp("read");
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "collections": [] }));
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "glue": glue.to_string_lossy(), "discogsToken": "abc", "discogsUser": "dj test" });
  let e = Engine::new(glue.clone(), temp("read-cache"), h.clone());
  {
    let mut g = h.0.lock().unwrap();
    let page = |items: Vec<Value>, key: &str, page: u32, pages: u32| json!({ "pagination": { "page": page, "pages": pages, "per_page": 100, "items": 3 }, key: items }).to_string().into_bytes();
    g.web.insert("https://api.discogs.com/users/dj%20test/collection/folders/0/releases?sort=added&sort_order=desc&per_page=100&page=1".into(), page(vec![item(1, "Pangaea", "Inner Space", "https://i.discogs.com/1.jpeg"), item(2, "Ploy", "Iron Lung", "")], "releases", 1, 2));
    g.web.insert("https://api.discogs.com/users/dj%20test/collection/folders/0/releases?sort=added&sort_order=desc&per_page=100&page=2".into(), page(vec![item(3, "Bruce", "Not Stochastic", "https://i.discogs.com/3.jpeg")], "releases", 2, 2));
    g.web.insert("https://api.discogs.com/users/dj%20test/wants?sort=added&sort_order=desc&per_page=100&page=1".into(), page(vec![item(9, "Kloudmen", "White Label 01", "https://i.discogs.com/9.jpeg")], "wants", 1, 1));
    for n in [1, 3, 9] { g.web.insert(format!("https://i.discogs.com/{n}.jpeg"), png()); }
    // A tracklist (the others answer 404: none to match by).
    g.web.insert("https://api.discogs.com/releases/1".into(), json!({ "id": 1, "tracklist": [
      { "position": "", "type_": "heading", "title": "Side A", "duration": "" },
      { "position": "A1", "type_": "track", "title": "Inner Space", "duration": "6:05" },
      { "position": "B1", "type_": "track", "title": "Release", "duration": "", "artists": [{ "name": "Pangaea & Pearson Sound" }] } ] }).to_string().into_bytes());
  }
  assert_eq!(e.discogs_read(true), Ok(3));
  let f: Value = serde_json::from_str(&std::fs::read_to_string(glue.join("profiles/p1/discogs.json")).unwrap()).unwrap();
  assert_eq!(f["user"], "dj test");
  let ids: Vec<i64> = f["records"].as_array().unwrap().iter().map(|r| r["id"].as_i64().unwrap()).collect();
  assert_eq!(ids, [1, 2, 3], "both pages, in Discogs' order");
  let r = &f["records"][0];
  assert_eq!((r["title"].as_str(), r["artists"][0].as_str(), r["labels"][0]["catno"].as_str(), r["year"].as_i64()), (Some("Inner Space"), Some("Pangaea"), Some("HES 041"), Some(2019)));
  assert_eq!(r["formats"], json!(["Vinyl", "12\"", "EP"]));
  assert_eq!(r["styles"], json!(["Dubstep", "Techno"]));
  assert!(r["art"].as_str().is_some_and(|a| !a.is_empty()), "its cover fetched");
  assert_eq!(f["records"][1]["art"], "", "no cover on Discogs");
  assert_eq!(f["wants"][0]["title"], "White Label 01");
  assert_eq!(f["records"][0]["tracks"], json!([{ "p": "A1", "title": "Inner Space", "artists": [], "d": 365 }, { "p": "B1", "title": "Release", "artists": ["Pangaea & Pearson Sound"], "d": null }]), "headings left out");
  assert_eq!(f["records"][1]["tracks"], json!([]), "none on Discogs");
  assert_eq!(e.discogs_state("p1")["kept"]["records"].as_array().map(Vec::len), Some(3));
  let g = h.0.lock().unwrap();
  for (u, hs) in &g.asked { assert_eq!(hs.iter().any(|(k, _)| k == "Authorization"), u.starts_with("https://api.discogs.com/"), "{u}"); }
  let images = g.asked.iter().filter(|(u, _)| u.starts_with("https://i.discogs.com/")).count();
  let lists = g.asked.iter().filter(|(u, _)| u.starts_with("https://api.discogs.com/releases/")).count();
  drop(g);
  // Read again within the day: not asked; asked now (Refresh): the covers it has aren't fetched again.
  assert_eq!(e.discogs_read(false), Ok(0));
  assert_eq!(e.discogs_read(true), Ok(3));
  assert_eq!(h.0.lock().unwrap().asked.iter().filter(|(u, _)| u.starts_with("https://i.discogs.com/")).count(), images);
  assert_eq!(h.0.lock().unwrap().asked.iter().filter(|(u, _)| u.starts_with("https://api.discogs.com/releases/")).count(), lists, "tracklists read once");
}

#[test]
fn a_collection_read_today_without_its_tracklists_gets_them_without_reading_the_list_again() {
  // 2026-11-01: the user's collection was read by 0.77 (no tracklists); its auto playlists stayed empty until the next day.
  let glue = temp("fill");
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "collections": [] }));
  let rec = |id: i64| json!({ "id": id, "title": "R", "artists": ["A"], "labels": [], "year": 2012, "formats": ["Vinyl", "12\""], "genres": [], "styles": [], "added": "", "rating": 0, "cover": format!("https://i.discogs.com/{id}.jpeg"), "art": "" });
  put(&glue, "profiles/p1/discogs.json", json!({ "schemaVersion": 1, "user": "u", "readAt": glue_engine::now().0, "records": [rec(1), rec(2)], "wants": [] }));
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "glue": glue.to_string_lossy(), "discogsToken": "abc", "discogsUser": "u" });
  let e = Engine::new(glue.clone(), temp("fill-cache"), h.clone());
  {
    let mut g = h.0.lock().unwrap();
    g.web.insert("https://api.discogs.com/releases/1".into(), json!({ "tracklist": [{ "position": "A", "type_": "track", "title": "One", "duration": "" }] }).to_string().into_bytes());
    g.web.insert("https://i.discogs.com/1.jpeg".into(), png());
  }
  assert_eq!(e.discogs_read(false), Ok(0));
  let f: Value = serde_json::from_str(&std::fs::read_to_string(glue.join("profiles/p1/discogs.json")).unwrap()).unwrap();
  assert_eq!(f["records"][0]["tracks"][0]["title"], "One");
  assert_eq!(f["records"][1]["tracks"], json!([]), "none on Discogs (404)");
  assert!(f["records"][0]["art"].as_str().is_some_and(|a| a.len() == 24), "its cover");
  assert_eq!(f["records"][1]["art"], "none", "a cover that can't be had isn't asked again");
  let asked: Vec<String> = h.0.lock().unwrap().asked.iter().map(|(u, _)| u.clone()).collect();
  assert!(asked.iter().all(|u| !u.contains("/collection/") && !u.contains("/wants")), "the list not read again: {asked:?}");
  // Nothing left to fetch: nothing asked.
  let n = asked.len();
  assert_eq!(e.discogs_read(false), Ok(0));
  assert_eq!(h.0.lock().unwrap().asked.len(), n);
}
