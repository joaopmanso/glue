//! The engine over a GLUE folder on disk (a temporary one): edits, the feed, the lease, jobs, the repair, restamp,
//! song info into files, the analysis queue (a real song, analysed natively).
use glue_engine::{command, Engine, Host};
use glue_store::json::Obj;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Seen { events: Vec<String>, edited: Vec<Vec<String>>, lease: bool, config: Value, tags: Vec<(String, String, Obj)>, made: Vec<String>, analysis: Value, cloud: Vec<String>, gone: bool }
#[derive(Clone, Default)]
struct H(Arc<Mutex<Seen>>);
impl Host for H {
  fn lease_held(&self) -> bool { self.0.lock().unwrap().lease }
  fn config(&self) -> Value { let c = self.0.lock().unwrap().config.clone(); if c.is_null() { json!({}) } else { c } }
  fn incoming_dir(&self) -> PathBuf { std::env::temp_dir().join("glue-engine-incoming") }
  fn made(&self, _p: &str, _c: &str, id: &str) { self.0.lock().unwrap().made.push(id.into()); }
  fn analysis_changed(&self, s: &Value) { self.0.lock().unwrap().analysis = s.clone(); }
  /// GLUE Cloud: every call written down; the collection deleted from the account (410) when `gone`.
  fn cloud(&self, method: &str, path: &str, _t: Option<&str>, _b: Option<&str>) -> Result<String, glue_engine::sync::CloudError> {
    let mut g = self.0.lock().unwrap();
    g.cloud.push(format!("{method} {path}"));
    if g.gone { return Err(glue_engine::sync::CloudError { status: 410, message: "GLUE Cloud: 410".into() }); }
    Ok(r#"{"seq":0,"more":false,"entries":[]}"#.into())
  }
  fn event(&self, t: &str) { self.0.lock().unwrap().events.push(t.into()); }
  fn edited(&self, _p: &str, _c: &str, paths: &[String]) { self.0.lock().unwrap().edited.push(paths.to_vec()); }
  fn write_tags(&self, root: &str, rel: &str, tags: &Obj) -> Result<(f64, f64), String> { self.0.lock().unwrap().tags.push((root.into(), rel.into(), tags.clone())); Ok((2000.0, 99.0)) }
  fn now(&self) -> (i64, String) { (1_700_000_000_000, "2026-10-05T10:00:00.000Z".into()) }
}

fn temp(name: &str) -> PathBuf {
  let d = std::env::temp_dir().join(format!("glue-engine-{name}-{}", std::process::id()));
  let _ = std::fs::remove_dir_all(&d);
  std::fs::create_dir_all(&d).unwrap();
  d
}
fn put(d: &std::path::Path, rel: &str, v: Value) { let p = d.join(rel); std::fs::create_dir_all(p.parent().unwrap()).unwrap(); std::fs::write(p, v.to_string()).unwrap(); }
fn read(d: &std::path::Path, rel: &str) -> Value { serde_json::from_str(&std::fs::read_to_string(d.join(rel)).unwrap()).unwrap() }
const C: &str = "profiles/p1/collections/c1";

fn library(glue: &std::path::Path) {
  put(glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff" }));
  put(glue, &format!("{C}/collection.json"), json!({ "schemaVersion": 1, "id": "c1", "name": "Main", "roots": [{ "id": "r1", "name": "Music" }] }));
  put(glue, &format!("{C}/tracks/ab.json"), json!({ "schemaVersion": 1, "items": {
    "ab1": { "id": "ab1", "status": "linked", "rootId": "r1", "relPath": "a.mp3", "size": 1000, "mtime": 5, "title": "A", "sources": [] },
    "ab2": { "id": "ab2", "status": "linked", "rootId": null, "relPath": null, "fileKey": "copy:files/b.mp3", "size": 10, "mtime": 5, "sources": [] } } }));
  put(glue, "files/b.mp3", json!("song"));
}

#[test]
fn an_edit_is_saved_and_told() {
  let (glue, cache) = (temp("edit"), temp("edit-cache"));
  library(&glue);
  let h = H::default();
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  let r = e.rpc(&json!({ "op": "edit", "p": "p1", "c": "c1", "ops": [{ "m": "tracks", "ts": [{ "id": "cd3", "title": "New" }] }, { "m": "list", "l": { "id": "l1", "items": ["cd3"] } }] })).unwrap();
  assert_eq!(r, json!({ "rev": 1, "added": true }));
  assert_eq!(read(&glue, &format!("{C}/tracks/cd.json"))["items"]["cd3"]["title"], "New");
  assert!(glue.join(format!("{C}/lists/l1.json")).exists());
  assert_eq!(h.0.lock().unwrap().edited, vec![vec!["tracks/cd.json".to_string(), "lists/l1.json".to_string()]]);
  // The feed: what changed since 0; nothing new since 1 (a short wait).
  let w = e.wait(0, 10);
  assert_eq!(w["changes"][0]["paths"], json!(["tracks/cd.json", "lists/l1.json"]));
  assert_eq!(e.wait(1, 10)["changes"], json!([]));
  // A wait is woken by a change.
  let e2 = e.clone();
  let t = std::thread::spawn(move || e2.wait(1, 5000));
  std::thread::sleep(std::time::Duration::from_millis(100));
  e.changed("p1", "c1", &[], &["ab1".into()]);
  assert_eq!(t.join().unwrap()["changes"][0]["analysed"], json!(["ab1"]));
  // What was written, for the next sync: every file the first time (None), then the ones since.
  assert_eq!(e.take_written("p1", "c1"), None);
  command(&e, &json!({ "cmd": "apply", "p": "p1", "c": "c1", "ops": [{ "m": "analysis", "id": "ab1", "a": { "v": 3 } }] })).unwrap();
  assert_eq!(e.take_written("p1", "c1"), Some(vec!["analysis/ab.json".to_string()]));
  // A tab from before the engine holds the lease: no edits.
  h.0.lock().unwrap().lease = true;
  assert!(e.rpc(&json!({ "op": "edit", "p": "p1", "c": "c1", "ops": [] })).is_err());
  assert!(e.rpc(&json!({ "op": "nothing" })).is_err());
}

#[test]
fn a_job_removes_songs_and_their_copies() {
  let (glue, cache) = (temp("job"), temp("job-cache"));
  library(&glue);
  let h = H::default();
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  e.add_job("remove-tracks", "p1", "c1", vec!["ab1".into(), "ab2".into()]);
  for _ in 0..100 { if e.status()["jobs"] == json!([]) && h.0.lock().unwrap().events.len() >= 2 { break; } std::thread::sleep(std::time::Duration::from_millis(20)); }
  assert_eq!(read(&glue, &format!("{C}/tracks/ab.json"))["items"], json!({}));
  assert!(!glue.join("files/b.mp3").exists());
  assert_eq!(h.0.lock().unwrap().events, vec!["Removing 2 songs".to_string(), "Removed 2 songs".to_string()]);
  assert_eq!(read(&cache, "j/jobs.json"), json!([]));
}

#[test]
fn a_shared_collection_is_put_right_once_with_a_backup() {
  let (glue, cache) = (temp("repair"), temp("repair-cache"));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff" }));
  put(&glue, &format!("{C}/collection.json"), json!({ "schemaVersion": 1, "id": "c1", "name": "Shared", "shared": true, "rootsBy": { "this-computer": [{ "id": "r1", "name": "Music" }] }, "members": { "this-computer": { "profile": "p1", "name": "This computer" } } }));
  put(&glue, &format!("{C}/tracks/ab.json"), json!({ "schemaVersion": 1, "items": { "ab1": { "id": "ab1", "title": "A", "copies": { "this-computer": { "status": "linked", "rootId": "r1", "relPath": "a.mp3" } } } } }));
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "computer": "desk" });
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  command(&e, &json!({ "cmd": "ensure", "p": "p1", "c": "c1" })).unwrap();
  let t = read(&glue, &format!("{C}/tracks/ab.json"));
  assert_eq!(t["items"]["ab1"]["copies"], json!({ "desk": { "status": "linked", "rootId": "r1", "relPath": "a.mp3", "sources": [] } }));
  assert_eq!(read(&glue, &format!("{C}/collection.json"))["members"], json!({ "desk": { "profile": "p1", "name": "This computer" } }));
  let zip = std::fs::read(glue.join("backups/pre-repair-2026-10-05-p1-c1.zip")).unwrap();
  assert!(glue_store::backup::read_zip(&zip).unwrap().iter().any(|(p, _)| p == "profile/collections/c1/tracks/ab.json"));
  assert_eq!(h.0.lock().unwrap().events, vec!["Put this computer’s part of “Shared” back under it (1 record)".to_string()]);
}

