//! The engine over a GLUE folder on disk (a temporary one): edits, the feed, the lease, jobs, the repair, restamp,
//! song info into files.
use glue_engine::{command, Engine, Host};
use glue_store::json::Obj;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Seen { events: Vec<String>, edited: Vec<Vec<String>>, added: u32, lease: bool, computer: Option<String>, tags: Vec<(String, String, Obj)> }
#[derive(Clone, Default)]
struct H(Arc<Mutex<Seen>>);
impl Host for H {
  fn lease_held(&self) -> bool { self.0.lock().unwrap().lease }
  fn computer(&self) -> Option<String> { self.0.lock().unwrap().computer.clone() }
  fn event(&self, t: &str) { self.0.lock().unwrap().events.push(t.into()); }
  fn edited(&self, _p: &str, _c: &str, paths: &[String]) { self.0.lock().unwrap().edited.push(paths.to_vec()); }
  fn added(&self) { self.0.lock().unwrap().added += 1; }
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
  let r = e.rpc(&json!({ "op": "edit", "p": "p1", "c": "c1", "ops": [{ "m": "tracks", "ts": [{ "id": "cd3", "title": "New" }] }, { "m": "list", "l": { "id": "l1", "items": ["cd3"] } }] })).unwrap().unwrap();
  assert_eq!(r, json!({ "rev": 1, "added": true }));
  assert_eq!(read(&glue, &format!("{C}/tracks/cd.json"))["items"]["cd3"]["title"], "New");
  assert!(glue.join(format!("{C}/lists/l1.json")).exists());
  assert_eq!(h.0.lock().unwrap().added, 1);
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
  assert!(e.rpc(&json!({ "op": "edit", "p": "p1", "c": "c1", "ops": [] })).unwrap().is_err());
  // Not the engine's (the analysis queue's).
  assert!(e.rpc(&json!({ "op": "analyse" })).is_none());
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
  h.0.lock().unwrap().computer = Some("desk".into());
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
