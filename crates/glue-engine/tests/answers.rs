//! What the account's other devices ask GLUE Home, answered by the engine (answers.rs, covers.rs, ADR 0156): over a
//! GLUE folder on disk with a real song (analysed natively when asked), the incoming folder, and cover services that
//! answer nothing.
use glue_engine::answers::Answer;
use glue_engine::{command, Engine, Host};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Seen { config: Value, asked: Vec<String>, incoming: PathBuf }
#[derive(Clone, Default)]
struct H(Arc<Mutex<Seen>>);
impl Host for H {
  fn lease_held(&self) -> bool { false }
  fn config(&self) -> Value { self.0.lock().unwrap().config.clone() }
  fn patch_config(&self, f: &dyn Fn(&Value) -> Option<Value>) -> Option<Value> {
    let mut g = self.0.lock().unwrap();
    let patch = f(&g.config)?;
    for (k, v) in patch.as_object()? { g.config[k] = v.clone(); }
    Some(g.config.clone())
  }
  fn incoming_dir(&self) -> PathBuf { self.0.lock().unwrap().incoming.clone() }
  fn web_get(&self, url: &str) -> Result<Vec<u8>, String> { self.0.lock().unwrap().asked.push(url.into()); Err("offline".into()) }
  fn local_link(&self) -> Value { json!({ "port": 47400, "token": "t", "readToken": "r" }) }
}

fn temp(name: &str) -> PathBuf {
  let d = std::env::temp_dir().join(format!("glue-answers-{name}-{}", std::process::id()));
  let _ = std::fs::remove_dir_all(&d);
  std::fs::create_dir_all(&d).unwrap();
  d
}
fn put(d: &std::path::Path, rel: &str, v: Value) { let p = d.join(rel); std::fs::create_dir_all(p.parent().unwrap()).unwrap(); std::fs::write(p, v.to_string()).unwrap(); }
const C: &str = "profiles/p1/collections/c1";

fn setup(name: &str) -> (Arc<Engine<H>>, H, PathBuf, PathBuf, PathBuf) {
  let (glue, cache, music, incoming) = (temp(name), temp(&format!("{name}-cache")), temp(&format!("{name}-music")), temp(&format!("{name}-in")));
  put(&glue, "mco.json", json!({ "schemaVersion": 1, "profiles": [{ "id": "p1", "name": "DJ" }] }));
  put(&glue, "profiles/p1/profile.json", json!({ "schemaVersion": 1, "id": "p1", "name": "DJ", "color": "#fff", "collections": [{ "id": "c1", "name": "Main" }] }));
  put(&glue, &format!("{C}/collection.json"), json!({ "schemaVersion": 1, "id": "c1", "name": "Main", "roots": [{ "id": "r1", "name": "Music" }] }));
  put(&glue, &format!("{C}/tracks/ab.json"), json!({ "schemaVersion": 1, "items": {
    "ab1": { "id": "ab1", "fileName": "a.mp3", "status": "linked", "rootId": "r1", "relPath": "a.mp3", "size": 1000, "mtime": 5, "title": "A", "sources": [] } } }));
  let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/mp3-cover.mp3");
  std::fs::copy(&fixture, music.join("a.mp3")).unwrap();
  let h = H::default();
  { let mut g = h.0.lock().unwrap(); g.config = json!({ "glue": glue.to_string_lossy(), "folders": { "r1": music.to_string_lossy() } }); g.incoming = incoming.clone(); }
  (Engine::new(glue, cache.clone(), h.clone()), h, cache, music, incoming)
}
fn data(a: Answer) -> (Value, Vec<u8>, Option<Value>) { match a { Answer::Data { data, bytes, tell } => (data, bytes, tell), x => panic!("not data: {x:?}") } }
const SONG: fn(&str) -> Value = |t| json!({ "t": t, "profile": "p1", "collection": "c1", "track": "ab1" });

#[test]
fn a_songs_parts_made_when_asked_then_kept() {
  let (e, _h, cache, music, _) = setup("parts");
  // Its full analysis, made now (none yet), then its mini spectrogram and waveform from the cache.
  let (h, bin, _) = data(e.answer(&SONG("details")).unwrap());
  assert_eq!(h["v"].as_f64(), Some(2.0));
  assert!(!bin.is_empty());
  let thumbs = |wave: bool| data(e.answer(&json!({ "t": "thumbs", "profile": "p1", "collection": "c1", "tracks": ["ab1", "zz9"], "wave": wave })).unwrap());
  let (found, bytes, _) = thumbs(false);
  assert_eq!(found[0][0], "ab1");
  assert_eq!(found[0][1].as_u64().unwrap() as usize, bytes.len());
  assert_eq!(found[1], json!(["zz9", 0]), "a song that isn't there: none");
  assert_eq!(thumbs(true).1.len(), glue_audio::out::files::WAVE_BYTES);
  // A waveform lost from the cache: made again from the kept analysis.
  std::fs::remove_file(cache.join("w/p1/c1/ab/ab1.bin")).unwrap();
  assert_eq!(thumbs(true).1.len(), glue_audio::out::files::WAVE_BYTES);
  assert!(cache.join("w/p1/c1/ab/ab1.bin").exists());
  let (have, _, _) = data(e.answer(&json!({ "t": "have", "profile": "p1", "collection": "c1" })).unwrap());
  for k in ["thumbs", "waves", "details"] { assert_eq!(have[k], json!(["ab1"]), "{k}"); }
  // Its cover, from its tags: both sizes kept, the hash remembered.
  let (found, bytes, _) = data(e.answer(&json!({ "t": "art", "profile": "p1", "collection": "c1", "px": 320, "items": [{ "track": "ab1" }] })).unwrap());
  let hash = found[0][1].as_str().unwrap().to_string();
  assert!(hash.len() >= 8 && found[0][2].as_u64().unwrap() as usize == bytes.len() && !bytes.is_empty(), "{found}");
  assert_eq!(std::fs::read_to_string(cache.join("c/p1/c1/ab/ab1.txt")).unwrap(), hash);
  assert_eq!(data(e.answer(&json!({ "t": "have", "profile": "p1", "collection": "c1" })).unwrap()).0["art"], json!([hash]));
  // To play: the file, whole or a part.
  match e.answer(&SONG("get")).unwrap() { Answer::File { path, range, typ, .. } => { assert_eq!(PathBuf::from(path), music.join("a.mp3")); assert_eq!((range, typ.as_str()), (None, "audio/mpeg")); } x => panic!("{x:?}") }
  let part = json!({ "t": "range", "profile": "p1", "collection": "c1", "track": "ab1", "start": 10, "len": 100 });
  match e.answer(&part).unwrap() { Answer::File { range, .. } => assert_eq!(range, Some((10, 100))), x => panic!("{x:?}") }
  assert!(e.answer(&json!({ "t": "nothing" })).is_err());
}

