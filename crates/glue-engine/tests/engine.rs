//! The engine over a GLUE folder on disk (a temporary one): edits, the feed, the lease, jobs, the repair, restamp,
//! song info into files, the analysis queue (a real song, analysed natively).
use glue_engine::{command, Engine, Host};
use glue_store::json::Obj;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Seen { events: Vec<String>, edited: Vec<Vec<String>>, lease: bool, config: Value, tags: Vec<(String, String, Obj)>, made: Vec<String>, analysis: Value, cloud: Vec<String>, gone: bool, engine_open: bool }
#[derive(Clone, Default)]
struct H(Arc<Mutex<Seen>>);
impl Host for H {
  fn lease_held(&self) -> bool { self.0.lock().unwrap().lease }
  fn apps_running(&self, _names: &[&str]) -> bool { self.0.lock().unwrap().engine_open }
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
  e.analysis_stale();
  std::thread::sleep(std::time::Duration::from_millis(500));
  assert_eq!(h.0.lock().unwrap().made.len(), 1);
}

/// Song info written into a file while it's analysed (a sync brought an edit, homemode.spec 2026-10-06): the analysis,
/// of the same audio, lands with the file's new date, and never puts the old one back into the library.
#[test]
fn an_analysis_running_while_its_tags_are_written_takes_the_new_date() {
  let (glue, cache, music) = (temp("late"), temp("late-cache"), temp("late-music"));
  library(&glue);
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Main" }] }));
  let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/mp3-128k.mp3");
  std::fs::copy(&fixture, music.join("a.mp3")).unwrap();
  let size = std::fs::metadata(music.join("a.mp3")).unwrap().len();
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "glue": glue.to_string_lossy(), "folders": { "r1": music.to_string_lossy() }, "analysisWorkers": 1 });
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  // The tags written (the record's date 5 → 99) while the analysis of the file as it was (date 5) runs.
  e.restamp("p1", "c1", "ab1", &json!({ "size": size, "mtime": 5 }), &json!({ "size": size, "mtime": 99 }));
  command(&e, &json!({ "cmd": "analyseSong", "p": "p1", "c": "c1", "id": "ab1" })).unwrap();
  assert_eq!(read(&cache, "s/p1/c1/ab/ab1.json")["mtime"], json!(99), "restamped as it landed");
  command(&e, &json!({ "cmd": "apply", "p": "p1", "c": "c1", "ops": [{ "m": "tracks", "ts": [{ "id": "ab1", "status": "linked", "rootId": "r1", "relPath": "a.mp3", "size": size, "mtime": 99, "title": "A", "sources": [] }] }] })).unwrap();
  e.run_analysis();
  for _ in 0..300 { if h.0.lock().unwrap().events.iter().any(|x| x.starts_with("Put ")) { break; } std::thread::sleep(std::time::Duration::from_millis(100)); }
  let t = read(&glue, &format!("{C}/tracks/ab.json"))["items"]["ab1"].clone();
  assert_eq!((t["mtime"].clone(), read(&glue, &format!("{C}/analysis/ab.json"))["items"]["ab1"]["fileMtime"].clone()), (json!(99), json!(99)));
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

/// Never more songs read or analysed at once than the settings say (the user, 2026-10-06: GLUE Home's meter showed
/// about 30 reading while 8 analysed).
#[test]
fn the_queue_never_reads_more_than_its_number() {
  let (glue, cache, music) = (temp("limit"), temp("limit-cache"), temp("limit-music"));
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Main" }] }));
  put(&glue, &format!("{C}/collection.json"), json!({ "schemaVersion": 1, "id": "c1", "name": "Main", "roots": [{ "id": "r1", "name": "Music" }] }));
  let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/mp3-128k.mp3");
  let mut items = serde_json::Map::new();
  for i in 0..40 {
    let name = format!("s{i:02}.mp3");
    std::fs::copy(&fixture, music.join(&name)).unwrap();
    let id = format!("ab{i:02}");
    items.insert(id.clone(), json!({ "id": id, "fileName": name, "status": "linked", "rootId": "r1", "relPath": name, "size": 1, "mtime": 1, "addedAt": format!("2026-01-01T00:00:{i:02}.000Z"), "sources": [] }));
  }
  put(&glue, &format!("{C}/tracks/ab.json"), json!({ "schemaVersion": 1, "items": items }));
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "glue": glue.to_string_lossy(), "folders": { "r1": music.to_string_lossy() }, "analysisWorkers": 4 });
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  e.run_analysis();
  let (mut most, mut most_running) = (0i64, 0u64);
  for _ in 0..1200 {
    let s = e.analysis_json();
    let busy = s["steps"]["reading"].as_i64().unwrap() + s["steps"]["analysing"].as_i64().unwrap();
    most = most.max(busy);
    most_running = most_running.max(s["running"].as_u64().unwrap());
    if s["done"].as_u64() == Some(40) { break; }
    std::thread::sleep(std::time::Duration::from_millis(5));
  }
  assert_eq!(e.analysis_json()["done"], json!(40));
  assert!(most <= 4 && most_running <= 4, "at most 4 at once: {most} reading or analysing, {most_running} running");
}