#[test]
fn edited_info_goes_into_the_files_and_the_cache_follows() {
  let (glue, cache) = (temp("unwritten"), temp("unwritten-cache"));
  library(&glue);
  put(&glue, &format!("{C}/tracks/ab.json"), json!({ "schemaVersion": 1, "items": { "ab1": { "id": "ab1", "status": "linked", "rootId": "r1", "relPath": "a.mp3", "size": 1000, "mtime": 5, "title": "New title", "unwritten": ["title"], "sources": [] } } }));
  put(&glue, &format!("{C}/analysis/ab.json"), json!({ "schemaVersion": 1, "items": { "ab1": { "v": 3, "fileSize": 1000, "fileMtime": 5 } } }));
  put(&cache, "s/p1/c1/ab/ab1.json", json!({ "summary": { "fileSize": 1000, "fileMtime": 5 }, "size": 1000, "mtime": 5 }));
  let h = H::default();
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  let r = command(&e, &json!({ "cmd": "writeUnwritten", "p": "p1", "c": "c1" })).unwrap();
  assert_eq!(r["written"], 1);
  assert_eq!(h.0.lock().unwrap().tags[0].2["title"], "New title");
  let t = &read(&glue, &format!("{C}/tracks/ab.json"))["items"]["ab1"];
  assert_eq!((t["size"].clone(), t["mtime"].clone(), t.get("unwritten").is_none()), (json!(2000), json!(99), true));
  assert_eq!(read(&glue, &format!("{C}/analysis/ab.json"))["items"]["ab1"]["fileSize"], 2000);
  assert_eq!(read(&cache, "s/p1/c1/ab/ab1.json")["summary"]["fileMtime"], 99);
}