#[test]
fn the_incoming_folder_and_the_music_folders() {
  let (e, _h, cache, music, incoming) = setup("incoming");
  std::fs::write(incoming.join("New.mp3"), b"x").unwrap();
  std::fs::write(incoming.join("Arriving.mp3.part"), b"").unwrap();
  put(&cache, "i/New.mp3.summary.json", json!({ "label": "Lossless" }));
  let (list, _, _) = data(e.answer(&json!({ "t": "incoming" })).unwrap());
  assert_eq!(list.as_array().unwrap().len(), 1);
  assert_eq!((list[0]["name"].clone(), list[0]["summary"]["label"].clone()), (json!("New.mp3"), json!("Lossless")));
  match e.answer(&json!({ "t": "get-incoming", "name": "New.mp3" })).unwrap() { Answer::File { name, .. } => assert_eq!(name, "New.mp3"), x => panic!("{x:?}") }
  assert!(e.answer(&json!({ "t": "get-incoming", "name": "Gone.mp3" })).is_err());
  let (folders, _, _) = data(e.answer(&json!({ "t": "folders" })).unwrap());
  assert_eq!(folders, json!([{ "id": "r1", "name": "Music", "collection": "DJ · Main" }]));
  // Moved into a music folder: every session told.
  let (path, _, tell) = data(e.answer(&json!({ "t": "move-incoming", "name": "New.mp3", "folder": "r1" })).unwrap());
  assert_eq!(PathBuf::from(path.as_str().unwrap()), music.join("New.mp3"));
  assert_eq!(tell, Some(json!({ "t": "event", "kind": "incoming" })));
  assert!(e.answer(&json!({ "t": "move-incoming", "name": "New.mp3", "folder": "nope" })).is_err());
  assert_eq!(data(e.answer(&json!({ "t": "local" })).unwrap()).0, json!({ "port": 47400, "token": "t", "readToken": "r" }));
}

#[test]
fn covers_looked_up_once_gently_and_refused_for_good() {
  let (e, h, _, _, _) = setup("find");
  let ask = |refuse: bool| data(e.answer(&json!({ "t": "find-art", "px": 64, "refuse": refuse, "items": [{ "id": "ab1", "artist": "Daft Punk", "album": "Discovery", "title": "One More Time" }] })).unwrap()).0;
  // Not looked up yet: "?", and looked up in the background (each service in turn; none answers here).
  assert_eq!(ask(false), json!([["ab1", "?", 0]]));
  for _ in 0..100 { if h.0.lock().unwrap().asked.len() >= 3 { break; } std::thread::sleep(std::time::Duration::from_millis(50)); }
  let asked = h.0.lock().unwrap().asked.clone();
  assert!(asked[0].starts_with("https://api.deezer.com/search/album") && asked[1].starts_with("https://itunes.apple.com") && asked[2].starts_with("https://musicbrainz.org"), "{asked:?}");
  for _ in 0..100 { if ask(false) != json!([["ab1", "?", 0]]) { break; } std::thread::sleep(std::time::Duration::from_millis(50)); }
  assert_eq!(ask(false), json!([["ab1", "", 0]]), "nothing found: none, not asked again for a month");
  assert_eq!(ask(true), json!([["ab1", "", 0]]));
  assert_eq!(ask(false), json!([["ab1", "", 0]]), "refused: never shown");
  assert_eq!(h.0.lock().unwrap().asked.len(), 3);
}

#[test]
fn the_test_engines_command_says_the_same() {
  let (e, _, _, _, _) = setup("cmd");
  let r = command(&e, &json!({ "cmd": "answer", "req": { "t": "local" } })).unwrap();
  assert_eq!(r["data"]["port"], json!(47400));
  assert_eq!(r["bytes"], json!(""));
  let r = command(&e, &json!({ "cmd": "answer", "req": SONG("range") })).unwrap();
  assert_eq!(r["file"]["type"], "audio/mpeg");
  assert_eq!(r["file"]["range"], json!([0, 0]));
}
