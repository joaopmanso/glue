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