/// One pipeline (ADR 0157): songs a tab's scan adds (no tags read) are queued by the edit itself, their tags read first
/// and put into the library, then analysed, never more at once than the settings say, and the window's list never
/// shows more songs than run; nothing looks through the collection again.
#[test]
fn songs_added_get_their_tags_then_their_analysis_within_the_number() {
  let (glue, cache, music) = (temp("pipe"), temp("pipe-cache"), temp("pipe-music"));
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Main" }] }));
  put(&glue, &format!("{C}/collection.json"), json!({ "schemaVersion": 1, "id": "c1", "name": "Main", "roots": [{ "id": "r1", "name": "Music" }] }));
  let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/mp3-cover.mp3");
  let want = glue_engine::tags::read_info(&fixture).unwrap();
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "glue": glue.to_string_lossy(), "folders": { "r1": music.to_string_lossy() }, "analysisWorkers": 2 });
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  // GLUE Home started: nothing in the collection yet.
  e.run_analysis();
  for _ in 0..200 { if e.analysis_json()["running"] == json!(0) { break; } std::thread::sleep(std::time::Duration::from_millis(10)); }
  // A tab's scan adds six songs, as the website does with GLUE Home 0.56: no tags read, the title empty.
  let ts: Vec<Value> = (0..6).map(|i| {
    let name = format!("{i:02} Someone - Song {i}.mp3");
    std::fs::copy(&fixture, music.join(&name)).unwrap();
    json!({ "id": format!("ab{i}"), "fileName": name, "title": "", "artist": "", "status": "linked", "rootId": "r1", "relPath": name, "size": 1, "mtime": 1, "addedAt": format!("2026-01-01T00:00:0{i}.000Z"), "sources": [] })
  }).collect();
  e.rpc(&json!({ "op": "edit", "p": "p1", "c": "c1", "ops": [{ "m": "tracks", "ts": ts }] })).unwrap();
  let (mut most, mut names_over) = (0i64, false);
  for _ in 0..3000 {
    let s = e.analysis_json();
    most = most.max(s["steps"]["reading"].as_i64().unwrap() + s["steps"]["analysing"].as_i64().unwrap()).max(s["running"].as_i64().unwrap());
    if s["current"].as_array().unwrap().len() as u64 > s["running"].as_u64().unwrap() { names_over = true; }
    if s["done"].as_u64() == Some(6) && s["running"] == json!(0) { break; }
    std::thread::sleep(std::time::Duration::from_millis(5));
  }
  assert_eq!(e.analysis_json()["done"], json!(6), "all six analysed");
  assert!(most <= 2, "at most 2 at once (tags or analysis): {most}");
  assert!(!names_over, "the window's list never names more songs than run");
  let t = read(&glue, &format!("{C}/tracks/ab.json"))["items"]["ab0"].clone();
  let title = want["title"].as_str().filter(|s| !s.is_empty()).unwrap_or("Song 0");
  assert_eq!(t["title"], json!(title), "the title from its tags (or its name)");
  // The tags were in the library before the analyses were (the window's rows showed them first): one save of the
  // tracks happened before any analysis was written.
  assert!(h.0.lock().unwrap().edited.iter().any(|p| p.iter().all(|x| x.starts_with("tracks/"))), "{:?}", h.0.lock().unwrap().edited);
}