#[test]
fn the_queue_analyses_a_song_and_puts_it_into_the_library() {
  let (glue, cache, music) = (temp("queue"), temp("queue-cache"), temp("queue-music"));
  library(&glue);
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Main" }] }));
  let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/mp3-128k.mp3");
  std::fs::copy(&fixture, music.join("a.mp3")).unwrap();
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "glue": glue.to_string_lossy(), "folders": { "r1": music.to_string_lossy() }, "analysisWorkers": 2 });
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  // Where the song is: its music folder from the settings.
  let f = command(&e, &json!({ "cmd": "trackPath", "p": "p1", "c": "c1", "id": "ab1" })).unwrap();
  assert_eq!(f["path"], json!(music.join("a.mp3").to_string_lossy()));
  e.run_analysis();
  for _ in 0..300 { if h.0.lock().unwrap().events.iter().any(|x| x.starts_with("Put ")) { break; } std::thread::sleep(std::time::Duration::from_millis(100)); }
  let mut a = Value::Null;
  for _ in 0..300 { a = std::fs::read_to_string(glue.join(format!("{C}/analysis/ab.json"))).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null); if a["items"]["ab1"]["v"] == json!(3) { break; } std::thread::sleep(std::time::Duration::from_millis(100)); }
  assert_eq!(a["items"]["ab1"]["v"], json!(3), "analysed into the library");
  let t = read(&glue, &format!("{C}/tracks/ab.json"))["items"]["ab1"].clone();
  assert_eq!(t["size"], json!(std::fs::metadata(music.join("a.mp3")).unwrap().len()));
  assert_eq!(t["title"], "A", "a title set in GLUE stays");
  assert!(cache.join("s/p1/c1/ab/ab1.json").exists() && cache.join("t/p1/c1/ab/ab1.bin").exists());
  assert_eq!(h.0.lock().unwrap().made, vec!["ab1".to_string()]);
  for _ in 0..50 { if h.0.lock().unwrap().events.iter().any(|x| x.starts_with("Analysis done")) { break; } std::thread::sleep(std::time::Duration::from_millis(100)); }
  let ev = h.0.lock().unwrap().events.clone();
  assert!(ev.contains(&"Put 2 analyses into the library".to_string()), "{ev:?}");
  // The copy kept in the GLUE folder (b.mp3 is the text "song"): couldn't be decoded, saved as failed, not tried again.
  assert!(ev.iter().any(|x| x == "Analysis done: 1 song, 1 couldn’t be read"), "{ev:?}");
  assert_eq!(h.0.lock().unwrap().analysis["done"], json!(1));
  // Nothing left: a second look analyses nothing.
  e.analysis_added();
  std::thread::sleep(std::time::Duration::from_millis(500));
  assert_eq!(h.0.lock().unwrap().made.len(), 1);
}

#[test]
fn a_collection_deleted_from_the_account_is_backed_up_and_put_away() {
  let (glue, cache) = (temp("gone"), temp("gone-cache"));
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Shared" }, { "id": "c2", "name": "Mine" }], "lastCollection": "c1" }));
  put(&glue, &format!("{C}/collection.json"), json!({ "schemaVersion": 1, "id": "c1", "name": "Shared", "shared": true, "rootsBy": { "desk": [] }, "members": { "desk": { "profile": "p1", "name": "Desktop" } } }));
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "deviceId": "hdesk", "token": "t", "glue": glue.to_string_lossy(), "computer": "desk" });
  h.0.lock().unwrap().gone = true;
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  assert_eq!(command(&e, &json!({ "cmd": "syncShared" })).unwrap(), json!(0));
  assert_eq!(h.0.lock().unwrap().cloud, vec!["GET /v1/shared/c1/log?since=0".to_string()]);
  let prof = read(&glue, "profiles/p1/profile.json");
  assert_eq!(prof["collections"], json!([{ "id": "c2", "name": "Mine" }]));
  assert_eq!(prof["lastCollection"], "c2");
  assert!(glue.join("backups/pre-deleted-2026-10-05-c1.zip").exists());
  assert!(glue.join(format!("{C}/collection.json")).exists(), "its files stay");
  assert_eq!(h.0.lock().unwrap().events, vec!["“Shared” was deleted from your account: backed up and put away".to_string()]);
  // In the account again: a sync asks GLUE Cloud what changed (this stand-in answers nothing more).
  h.0.lock().unwrap().gone = false;
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Shared" }], "lastCollection": "c1" }));
  h.0.lock().unwrap().cloud.clear();
  let _ = command(&e, &json!({ "cmd": "syncShared" }));
  assert_eq!(h.0.lock().unwrap().cloud[0], "GET /v1/shared/c1/log?since=0");
}