/// Verdicts made by older rules (ADR 0166): GLUE Home makes them again from the details it kept, never the file; the
/// song's analysis date stays.
#[test]
fn verdicts_made_by_older_rules_are_made_again_from_the_details() {
  let (glue, cache, music) = (temp("recheck"), temp("recheck-cache"), temp("recheck-music"));
  library(&glue);
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Main" }] }));
  let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/flac-96k-24.flac");
  std::fs::copy(&fixture, music.join("a.mp3")).unwrap();   // its record names it a.mp3: the bytes say FLAC
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "glue": glue.to_string_lossy(), "folders": { "r1": music.to_string_lossy() }, "analysisWorkers": 2 });
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  e.run_analysis();
  let mut a = Value::Null;
  for _ in 0..300 { a = std::fs::read_to_string(glue.join(format!("{C}/analysis/ab.json"))).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null); if a["items"]["ab1"]["v"] == json!(3) { break; } std::thread::sleep(std::time::Duration::from_millis(100)); }
  let now = a["items"]["ab1"].clone();
  assert_eq!(now["label"], "Genuine hi-res", "{now}");
  for _ in 0..50 { if h.0.lock().unwrap().events.iter().any(|x| x.starts_with("Analysis done")) { break; } std::thread::sleep(std::time::Duration::from_millis(100)); }
  // As an older rule judged it.
  let vv = now["vv"].as_f64().unwrap();
  let mut old = now.clone();
  old["vv"] = json!(vv - 1.0); old["grade"] = json!("warn"); old["label"] = json!("Upsampled"); old["at"] = json!("2026-01-01T00:00:00.000Z");
  a["items"]["ab1"] = old;
  put(&glue, &format!("{C}/analysis/ab.json"), a);
  e.drop_store("p1", "c1");
  assert_eq!(e.recheck_verdicts("p1", "c1").unwrap(), (1, 0));
  let back = read(&glue, &format!("{C}/analysis/ab.json"))["items"]["ab1"].clone();
  assert_eq!((back["label"].as_str(), back["grade"].as_str(), back["vv"].as_f64()), (Some("Genuine hi-res"), Some("ok"), Some(vv)));
  assert_eq!(back["at"], "2026-01-01T00:00:00.000Z", "analysed when it was");
  assert!(h.0.lock().unwrap().events.iter().any(|x| x == "Quality verdicts updated: 1 song now count as fine (a quiet top end is still hi-res)."));
  // Nothing more to do.
  assert_eq!(e.recheck_verdicts("p1", "c1").unwrap(), (0, 0));
}

#[test]
fn a_collection_is_tidied_when_it_opens() {
  let glue = temp("tidy");
  library(&glue);
  let mut t = read(&glue, &format!("{C}/tracks/ab.json"));
  // A song without a file whose file is here (an import's), and one that was only a removed import's record.
  t["items"]["ab3"] = json!({ "id": "ab3", "status": "unlinked", "rootId": null, "relPath": null, "importPath": r"C:\Music\a.mp3", "fileName": "a.mp3", "size": 1000, "rating": 5, "sources": [] });
  t["items"]["ab4"] = json!({ "id": "ab4", "status": "unlinked", "rootId": null, "relPath": null, "importPath": r"E:\x.mp3", "fileName": "x.mp3", "sources": ["gone"] });
  put(&glue, &format!("{C}/tracks/ab.json"), t);
  put(&glue, &format!("{C}/lists/l1.json"), json!({ "schemaVersion": 1, "id": "l1", "kind": "playlist", "name": "Set", "parentId": null, "position": 0, "notes": "", "items": ["ab3"], "origin": null }));
  let h = H::default();
  let e = Engine::new(glue.clone(), temp("tidy-cache"), h.clone());
  assert_eq!(e.tidy("p1", "c1").unwrap(), (1, 1, 0));
  let items = read(&glue, &format!("{C}/tracks/ab.json"))["items"].clone();
  assert!(items.get("ab3").is_none() && items.get("ab4").is_none(), "{items}");
  assert_eq!(items["ab1"]["rating"], 5, "what the user set comes along");
  assert_eq!(read(&glue, &format!("{C}/lists/l1.json"))["items"], json!(["ab1"]));
  assert!(h.0.lock().unwrap().events.iter().any(|x| x == "Tidied “Main”: 1 leftover song of a removed import gone, 1 song linked to its file"), "{:?}", h.0.lock().unwrap().events);
  assert!(!h.0.lock().unwrap().edited.is_empty(), "sent up like an edit");
  assert_eq!(e.tidy("p1", "c1").unwrap(), (0, 0, 0));
}

/// A rekordbox XML with `extra` playlists in its folder Gigs.
fn rekordbox(extra: &str) -> String {
  format!(r#"<?xml version="1.0" encoding="UTF-8"?><DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="2">
<TRACK TrackID="1" Name="A from rekordbox" Rating="204" Location="file://localhost/C:/Music/a.mp3"/>
<TRACK TrackID="2" Name="Elsewhere" Location="file://localhost/D:/x/y.mp3"/></COLLECTION>
<PLAYLISTS><NODE Type="0" Name="ROOT"><NODE Type="0" Name="Gigs"><NODE Name="Fri" Type="1" KeyType="0"><TRACK Key="1"/><TRACK Key="2"/></NODE>{extra}</NODE></NODE></PLAYLISTS></DJ_PLAYLISTS>"#)
}

#[test]
fn dj_libraries_are_imported_and_followed_by_glue_home() {
  let (glue, libs) = (temp("dj"), temp("dj-libs"));
  library(&glue);
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Main" }] }));
  std::fs::write(libs.join("rekordbox.xml"), rekordbox("")).unwrap();
  let h = H::default();
  let e = Engine::new(glue.clone(), temp("dj-cache"), h.clone());
  let place = format!("hl:{}", libs.to_string_lossy());
  // Imported from where it is (Import, with GLUE Home's dialog): read here, followed from then on.
  let r = e.rpc(&json!({ "op": "djImport", "p": "p1", "c": "c1", "place": place, "relPath": "rekordbox.xml" })).unwrap();
  let rep = &r["imports"][0]["report"];
  assert_eq!((rep["tracks"].as_u64(), rep["linked"].as_u64(), rep["lists"].as_u64()), (Some(2), Some(1), Some(2)), "{r}");
  let sid = rep["sourceId"].as_str().unwrap().to_string();
  let src = read(&glue, &format!("{C}/sources/{sid}.json"));
  assert_eq!((src["origin"]["place"].as_str(), src["origin"]["relPath"].as_str()), (Some(place.as_str()), Some("rekordbox.xml")));
  let tracks = read(&glue, &format!("{C}/tracks/ab.json"))["items"].clone();
  assert_eq!(tracks["ab1"]["rating"], 4, "the DJ app's rating, the song having none");
  // Its playlists brought into GLUE (as the page does), then the library changes on disk.
  { let s = e.store("p1", "c1").unwrap(); let mut st = s.lock().unwrap(); let src = st.sources[&sid].clone(); glue_interop::linked::import_lists(&mut st, &src, &[String::new()]); st.flush().unwrap(); }
  std::fs::write(libs.join("rekordbox.xml"), rekordbox(r#"<NODE Name="Sat" Type="1" KeyType="0"><TRACK Key="1"/></NODE>"#)).unwrap();
  // (As if it were written after the import.)
  { let s = e.store("p1", "c1").unwrap(); let mut st = s.lock().unwrap(); let mut src = st.sources[&sid].clone(); src["origin"]["modified"] = json!(0); st.put_source(src); st.flush().unwrap(); }
  e.dj_look();
  assert!(h.0.lock().unwrap().events.iter().any(|x| x == "rekordbox changed its playlists: in GLUE 1 new."), "{:?}", h.0.lock().unwrap().events);
  assert_eq!(e.rpc(&json!({ "op": "dj", "p": "p1", "c": "c1" })).unwrap()["status"][&sid], "live");
  let src = read(&glue, &format!("{C}/sources/{sid}.json"));
  assert_eq!(src["tree"].as_array().map(Vec::len), Some(3));
  assert!(src["origin"]["modified"].as_f64().unwrap() > 0.0, "marked as read");
  // Not while a tab is the writer.
  h.0.lock().unwrap().lease = true;
  std::fs::write(libs.join("rekordbox.xml"), rekordbox("")).unwrap();
  e.dj_look();
  assert_eq!(read(&glue, &format!("{C}/sources/{sid}.json"))["tree"].as_array().map(Vec::len), Some(3));
  h.0.lock().unwrap().lease = false;
  // Gone from where it was: lost, and Refresh says GLUE Home can't reach it.
  std::fs::remove_file(libs.join("rekordbox.xml")).unwrap();
  assert_eq!(e.rpc(&json!({ "op": "djRefresh", "p": "p1", "c": "c1", "id": sid })).unwrap()["ok"], false);
  assert_eq!(e.rpc(&json!({ "op": "dj", "p": "p1", "c": "c1" })).unwrap()["status"][&sid], "lost");
}

#[test]
fn dj_libraries_are_found_in_the_music_folders() {
  let (glue, music) = (temp("djfind"), temp("djfind-music"));
  library(&glue);
  let file = |rel: &str, body: &[u8]| { let p = music.join(rel); std::fs::create_dir_all(p.parent().unwrap()).unwrap(); std::fs::write(p, body).unwrap(); };
  file("Engine Library/Database2/m.db", b"SQLite format 3\0");
  file("Sets/export.xml", rekordbox("").as_bytes());
  file("Sets/small.xml", b"<DJ_PLAYLISTS>");
  file("iTunes/iTunes Library.xml", format!("<?xml version=\"1.0\"?><plist version=\"1.0\"><dict>{}</dict></plist>", " ".repeat(300)).as_bytes());
  file(".hidden/collection.nml", b"<NML>");
  file("a/b/c/collection.nml", b"<NML>");   // three folders deep: looked into
  file("a/b/c/d/collection.nml", b"<NML>"); // four: not
  file("_Serato_/database V2", b"vrsn");
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "glue": glue.to_string_lossy(), "folders": { "r1": music.to_string_lossy() } });
  let e = Engine::new(glue.clone(), temp("djfind-cache"), h);
  let mut found: Vec<String> = e.rpc(&json!({ "op": "djFind", "p": "p1", "c": "c1" })).unwrap().as_array().unwrap().iter()
    .map(|d| format!("{} {} {} {}", d["kind"].as_str().unwrap(), d["place"].as_str().unwrap(), d["placeName"].as_str().unwrap(), d["relPath"].as_str().unwrap())).collect();
  found.sort();
  assert_eq!(found, ["apple r1 Music iTunes/iTunes Library.xml", "engine r1 Music Engine Library/Database2/m.db", "rekordbox r1 Music Sets/export.xml", "serato r1 Music _Serato_", "traktor r1 Music a/b/c/collection.nml"]);
}

/// Engine DJ's hot cues of a song in a database, by slot (seconds).
fn engine_hot(db: &std::path::Path, id: i64) -> Vec<Option<glue_interop::perf::Hot>> {
  let c = rusqlite::Connection::open(db).unwrap();
  let q: Vec<u8> = c.query_row("SELECT quickCues FROM PerformanceData WHERE trackId = ?1", [id], |r| r.get(0)).unwrap();
  glue_interop::perf::hot_slots(glue_interop::perf::unq(Some(&q)).as_deref(), 44100.0)
}
/// A hot cue moved in Engine DJ (as Engine DJ would, the app closed).
fn engine_move(db: &std::path::Path, id: i64, slot: usize, t: f64) {
  let c = rusqlite::Connection::open(db).unwrap();
  let q: Vec<u8> = c.query_row("SELECT quickCues FROM PerformanceData WHERE trackId = ?1", [id], |r| r.get(0)).unwrap();
  let raw = glue_interop::perf::unq(Some(&q)).unwrap();
  let mut hot = glue_interop::perf::hot_slots(Some(&raw), 44100.0);
  hot[slot] = Some(glue_interop::perf::Hot { t, name: "Moved".into(), color: None });
  c.execute("UPDATE PerformanceData SET quickCues = ?1 WHERE trackId = ?2", rusqlite::params![glue_interop::perf::qcompress(&glue_interop::perf::encode_hot(Some(&raw), &hot, 44100.0)), id]).unwrap();
}

#[test]
fn the_main_dj_library_is_kept_in_step_both_ways() {
  let (glue, libs) = (temp("djsync"), temp("djsync-libs"));
  library(&glue);
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Main" }] }));
  // A throwaway Engine DJ library: the golden one (its songs have hot cues, a loop and a grid).
  let db = libs.join("Engine Library").join("Database2").join("m.db");
  std::fs::create_dir_all(db.parent().unwrap()).unwrap();
  std::fs::copy(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden/interop/engine-set/in/m.db"), &db).unwrap();
  let h = H::default();
  let cache = temp("djsync-cache");
  let e = Engine::new(glue.clone(), cache.clone(), h.clone());
  let place = format!("hl:{}", libs.to_string_lossy());
  let r = e.rpc(&json!({ "op": "djImport", "p": "p1", "c": "c1", "place": place, "relPath": "Engine Library/Database2/m.db" })).unwrap();
  let sid = r["imports"][0]["report"]["sourceId"].as_str().unwrap().to_string();
  // The main library, kept in step.
  let song = {
    let s = e.store("p1", "c1").unwrap();
    let mut st = s.lock().unwrap();
    glue_interop::merge::set_main_source(&mut st, Some(&sid));
    glue_interop::merge::set_source_sync(&mut st, &sid, true);
    st.flush().unwrap();
    st.sources[&sid]["tracks"].as_array().unwrap().iter().find(|t| t["externalId"] == "pc-uuid/1").unwrap()["trackId"].as_str().unwrap().to_string()
  };
  let sync = || e.rpc(&json!({ "op": "djSyncNow", "p": "p1", "c": "c1" })).unwrap();
  // GLUE has nothing of its own: in step, nothing written.
  assert_eq!((sync()["written"].as_u64(), sync()["taken"].as_u64()), (Some(0), Some(0)));
  let before = engine_hot(&db, 1);
  assert_eq!(before[0].as_ref().map(|c| (c.t, c.name.as_str())), Some((64.5, "Drop")));
  // Prepared in GLUE: Engine DJ's cues taken, pad B set, and a grid of its own.
  let set_prep = |prep: Value| { let s = e.store("p1", "c1").unwrap(); let mut st = s.lock().unwrap(); let mut t = st.tracks[&song].clone(); t["prep"] = prep; st.put_track(t); st.flush().unwrap(); };
  set_prep(json!({ "bpm": 128.0, "beat0": 0.1, "bar": 0, "cues": [
    { "t": 64.5, "kind": "cue", "num": 0, "name": "Drop", "color": "#28e214", "end": null },
    { "t": 5.0, "kind": "cue", "num": 1, "name": "Mine", "color": "#fb1ab0", "end": null },
    { "t": 1000.0 / 44100.0, "kind": "cue", "num": 3, "name": "", "color": "#ffe800", "end": null },
    { "t": 200.0, "kind": "cue", "num": 7, "name": "Ünï", "color": "#0000ff", "end": null },
    { "t": 96.0, "kind": "loop", "num": null, "name": "Roll", "color": "#ff8000", "end": 98.0 } ] }));
  // Engine DJ open: it waits.
  h.0.lock().unwrap().engine_open = true;
  assert_eq!(sync()["waiting"], true);
  assert_eq!(engine_hot(&db, 1), before, "nothing written while Engine DJ runs");
  // Closed: written, after a backup.
  h.0.lock().unwrap().engine_open = false;
  let r = sync();
  assert_eq!(r["written"].as_u64(), Some(1), "{r}");
  let now = engine_hot(&db, 1);
  assert_eq!(now[1].as_ref().map(|c| (c.t, c.name.as_str(), c.color.as_deref())), Some((5.0, "Mine", Some("#fb1ab0"))));
  assert_eq!(now[0], before[0], "the rest as it was");
  let c = rusqlite::Connection::open(&db).unwrap();
  let (beats, bpm): (Vec<u8>, f64) = c.query_row("SELECT p.beatData, t.bpmAnalyzed FROM PerformanceData p JOIN Track t ON t.id = p.trackId WHERE p.trackId = 1", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
  let g = glue_interop::perf::beat_data(&glue_interop::perf::unq(Some(&beats)).unwrap()).unwrap().1.unwrap();
  assert!((g.bpm - 128.0).abs() < 1e-6 && (g.beat0 - 0.1).abs() < 1e-6, "{g:?}");
  assert_eq!(bpm, 128.0);
  drop(c);
  assert_eq!(std::fs::read_dir(cache.join("dj-backups").join("pc-uuid")).unwrap().count(), 1, "backed up first");
  assert!(h.0.lock().unwrap().events.iter().any(|x| x.starts_with("Engine DJ: GLUE’s cues and grids written for 1 song")));
  // In step now: nothing more.
  assert_eq!(sync()["written"].as_u64(), Some(0));
  // Moved in Engine DJ: taken into GLUE.
  engine_move(&db, 1, 0, 70.0);
  let r = sync();
  assert_eq!((r["taken"].as_u64(), r["written"].as_u64()), (Some(1), Some(0)), "{r}");
  let prep = read(&glue, &format!("{C}/tracks/{}.json", &song[..2]))["items"][&song]["prep"].clone();
  let a = prep["cues"].as_array().unwrap().iter().find(|c| c["num"] == 0).unwrap().clone();
  assert_eq!((a["t"].as_f64(), a["name"].as_str()), (Some(70.0), Some("Moved")));
  // Pad B moved on both sides: a clash, each side as it is; settled for GLUE's, it's written.
  let mut p2 = prep.clone();
  for c in p2["cues"].as_array_mut().unwrap() { if c["num"] == 1 { c["t"] = json!(6.0); } }
  set_prep(p2);
  engine_move(&db, 1, 1, 7.0);
  assert_eq!(sync()["clashes"].as_u64(), Some(1));
  let clashes = e.rpc(&json!({ "op": "djClashes", "p": "p1", "c": "c1" })).unwrap();
  assert_eq!(clashes[&song][0]["what"], "hot 1", "{clashes}");
  assert_eq!(engine_hot(&db, 1)[1].as_ref().map(|c| c.t), Some(7.0));
  e.rpc(&json!({ "op": "djResolve", "p": "p1", "c": "c1", "track": song, "keep": "glue" })).unwrap();
  assert_eq!(engine_hot(&db, 1)[1].as_ref().map(|c| c.t), Some(6.0), "GLUE's kept, written");
  assert_eq!(e.rpc(&json!({ "op": "djClashes", "p": "p1", "c": "c1" })).unwrap().as_object().map(|o| o.len()), Some(0));
}

/// An Engine DJ library made with Engine DJ's own schema: songs one and two in ../Music, a folder Sets with Friday
/// [one, two], and Warm [two].
fn engine_library(dir: &std::path::Path) -> std::path::PathBuf {
  let db = dir.join("Engine Library").join("Database2").join("m.db");
  std::fs::create_dir_all(db.parent().unwrap()).unwrap();
  let c = rusqlite::Connection::open(&db).unwrap();
  c.execute_batch(&std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/engine-schema.sql")).unwrap()).unwrap();
  c.execute("INSERT INTO Information (uuid, schemaVersionMajor, schemaVersionMinor, schemaVersionPatch) VALUES ('lib-uuid', 3, 0, 2)", []).unwrap();
  let t = |p: &str| glue_interop::enginedb::add_track(&c, &glue_interop::enginedb::NewTrack { path: p.into(), ..Default::default() }, 1_790_000_000).unwrap();
  let (one, two) = (t("../Music/one.mp3"), t("../Music/two.mp3"));
  let sets = glue_interop::enginedb::create_list(&c, "Sets", 0).unwrap();
  let fri = glue_interop::enginedb::create_list(&c, "Friday", sets).unwrap();
  let warm = glue_interop::enginedb::create_list(&c, "Warm", 0).unwrap();
  glue_interop::enginedb::set_items(&c, fri, &[format!("lib-uuid/{one}"), format!("lib-uuid/{two}")]).unwrap();
  glue_interop::enginedb::set_items(&c, warm, &[format!("lib-uuid/{two}")]).unwrap();
  db
}
fn engine_lists(db: &std::path::Path) -> Vec<glue_interop::enginedb::EList> { glue_interop::enginedb::read_lists(&rusqlite::Connection::open(db).unwrap(), "lib-uuid").unwrap() }

#[test]
fn the_main_dj_librarys_playlists_are_kept_in_step_both_ways() {
  let (glue, libs) = (temp("djlists"), temp("djlists-libs"));
  let db = engine_library(&libs);
  std::fs::create_dir_all(libs.join("Music")).unwrap();
  for f in ["one.mp3", "two.mp3", "three.mp3"] { std::fs::write(libs.join("Music").join(f), b"song").unwrap(); }
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Main" }] }));
  put(&glue, &format!("{C}/collection.json"), json!({ "schemaVersion": 1, "id": "c1", "name": "Main", "roots": [{ "id": "r1", "name": "Music" }] }));
  let song = |id: &str, f: &str| json!({ "id": id, "status": "linked", "rootId": "r1", "relPath": f, "fileName": f, "size": 4, "mtime": 5, "title": f, "sources": [] });
  put(&glue, &format!("{C}/tracks/s1.json"), json!({ "schemaVersion": 1, "items": { "s1one": song("s1one", "one.mp3"), "s1two": song("s1two", "two.mp3"), "s1thr": song("s1thr", "three.mp3") } }));
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "glue": glue.to_string_lossy(), "folders": { "r1": libs.join("Music").to_string_lossy() } });
  let e = Engine::new(glue.clone(), temp("djlists-cache"), h.clone());
  let r = e.rpc(&json!({ "op": "djImport", "p": "p1", "c": "c1", "place": format!("hl:{}", libs.to_string_lossy()), "relPath": "Engine Library/Database2/m.db" })).unwrap();
  let sid = r["imports"][0]["report"]["sourceId"].as_str().unwrap().to_string();
  // The main library, kept in step, its playlists all in GLUE.
  let glue_list = |name: &str| -> Option<Value> { let s = e.store("p1", "c1").unwrap(); let st = s.lock().unwrap(); st.lists.values().find(|l| l["name"] == name).cloned() };
  let edit_list = |l: Value| { let s = e.store("p1", "c1").unwrap(); let mut st = s.lock().unwrap(); st.put_list(l); st.flush().unwrap(); };
  {
    let s = e.store("p1", "c1").unwrap();
    let mut st = s.lock().unwrap();
    glue_interop::merge::set_main_source(&mut st, Some(&sid));
    glue_interop::merge::set_source_sync(&mut st, &sid, true);
    let src = st.sources[&sid].clone();
    glue_interop::linked::import_lists(&mut st, &src, &[String::new()]);
    st.flush().unwrap();
  }
  let sync = || e.rpc(&json!({ "op": "djSyncNow", "p": "p1", "c": "c1" })).unwrap();
  assert_eq!(sync()["lists"].as_u64(), Some(0), "in step");
  let by_name = |n: &str| engine_lists(&db).into_iter().find(|l| l.title == n);
  // In GLUE: three (a song Engine DJ hasn't) added to Friday, Warm renamed, a new playlist in the library's folder.
  let mut fri = glue_list("Friday").unwrap();
  fri["items"].as_array_mut().unwrap().push(json!("s1thr"));
  edit_list(fri);
  let mut warm = glue_list("Warm").unwrap();
  warm["name"] = json!("Warm up");
  edit_list(warm);
  let top = glue_list("Engine DJ").unwrap();
  edit_list(json!({ "schemaVersion": 1, "id": "newlist", "kind": "playlist", "name": "New", "parentId": top["id"], "position": 9, "notes": "", "items": ["s1one", "s1thr"], "origin": null }));
  let r = sync();
  assert!(r["lists"].as_u64().unwrap() >= 3, "{r}");
  let three = rusqlite::Connection::open(&db).unwrap().query_row("SELECT id FROM Track WHERE path = '../Music/three.mp3'", [], |r| r.get::<_, i64>(0)).unwrap();
  assert_eq!(by_name("Friday").unwrap().items.last().map(String::as_str), Some(format!("lib-uuid/{three}").as_str()), "three added to Engine DJ's collection and to Friday");
  assert!(by_name("Warm up").is_some() && by_name("Warm").is_none());
  let new = by_name("New").unwrap();
  assert_eq!((new.parent, new.items.len()), (0, 2));
  assert_eq!(glue_list("New").unwrap()["origin"]["externalId"], new.id.to_string(), "GLUE's playlist is Engine DJ's now");
  assert_eq!(sync()["lists"].as_u64(), Some(0), "in step again");
  // In Engine DJ: Sets renamed; GLUE follows.
  let c = rusqlite::Connection::open(&db).unwrap();
  glue_interop::enginedb::rename_list(&c, by_name("Sets").unwrap().id, "Gigs").unwrap();
  drop(c);
  e.rpc(&json!({ "op": "djRefresh", "p": "p1", "c": "c1", "id": sid })).unwrap();
  sync();
  assert!(glue_list("Gigs").is_some() && glue_list("Sets").is_none());
  // Deleted in Engine DJ: asked; deleted in GLUE too.
  let c = rusqlite::Connection::open(&db).unwrap();
  glue_interop::enginedb::delete_list(&c, by_name("Warm up").unwrap().id).unwrap();
  drop(c);
  e.rpc(&json!({ "op": "djRefresh", "p": "p1", "c": "c1", "id": sid })).unwrap();
  assert!(sync()["questions"].as_u64().unwrap() >= 1);
  assert!(glue_list("Warm up").is_some(), "not deleted without asking");
  let q = e.rpc(&json!({ "op": "djQuestions", "p": "p1", "c": "c1" })).unwrap();
  let warm_q = q.as_array().unwrap().iter().find(|x| x["name"] == "Warm up").unwrap().clone();
  assert_eq!(warm_q["deletedIn"], "app");
  e.rpc(&json!({ "op": "djListResolve", "p": "p1", "c": "c1", "ext": warm_q["ext"], "delete": true })).unwrap();
  assert!(glue_list("Warm up").is_none());
  // Deleted in GLUE: asked; deleted in Engine DJ too.
  { let s = e.store("p1", "c1").unwrap(); let mut st = s.lock().unwrap(); st.delete_list("newlist"); st.flush().unwrap(); }
  sync();
  let q = e.rpc(&json!({ "op": "djQuestions", "p": "p1", "c": "c1" })).unwrap();
  let new_q = q.as_array().unwrap().iter().find(|x| x["name"] == "New").unwrap().clone();
  assert_eq!(new_q["deletedIn"], "glue");
  assert!(by_name("New").is_some(), "not deleted without asking");
  e.rpc(&json!({ "op": "djListResolve", "p": "p1", "c": "c1", "ext": new_q["ext"], "delete": true })).unwrap();
  assert!(by_name("New").is_none());
  assert_eq!(e.rpc(&json!({ "op": "djQuestions", "p": "p1", "c": "c1" })).unwrap().as_array().map(Vec::len), Some(0));
}
