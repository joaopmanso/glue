//! GLUE Home is the library's engine (ADR 0104, ADR 0153): on its computer it's the only writer of the GLUE folder,
//! and a GLUE tab there is its screen. This crate is home/ui/engine.ts in Rust, around `glue-store`:
//! - one store per collection, loaded once and shared by everything that writes it (a tab's edits, the analysis,
//!   the shared sync), so no copy goes stale; a shared collection as this computer, put right once (ADR 0108);
//! - `edit`: a tab's changes (`StoreOp`s) applied in order and saved;
//! - `wait`: the feed of changes (which files, which songs analysed), a long poll;
//! - jobs that go on without the tab (removing songs), kept in GLUE Home's cache and carried on after a restart;
//! - what was written since the last shared sync (ADR 0107);
//! - the analysis queue (`queue.rs`, ADR 0154): this computer's songs analysed natively (`analyse.rs`) and taken into
//!   the library; where songs and music folders are on this computer (`library.rs`);
//! - the shared collections synced with GLUE Cloud (`sync.rs`, `shared.rs`, ADR 0155);
//! - the answers to the account's other devices (`answers.rs`, `covers.rs`, `incoming.rs`, ADR 0156);
//! - the account's signaling room and the sessions with other devices, which computer this is (`room.rs`,
//!   `sessions.rs`, `ice.rs`, `identity.rs`, ADR 0158).
//!
//! No Tauri: the app is a `Host`. `glue-engine-test` serves it to the e2e tests.
pub mod analyse;
pub mod answers;
pub mod covers;
pub mod dupes;
pub mod ice;
pub mod identity;
pub mod incoming;
pub mod library;
pub mod names;
pub mod queue;
pub mod room;
pub mod sessions;
pub mod shared;
pub mod service;
pub mod reminders;
pub mod repairs;
pub mod sync;
pub mod tags;
pub mod verdicts;
pub mod verify;

use glue_store::dir::{read_json, Dir, FsDir};
use glue_store::json::{stringify, Obj};
use glue_store::store::{shard_of, LoadOpts, Store, Unwritten};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, Weak};
use std::time::{Duration, Instant};

/// What the app does for the engine.
pub trait Host: Send + Sync + 'static {
  /// A GLUE tab from before the engine writes the library itself (ADR 0087): the engine writes nothing meanwhile.
  fn lease_held(&self) -> bool;
  /// GLUE Home's settings (home/ui/bridge.ts `HomeConfig`): the GLUE folder, this computer, the music folders, Stop,
  /// the analysis's pause and numbers.
  fn config(&self) -> Value;
  /// The settings changed by `f` (None: nothing to change), saved; the new settings.
  fn patch_config(&self, _f: &dyn Fn(&Value) -> Option<Value>) -> Option<Value> { None }
  /// GLUE Home isn't stopped (Stop pauses the jobs and the analysis).
  fn running(&self) -> bool { self.config()["running"] != Value::Bool(false) }
  /// A public service's answer (a cover look-up, ADR 0086): the body's bytes. Only GLUE Home's own rules decide which
  /// addresses (home/src-tauri/src/web.rs).
  fn web_get(&self, _url: &str) -> Result<Vec<u8>, String> { Err("no cover services here".into()) }
  /// How a GLUE page on this computer reaches GLUE Home without GLUE Cloud (ADR 0048, 0104): `{ port, token, readToken }`.
  fn local_link(&self) -> Value { json!({ "port": null, "token": null, "readToken": null }) }
  /// GLUE Home is sending or receiving for another device now (the background waits).
  fn serving(&self) -> bool { false }
  /// An access token for this GLUE Home's credential (`POST /v1/auth/device`), for the room's socket.
  fn access_token(&self) -> Result<String, sync::CloudError> { Err(sync::CloudError::new("GLUE Home isn’t connected to GLUE Cloud")) }
  /// The signaling room's socket (`wss://…/v1/signal?token=…`).
  fn open_socket(&self, _url: &str) -> Result<Box<dyn room::Socket>, String> { Err("no room here".into()) }
  /// The connections to other devices (crates/glue-rtc), if this host makes them.
  fn peers(&self) -> Option<Arc<dyn room::Peers>> { None }
  /// The room's state and its sessions changed (`{ state, text, sessions: { list, max } }`: GLUE Home's window).
  fn room_changed(&self, _room: &Value) {}
  /// The background's progress changed (`{ done, total, running }`: GLUE Home's window shows it).
  fn background_changed(&self, _progress: &Value) {}
  /// Which computer this is (ADR 0108), once known.
  fn computer(&self) -> Option<String> { self.config()["computer"].as_str().map(String::from) }
  fn version(&self) -> String { String::new() }
  /// This computer's usual folders (to find music folders by name) and its drives or volumes (to search).
  fn known_folders(&self) -> library::Known { library::Known { sep: std::path::MAIN_SEPARATOR, ..Default::default() } }
  fn drives(&self) -> Vec<PathBuf> { vec![] }
  /// GLUE Home's incoming folder (ADR 0048).
  fn incoming_dir(&self) -> PathBuf;
  /// A folder called `name` with `sample` in it, searched for on this computer's drives (at most `secs` seconds).
  fn find_folder(&self, name: &str, sample: &str, secs: u64) -> Option<String> {
    let mut starts = self.known_folders().starts();
    starts.extend(self.drives());
    library::search_folder(starts, name, sample, secs.clamp(1, 25))
  }
  /// A file called `name` of `size` bytes: in `first` (music folders), then the usual folders and the drives.
  fn find_file(&self, name: &str, size: u64, first: &[PathBuf]) -> Option<String> {
    let mut later = self.known_folders().starts();
    later.extend(self.drives());
    library::search_file(first, &later, name, size)
  }
  /// A song's file read whole (GLUE Home gives way to songs being played, ADR 0138).
  fn read_song(&self, path: &Path, name: &str) -> Result<Vec<u8>, String> {
    let f = std::fs::File::open(path).map_err(|e| format!("{name} could not be read ({e})"))?;
    analyse::read_whole(path, name, std::io::BufReader::with_capacity(1 << 20, f))
  }
  /// When this computer last played a song (ms; the analysis eases off, ADR 0138).
  fn foreground_at(&self) -> f64 { 0.0 }
  /// The analysis queue's state changed (GLUE Home's window, a tab's status).
  fn analysis_changed(&self, _state: &Value) {}
  /// A song's parts were made here (any reason). (The devices with a session are told by the room, room.rs.)
  fn made(&self, _p: &str, _c: &str, _id: &str) {}
  /// A call to GLUE Cloud (`path` under its address, as this GLUE Home, with its credential): the answer's text, or
  /// why not (its HTTP status, 0 for none).
  fn cloud(&self, _method: &str, _path: &str, _content_type: Option<&str>, _body: Option<&str>) -> Result<String, sync::CloudError> { Err(sync::CloudError::new("GLUE Home isn’t connected to GLUE Cloud")) }
  /// Something for GLUE Home's Activity list.
  fn event(&self, _text: &str) {}
  /// A tab's edit (or a repair, or a job) was saved: the shared sync sends it up soon.
  fn edited(&self, _p: &str, _c: &str, _paths: &[String]) {}
  /// The engine's status changed (the settings window shows it).
  fn changed(&self) {}
  /// A song's edited info into its file (ADR 0071): its new size and date. Only GLUE Home writes tags.
  fn write_tags(&self, _root_id: &str, _rel_path: &str, _tags: &Obj) -> Result<(f64, f64), String> { Err("GLUE Home doesn’t write tags here".into()) }
  /// Whether a music folder can be reached now (a network folder may not be connected).
  fn reachable(&self, _root_id: &str) -> bool { true }
  /// The time, ms and ISO (the bin's names, backups, jobs).
  fn now(&self) -> (i64, String) { now() }
  // ---- GLUE Home's service (service.rs, ADR 0160) ----------------------------------------------------------------
  /// GLUE Home's status changed (`service::status_json`: its window and its tray show it).
  fn status_changed(&self, _status: &Value) {}
  /// A desktop notification (an event that needs music, ADR 0074): shown or not.
  fn notify(&self, _title: &str, _body: &str) -> bool { false }
  /// The website's GLUE folder in a usual place, when none is chosen (GLUE Home: Documents\GLUE…).
  fn find_glue(&self) -> Option<String> { None }
  /// GLUE Home updates itself now if a newer version is out (nothing is being sent: the service checks first), saying
  /// so first with `say` ("Updating to 0.59.0…"), then why not if it failed.
  fn auto_update(&self, _say: &dyn Fn(&str)) {}
  /// A new secret for the local link (random, hex), or None where none is made here.
  fn new_token(&self) -> Option<String> { None }
}

/// The time now, ms since 1970 and its ISO form (`Date.now()`, `toISOString()`).
pub fn now() -> (i64, String) {
  let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
  (ms, iso(ms))
}
/// `new Date(ms).toISOString()`.
pub fn iso(ms: i64) -> String {
  let (secs, milli) = (ms.div_euclid(1000), ms.rem_euclid(1000));
  let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
  let z = days + 719_468;
  let era = z.div_euclid(146_097);
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let (d, m) = (doy - (153 * mp + 2) / 5 + 1, if mp < 10 { mp + 3 } else { mp - 9 });
  let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
  format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{milli:03}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

type Shared<T> = Arc<Mutex<T>>;
/// A music folder's last drive search: what it found, and when (held while one runs).
pub(crate) type Search = Mutex<Option<(Option<String>, Instant)>>;
type Key = (String, String);

#[derive(Default)]
struct Feed { rev: u64, log: VecDeque<Value> }

#[derive(Debug, Clone)]
pub struct Job { pub id: String, pub kind: String, pub p: String, pub c: String, pub ids: Vec<String>, pub done: usize, pub at: i64 }

const JOBS: &str = "j/jobs.json";
/// A look at every file of a collection, now and then (in case something wrote around the stores).
const FULL_EVERY: i64 = 30 * 60 * 1000;

pub struct Engine<H: Host> {
  /// The GLUE folder (GLUE Home's settings choose it; it can change while the engine runs: `set_glue`).
  glue: std::sync::RwLock<PathBuf>,
  pub cache: PathBuf,
  pub host: H,
  stores: Mutex<HashMap<Key, Shared<Store<FsDir>>>>,
  feed: Mutex<Feed>,
  woke: Condvar,
  jobs: Mutex<Option<Vec<Job>>>,
  running_jobs: Mutex<bool>,
  written: Mutex<HashMap<Key, indexmap::IndexSet<String>>>,
  looked_at: Mutex<HashMap<Key, i64>>,
  pub(crate) queue: queue::Queue,
  /// The drive searches for music folders, by folder: one at a time, what it found, when (library.rs).
  pub(crate) searches: Mutex<HashMap<String, Arc<Search>>>,
  pub(crate) me: Mutex<Weak<Self>>,
  /// One sync of the shared collections at a time (shared.rs); this computer's numbers last sent, by collection.
  pub(crate) syncing: Mutex<()>,
  pub(crate) counted: Mutex<HashMap<String, (String, i64)>>,
  /// What the answers to other devices keep (answers.rs, covers.rs).
  pub(crate) devices: answers::Devices,
  /// The signaling room and the sessions (room.rs).
  pub(crate) room: room::Room,
  /// GLUE Home's service: its status, its timers (service.rs).
  pub(crate) svc: service::Svc,
  /// The duplicates' matching to do, one at a time (dupes.rs).
  pub(crate) dupes: dupes::Pending,
  /// The collections whose verdicts were looked at again this run (verdicts.rs).
  pub(crate) rechecked: Mutex<std::collections::HashSet<Key>>,
  pub(crate) tidied: Mutex<std::collections::HashSet<Key>>,
}

fn key(p: &str, c: &str) -> Key { (p.to_string(), c.to_string()) }
fn get<'a>(o: &'a Value, k: &str) -> Option<&'a Value> { o.as_object().and_then(|o| o.get(k)) }
fn text(v: &Value, k: &str) -> String { get(v, k).and_then(|x| x.as_str()).unwrap_or("").to_string() }
fn truthy(v: Option<&Value>) -> bool { glue_store::project::truthy(v) }

/// A song the tab sent (`mine`) over the one here (`cur`): the fields it changed from what it had (`was`) taken, the
/// others as they are here. No record here, or none the tab had: as sent.
pub fn changed_over(cur: Option<&Value>, mine: &Value, was: Option<&Value>) -> Value {
  let (Some(cur), Some(m), Some(w)) = (cur.and_then(|c| c.as_object()), mine.as_object(), was.and_then(|w| w.as_object())) else { return mine.clone() };
  let mut out = cur.clone();
  for k in m.keys().chain(w.keys().filter(|k| !m.contains_key(*k))) {
    let (a, b) = (m.get(k), w.get(k));
    if a == b { continue; }
    match a { Some(v) => { out.insert(k.clone(), v.clone()); } None => { out.shift_remove(k); } }
  }
  Value::Object(out)
}

impl<H: Host> Engine<H> {
  pub fn new(glue: PathBuf, cache: PathBuf, host: H) -> Arc<Self> {
    let e = Arc::new(Engine { glue: std::sync::RwLock::new(glue), cache, host, stores: Mutex::new(HashMap::new()), feed: Mutex::new(Feed::default()), woke: Condvar::new(), jobs: Mutex::new(None), running_jobs: Mutex::new(false), written: Mutex::new(HashMap::new()), looked_at: Mutex::new(HashMap::new()), queue: Default::default(), searches: Default::default(), me: Mutex::new(Weak::new()), syncing: Mutex::new(()), counted: Default::default(), devices: Default::default(), room: Default::default(), svc: Default::default(), dupes: Default::default(), rechecked: Default::default(), tidied: Default::default() });
    *e.me.lock().unwrap() = Arc::downgrade(&e);
    e
  }
  fn arc(&self) -> Option<Arc<Self>> { self.me.lock().unwrap().upgrade() }

  /// Started with GLUE Home: the analysis paused as the settings say, then looking for songs to analyse after `first`
  /// and every `every` (GLUE Home: 20 s, then every minute), unless GLUE Home is stopped.
  pub fn start_analysis(self: &Arc<Self>, first: Duration, every: Duration) {
    self.set_paused(self.host.config()["analysisPaused"].as_bool().unwrap_or(false), true);
    let me = Arc::downgrade(self);
    std::thread::spawn(move || {
      std::thread::sleep(first);
      while let Some(e) = me.upgrade() {
        if e.host.running() { e.run_analysis(); }
        drop(e);
        std::thread::sleep(every);
      }
    });
  }
  fn dir(&self) -> FsDir { FsDir { root: self.glue() } }
  /// The GLUE folder.
  pub fn glue(&self) -> PathBuf { self.glue.read().unwrap().clone() }
  /// Another GLUE folder (GLUE Home's settings chose it): everything kept of the last one let go, its collections
  /// looked through for songs to analyse.
  pub fn set_glue(self: &Arc<Self>, p: PathBuf) {
    if *self.glue.read().unwrap() == p { return; }
    *self.glue.write().unwrap() = p;
    self.forget();
    self.analysis_stale();
  }
  /// A tab's edit (or a repair, a job, the analysis's results) was saved: told, and the shared collections synced two
  /// seconds later (a burst makes one sync, ADR 0106).
  pub(crate) fn edited(&self, p: &str, c: &str, paths: &[String]) { self.host.edited(p, c, paths); if let Some(e) = self.arc() { e.sync_soon(2000); } }
  /// Something for GLUE Home's Activity (its window shows each new one as a toast).
  pub fn event(&self, text: &str) { self.svc_event(text); self.host.event(text); }
  fn cache_dir(&self) -> FsDir { FsDir { root: self.cache.clone() } }

  /// A collection's store, loaded once and kept (a shared one as this computer, put right once).
  pub fn store(&self, p: &str, c: &str) -> Result<Shared<Store<FsDir>>, String> {
    if let Some(s) = self.stores.lock().unwrap().get(&key(p, c)) { return Ok(s.clone()); }
    let raw = read_json(&self.dir(), &format!("profiles/{p}/collections/{c}/collection.json")).ok().flatten();
    let shared = raw.as_ref().is_some_and(|r| glue_store::project::truthy(get(r, "shared")));
    let computer = self.host.computer().filter(|m| !glue_store::project::unknown_computer(Some(m)));
    let opts = if shared { match &computer { Some(me) => LoadOpts { me: Some(me.clone()), ..Default::default() }, None => LoadOpts { shown_only: true, ..Default::default() } } } else { LoadOpts::default() };
    let mut st = Store::load(self.dir(), p, c, opts, Box::new(now))?;
    if shared { if let Some(me) = &computer { self.repair(&mut st, p, c, me)?; } }
    let s = Arc::new(Mutex::new(st));
    // Loaded meanwhile by another caller: theirs is the one.
    let mut all = self.stores.lock().unwrap();
    Ok(all.entry(key(p, c)).or_insert(s).clone())
  }

  /// A shared collection's parts written under another id, folded back into this computer, once (ADR 0108): a
  /// backup of the profile first (backups/pre-repair-…zip; one that fails puts nothing right), then the fold, saved and
  /// sent up like an edit.
  fn repair(&self, st: &mut Store<FsDir>, p: &str, c: &str, computer: &str) -> Result<(), String> {
    let Some((counts, twins)) = st.fold_computer(computer, None) else { return Ok(()) };
    let profile = read_json(&self.dir(), &format!("profiles/{p}/profile.json")).ok().flatten().ok_or("no profile")?;
    let (_, at) = self.host.now();
    let zip = glue_store::backup::build_backup(&self.dir(), &profile, false, &at)?;
    self.dir().write_bytes(&format!("backups/pre-repair-{}-{p}-{c}.zip", &at[..10]), &zip)?;
    let mut into = indexmap::IndexMap::new();
    for (from, to) in &twins { if let Some(t) = st.tracks.get(to) { into.insert(from.clone(), t.clone()); } }
    st.absorb_tracks(&into);
    let _ = self.dir().remove(&format!("profiles/{p}/collections/{c}/dupes/{}.json", glue_store::project::OLD_STAND_IN));
    self.flush_edit(st, p, c)?;
    let n = counts.copies_moved + counts.copies_dropped + counts.analyses_moved + counts.twins;
    let name = text(&st.meta, "name");
    self.event(&format!("Put this computer’s part of “{name}” back under it{}", if n > 0 { format!(" ({n} record{})", if n == 1 { "" } else { "s" }) } else { String::new() }));
    Ok(())
  }

  /// Saved; its files told to the feed and to the next sync (`onWrote`).
  pub fn flush(&self, st: &mut Store<FsDir>, p: &str, c: &str) -> Result<Vec<String>, String> {
    // Opened as this computer's own while the website made it shared (glue_store OUTDATED): let go, read again.
    let paths = st.flush().inspect_err(|e| { if e == glue_store::store::OUTDATED { self.drop_store(p, c); } })?;
    if !paths.is_empty() { self.wrote(p, c, &paths); self.changed(p, c, &paths, &[]); }
    Ok(paths)
  }
  /// Saved, and told as the user's own change (it goes up to GLUE Cloud within seconds, ADR 0106).
  fn flush_edit(&self, st: &mut Store<FsDir>, p: &str, c: &str) -> Result<(), String> {
    let paths = self.flush(st, p, c)?;
    if !paths.is_empty() { self.edited(p, c, &paths); }
    Ok(())
  }

  /// Files changed under a store by another writer (the shared sync): read again, and in the feed.
  pub fn reload(&self, p: &str, c: &str, paths: &[String]) {
    if paths.is_empty() { return; }
    let s = self.stores.lock().unwrap().get(&key(p, c)).cloned();
    if let Some(s) = s { let _ = s.lock().unwrap().reload_files(paths); }
    self.changed(p, c, paths, &[]);
    // Songs a sync brought: one another computer has may be this computer's too (ADR 0166).
    if paths.iter().any(|x| x.starts_with("tracks/")) { self.join_after_sync(p, c); }
    // Changed around the edits (a sync took changes in): the analysis looks through the collections again.
    if paths.iter().any(|x| x.starts_with("tracks/") || x.starts_with("analysis/")) { if let Some(e) = self.arc() { e.analysis_stale(); } }
    // Songs, the user's say or another computer's matches: the duplicate groups made again (ADR 0164).
    if paths.iter().any(|x| x.starts_with("tracks/") || x.starts_with("dupes/") || x == "collection.json") { if let Some(e) = self.arc() { e.groups_soon(p, c); } }
  }
  /// A tab saved this collection itself just now: read it again.
  pub fn drop_store(&self, p: &str, c: &str) { self.stores.lock().unwrap().remove(&key(p, c)); }
  /// A GLUE tab from before the engine holds the lease: nothing kept here goes stale, and the next sync looks at every file.
  pub fn forget(&self) { self.stores.lock().unwrap().clear(); self.looked_at.lock().unwrap().clear(); }

  fn wrote(&self, p: &str, c: &str, paths: &[String]) {
    let mut w = self.written.lock().unwrap();
    let s = w.entry(key(p, c)).or_default();
    for x in paths { s.insert(x.clone()); }
  }
  /// The files that may have changed since the last sync; None: look at every file this time.
  pub fn take_written(&self, p: &str, c: &str) -> Option<Vec<String>> {
    let s = self.written.lock().unwrap().remove(&key(p, c));
    let (ms, _) = self.host.now();
    let mut looked = self.looked_at.lock().unwrap();
    if ms - looked.get(&key(p, c)).copied().unwrap_or(0) > FULL_EVERY { looked.insert(key(p, c), ms); return None; }
    Some(s.map(|s| s.into_iter().collect()).unwrap_or_default())
  }
  /// A sync that failed: what it was to look at is looked at next time.
  pub fn written_again(&self, p: &str, c: &str, paths: Option<&[String]>) {
    match paths { None => { self.looked_at.lock().unwrap().remove(&key(p, c)); } Some(ps) => self.wrote(p, c, ps) }
  }

  /// Into the feed (`analysed`: songs whose analysis is now in the cache), and a waiting tab woken.
  pub fn changed(&self, p: &str, c: &str, paths: &[String], analysed: &[String]) {
    {
      let mut f = self.feed.lock().unwrap();
      f.rev += 1;
      let mut ch = json!({ "rev": f.rev, "p": p, "c": c, "paths": paths });
      if !analysed.is_empty() { ch["analysed"] = json!(analysed); }
      f.log.push_back(ch);
      while f.log.len() > 500 { f.log.pop_front(); }
    }
    self.woke.notify_all();
    self.host.changed(); self.report_soon();
  }
  pub fn rev(&self) -> u64 { self.feed.lock().unwrap().rev }

  /// What changed since `since`, waiting up to `ms` for something; `reset`: too far behind, read it all again.
  pub fn wait(&self, since: u64, ms: u64) -> Value {
    let deadline = Instant::now() + Duration::from_millis(ms);
    let mut f = self.feed.lock().unwrap();
    while f.rev <= since {
      let left = deadline.saturating_duration_since(Instant::now());
      if left.is_zero() { break; }
      f = self.woke.wait_timeout(f, left).unwrap().0;
    }
    if let Some(first) = f.log.front().and_then(|x| x["rev"].as_u64()) { if since + 1 < first { return json!({ "rev": f.rev, "changes": [], "reset": true }); } }
    json!({ "rev": f.rev, "changes": f.log.iter().filter(|x| x["rev"].as_u64().unwrap_or(0) > since).cloned().collect::<Vec<_>>() })
  }

  fn load_jobs(&self) -> std::sync::MutexGuard<'_, Option<Vec<Job>>> {
    let mut j = self.jobs.lock().unwrap();
    if j.is_none() {
      let list = read_json(&self.cache_dir(), JOBS).ok().flatten().and_then(|v| v.as_array().cloned()).unwrap_or_default();
      *j = Some(list.iter().map(|v| Job {
        id: text(v, "id"), kind: text(v, "kind"), p: text(v, "p"), c: text(v, "c"),
        ids: get(v, "ids").and_then(|i| i.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default(),
        done: get(v, "done").and_then(|d| d.as_u64()).unwrap_or(0) as usize, at: get(v, "at").and_then(|d| d.as_i64()).unwrap_or(0),
      }).collect());
    }
    j
  }
  fn save_jobs(&self, jobs: &[Job]) {
    let v: Vec<Value> = jobs.iter().map(|j| json!({ "id": j.id, "kind": j.kind, "p": j.p, "c": j.c, "ids": j.ids, "done": j.done, "at": j.at })).collect();
    let _ = self.cache_dir().write(JOBS, &stringify(&Value::Array(v)));
  }

  /// A job (removing songs), kept and carried on until it's done.
  pub fn add_job(self: &Arc<Self>, kind: &str, p: &str, c: &str, ids: Vec<String>) {
    let n = ids.len();
    {
      let mut j = self.load_jobs();
      let (ms, _) = self.host.now();
      let list = j.as_mut().unwrap();
      list.push(Job { id: format!("{ms:x}-{}", list.len()), kind: kind.to_string(), p: p.to_string(), c: c.to_string(), ids, done: 0, at: ms });
      self.save_jobs(list);
    }
    self.event(&format!("Removing {n} song{}", if n == 1 { "" } else { "s" }));
    let me = self.clone();
    std::thread::spawn(move || me.run_jobs());
  }

  /// Carry on with the jobs (after a restart too), one at a time, in steps of 250 saved as it goes.
  pub fn run_jobs(&self) {
    {
      let mut r = self.running_jobs.lock().unwrap();
      if *r { return; }
      *r = true;
    }
    let _done = Done(&self.running_jobs);
    let mut any = false;
    loop {
      let job = { let j = self.load_jobs(); j.as_ref().unwrap().first().cloned() };
      let Some(mut job) = job else { break };
      any = true;
      if !self.host.running() || self.host.lease_held() { return; }
      let Ok(s) = self.store(&job.p, &job.c) else { return };
      while job.done < job.ids.len() {
        {
          let mut st = s.lock().unwrap();
          for id in &job.ids[job.done..(job.done + 250).min(job.ids.len())] {
            let Some(t) = st.tracks.get(id).cloned() else { continue };
            if glue_store::project::truthy(get(&t, "remote")) { continue; }
            if let Some(path) = get(&t, "fileKey").and_then(|k| k.as_str()).and_then(|k| k.strip_prefix("copy:")) { let _ = self.dir().remove(path); }
            st.remove_track(id);
          }
          job.done = (job.done + 250).min(job.ids.len());
          if self.flush_edit(&mut st, &job.p, &job.c).is_err() { return; }
        }
        let mut j = self.load_jobs();
        if let Some(first) = j.as_mut().unwrap().first_mut() { first.done = job.done; }
        self.save_jobs(j.as_ref().unwrap());
        drop(j);
        self.host.changed(); self.report_soon();
      }
      let mut j = self.load_jobs();
      j.as_mut().unwrap().remove(0);
      self.save_jobs(j.as_ref().unwrap());
      drop(j);
      let n = job.ids.len();
      self.event(&format!("Removed {n} song{}", if n == 1 { "" } else { "s" }));
    }
    // Nothing to do (every 10 s): nothing to tell.
    if any { self.host.changed(); self.report_soon(); }
  }

  pub fn status(&self) -> Value {
    let j = self.load_jobs();
    json!({ "rev": self.rev(), "jobs": j.as_ref().unwrap().iter().map(|j| json!({ "kind": j.kind, "left": j.ids.len() - j.done, "total": j.ids.len() })).collect::<Vec<_>>() })
  }

  /// A GLUE tab's changes on its copy of a collection, applied here in order, then saved.
  pub fn edit(&self, p: &str, c: &str, ops: &[Value]) -> Result<Value, String> {
    if self.host.lease_held() { return Err("a GLUE tab from before GLUE Home’s engine is writing this library: close it, or update it".into()); }
    let s = self.store(p, c)?;
    let mut st = s.lock().unwrap();
    // The songs the edit names, and those new to the collection (a scan of new music folders): queued for their tags and
    // their analysis at once (ADR 0157).
    let named: Vec<String> = ops.iter().filter(|op| op["m"] == "tracks").flat_map(|op| op["ts"].as_array().into_iter().flatten().map(|t| text(t, "id"))).collect();
    let new: std::collections::HashSet<String> = named.iter().filter(|id| !st.tracks.contains_key(*id)).cloned().collect();
    let added = !new.is_empty();
    // Songs, playlists or the user's say about duplicates: the groups made again in a moment (ADR 0164).
    let regroup = ops.iter().any(|op| matches!(op["m"].as_str(), Some("tracks" | "removeTrack" | "meta" | "list" | "deleteList")));
    for op in ops {
      // Songs as the tab had them (`was`): only what it changed goes over the record here, which may have moved on since
      // (a clash answered, an analysis saved) before the tab read it back (ADR 0162).
      if op["m"] == "tracks" {
        if let (Some(ts), Some(was)) = (op["ts"].as_array(), op["was"].as_array()) {
          let merged: Vec<Value> = ts.iter().enumerate().map(|(i, t)| changed_over(st.tracks.get(&text(t, "id")), t, was.get(i))).collect();
          st.apply(&json!({ "m": "tracks", "ts": merged }));
          continue;
        }
      }
      st.apply(op);
    }
    self.flush_edit(&mut st, p, c)?;
    drop(st);
    if !named.is_empty() { if let Some(e) = self.arc() { e.queue_edit(p, c, &named, &new); } }
    if regroup { if let Some(e) = self.arc() { e.groups_soon(p, c); } }
    Ok(json!({ "rev": self.rev(), "added": added }))
  }

  /// A song's file changed because its tags were written (ADR 0110): what's kept of it in GLUE Home's cache (the
  /// details' header, the analysis result) follows its new size and date, if they were of the file as it was.
  pub fn restamp(&self, p: &str, c: &str, id: &str, was: &Value, now: &Value) {
    self.restamped(p, c, id, was, now);
    let cache = self.cache_dir();
    let sh = shard_of(id);
    let (dk, sk) = (format!("d/{p}/{c}/{sh}/{id}.json"), format!("s/{p}/{c}/{sh}/{id}.json"));
    let same = |a: Option<&Value>, b: Option<&Value>| glue_store::store::same_num(a, b.unwrap_or(&Value::Null));
    if let Ok(Some(mut h)) = read_json(&cache, &dk) {
      if same(get(&h, "fileSize"), get(was, "size")) && same(get(&h, "fileMtime"), get(was, "mtime")) {
        h["fileSize"] = now["size"].clone(); h["fileMtime"] = now["mtime"].clone();
        let _ = cache.write(&dk, &stringify(&h));
      }
    }
    if let Ok(Some(mut r)) = read_json(&cache, &sk) {
      if same(get(&r, "size"), get(was, "size")) && same(get(&r, "mtime"), get(was, "mtime")) {
        r["size"] = now["size"].clone(); r["mtime"] = now["mtime"].clone();
        if r.get("summary").is_some_and(|s| s.is_object()) { r["summary"]["fileSize"] = now["size"].clone(); r["summary"]["fileMtime"] = now["mtime"].clone(); }
        let _ = cache.write(&sk, &stringify(&r));
      }
    }
  }

  /// The edited song info of a collection into this computer's files (after a sync brought some in), then saved.
  pub fn write_unwritten(&self, p: &str, c: &str) -> Result<Unwritten, String> {
    let s = self.store(p, c)?;
    let mut st = s.lock().unwrap();
    let mut stamps = vec![];
    let r = st.write_unwritten(
      &mut |t, tags| self.host.write_tags(&text(t, "rootId"), &text(t, "relPath"), tags),
      &mut |t| self.host.reachable(&text(t, "rootId")),
      &mut |t, was, now| stamps.push((text(t, "id"), json!({ "size": was.0, "mtime": was.1 }), json!({ "size": glue_store::store::num(now.0), "mtime": glue_store::store::num(now.1) }))),
    );
    self.flush(&mut st, p, c)?;
    drop(st);
    for (id, was, now) in stamps { self.restamp(p, c, &id, &was, &now); }
    Ok(r)
  }

  /// A request from a GLUE tab on this computer (the local link's `/rpc`, ADR 0104).
  pub fn rpc(self: &Arc<Self>, b: &Value) -> Result<Value, String> {
    let (p, c) = (text(b, "p"), text(b, "c"));
    let cfg = self.host.config();
    let strings = |k: &str| -> Vec<String> { b[k].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default() };
    match b["op"].as_str().unwrap_or("") {
      // `computer`: which computer this is (ADR 0108), for a GLUE tab here to see the library as.
      "hello" => Ok(json!({ "engine": 1, "version": self.host.version(), "rev": self.rev(), "computer": self.host.computer() })),
      "wait" => Ok(self.wait(b["since"].as_u64().or_else(|| b["since"].as_f64().map(|x| x as u64)).unwrap_or(0), 25_000)),
      "open" => { self.drop_store(&p, &c); Ok(json!({ "ok": true })) }
      "status" => { let mut s = self.status(); s["analysis"] = self.analysis_json(); Ok(s) }
      "edit" => self.edit(&p, &c, b["ops"].as_array().map(|a| a.as_slice()).unwrap_or(&[])),
      // The shared collection's clashes, shown and answered in a GLUE tab (ADR 0095, 0162).
      "clashes" => Ok(self.clashes(&p, &c)),
      "resolve" => self.resolve(&p, &c, b),
      // The duplicates GLUE Home found (ADR 0164): its last result, or matched now (`full`: every song again).
      "dupes" => self.dupes(&p, &c, b["full"].as_bool().unwrap_or(false)),
      "restamp" => { self.restamp(&p, &c, &text(b, "id"), &b["was"], &b["now"]); Ok(json!({ "ok": true })) }
      "job" => {
        let ids = b["ids"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
        self.add_job(&text(b, "kind"), &p, &c, ids);
        Ok(json!({ "queued": true }))
      }
      // The analysis (ADR 0103, 0154): songs asked for now, and the pause.
      "analyse" => { self.analyse_now(&p, &c, &strings("ids"), &b["names"]); Ok(json!({ "ok": true })) }
      "pause" => { let on = b["on"].as_bool().unwrap_or(false); self.pause(on); Ok(json!({ "paused": on })) }
      // A song dropped onto a GLUE tab here (ADR 0125): where it is, and the collection's music folder it's in, if one.
      "whereFile" => Ok(self.where_file(&text(b, "name"), b["size"].as_f64().unwrap_or(0.0) as u64, &strings("roots"), &cfg)),
      // A folder dropped onto a GLUE tab here (the browser doesn't say where it is): found, and remembered as `id`.
      // Dropped just now (ADR 0134): a brief search, then the website has GLUE Home's dialog ask.
      "where" => {
        let root = json!({ "id": b["id"], "name": b["name"], "absPath": null });
        let sample = b["sample"].as_str().filter(|s| !s.is_empty());
        Ok(json!({ "path": self.locate(&root, sample.map(|s| (s, None)), &cfg, true, 5) }))
      }
      _ => Err("GLUE Home doesn’t know that request".into()),
    }
  }
}

/// What GLUE Home's settings window asks of the engine: one dispatcher for GLUE Home's commands and the test binary, so
/// both do the same.
pub fn command<H: Host>(e: &Arc<Engine<H>>, m: &Value) -> Result<Value, String> {
  let (p, c) = (text(m, "p"), text(m, "c"));
  let paths = |k: &str| -> Vec<String> { m[k].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default() };
  match m["cmd"].as_str().unwrap_or("") {
    "ensure" => { e.store(&p, &c)?; Ok(json!(true)) }
    // A song and its analysis, as the store has them (null: not there).
    "song" => { let s = e.store(&p, &c)?; let st = s.lock().unwrap(); let id = text(m, "id"); Ok(json!({ "track": st.tracks.get(&id), "analysis": st.analysis.get(&id) })) }
    // Changes applied and saved (the analysis's results): the files written.
    "apply" => { let s = e.store(&p, &c)?; let mut st = s.lock().unwrap(); for op in m["ops"].as_array().into_iter().flatten() { st.apply(op); } Ok(json!(e.flush(&mut st, &p, &c)?)) }
    "flush" => { let s = e.store(&p, &c)?; let mut st = s.lock().unwrap(); Ok(json!(e.flush(&mut st, &p, &c)?)) }
    "reload" => { e.reload(&p, &c, &paths("paths")); Ok(json!(true)) }
    "takeWritten" => Ok(json!(e.take_written(&p, &c))),
    "writtenAgain" => { let ps = m["paths"].as_array().map(|_| paths("paths")); e.written_again(&p, &c, ps.as_deref()); Ok(json!(true)) }
    "changed" => { e.changed(&p, &c, &paths("paths"), &paths("analysed")); Ok(json!(true)) }
    "forget" => { e.forget(); Ok(json!(true)) }
    "drop" => { e.drop_store(&p, &c); Ok(json!(true)) }
    "counts" => { let s = e.store(&p, &c)?; let st = s.lock().unwrap(); let (tracks, songs) = st.counts(); Ok(json!({ "tracks": tracks, "songs": songs, "holds": st.holds_music(), "unwritten": st.tracks.values().any(|t| glue_store::project::truthy(get(t, "unwritten")) && !glue_store::project::truthy(get(t, "remote"))) })) }
    "writeUnwritten" => { let r = e.write_unwritten(&p, &c)?; Ok(json!({ "written": r.written, "failed": r.failed, "why": r.why, "away": r.away })) }
    "runJobs" => { let e2 = e.clone(); std::thread::spawn(move || e2.run_jobs()); Ok(json!(true)) }
    "status" => Ok(e.status()),
    "restamp" => { e.restamp(&p, &c, &text(m, "id"), &m["was"], &m["now"]); Ok(json!(true)) }
    // The library as GLUE Home sees it (library.rs).
    "describe" => Ok(e.describe().unwrap_or(Value::Null)),
    "folderOf" => Ok(json!(e.folder_of(&p, &c))),
    "trackPath" => Ok(e.track_path(&p, &c, &text(m, "id"), &e.host.config())?.to_json()),
    "locateAll" => Ok(e.locate_all(&e.host.config())),
    // The analysis (queue.rs): a song analysed now (another device waits for it; `tell`: for the library), the
    // channel's ask, a look for songs, a restart, the pause, a song streamed, the state.
    "analyseSong" => {
      let (bytes, read_ms, analyse_ms) = e.analyse_song(&p, &c, &text(m, "id"), &e.host.config(), m["tell"].as_bool().unwrap_or(true))?;
      Ok(json!({ "bytes": bytes, "readMs": read_ms, "analyseMs": analyse_ms }))
    }
    "analysisAsk" => Ok(e.analysis_ask(m)),
    "analysisRun" => { e.run_analysis(); Ok(json!(true)) }
    "analysisRestart" => { e.analysis_restart(); Ok(json!(true)) }
    "setPaused" => { e.set_paused(m["on"].as_bool().unwrap_or(false), false); Ok(json!(true)) }
    "played" => { e.played(); Ok(json!(true)) }
    "analysisState" => Ok(e.analysis_json()),
    // The shared collections synced with GLUE Cloud now (shared.rs): the files that changed here.
    "syncShared" => e.sync_shared_here().map(|n| json!(n)).map_err(|x| x.message),
    // Another device's request (answers.rs): data with its bytes (base64), or a song's file. The e2e tests' stand-in
    // for GLUE Home's connections sends what it says.
    // The signaling room and the sessions (room.rs, ADR 0158): online or not, a session disconnected in the settings,
    // the room's state; which computer this is, and a browser here attaching (identity.rs).
    // GLUE Home's service (service.rs, ADR 0160): its status; Start, Stop, Restart; reminders now; the native check.
    "serviceStatus" => Ok(e.status_json()),
    "control" => { let (e2, what) = (e.clone(), text(m, "what")); std::thread::spawn(move || e2.control(&what)); Ok(json!(true)) }
    "remindNow" => { let e2 = e.clone(); std::thread::spawn(move || e2.check_reminders(true)); Ok(json!(true)) }
    "verify" => { e.verify_run(m["n"].as_u64().unwrap_or(0) as usize); Ok(json!(true)) }
    "roomStart" => { e.room_start(); Ok(json!(true)) }
    "roomStop" => { e.room_stop(); Ok(json!(true)) }
    "roomDisconnect" => { e.disconnect(&text(m, "key")); Ok(json!(true)) }
    "roomState" => Ok(e.room_json()),
    "learnComputer" => { let e2 = e.clone(); std::thread::spawn(move || e2.learn_computer()); Ok(json!(true)) }
    "attach" => { e.attach(&text(m, "browser"))?; Ok(json!(true)) }
    // Songs in the incoming folder without an analysis (arrived while GLUE Home was off), analysed.
    "analyseWaiting" => { let e2 = e.clone(); std::thread::spawn(move || e2.analyse_waiting()); Ok(json!(true)) }
    // The background's mini spectrograms and waveforms for other devices (answers.rs): started, and how far.
    "background" => { e.background(); Ok(json!(true)) }
    "backgroundState" => Ok(e.background_json()),
    "answer" => match e.answer(&m["req"])? {
      answers::Answer::Data { data, bytes, tell } => { use base64::Engine as _; Ok(json!({ "data": data, "bytes": base64::engine::general_purpose::STANDARD.encode(bytes), "tell": tell })) }
      answers::Answer::File { path, range, name, typ } => Ok(json!({ "file": { "path": path, "range": range.map(|(s, l)| [s, l]), "name": name, "type": typ } })),
    },
    x => Err(format!("unknown command {x}")),
  }
}

struct Done<'a>(&'a Mutex<bool>);
impl Drop for Done<'_> { fn drop(&mut self) { *self.0.lock().unwrap() = false; } }

#[cfg(test)]
mod tests {
  use serde_json::json;
  #[test]
  fn a_tabs_song_changes_only_what_it_changed() {
    // Here: the title answered in a clash, and an analysis's length; the tab still had the old ones, and found a cover.
    let here = json!({ "id": "t1", "title": "Mine here", "duration": 4.05, "art": "" });
    let had = json!({ "id": "t1", "title": "From the laptop", "duration": 4, "art": "" });
    let sent = json!({ "id": "t1", "title": "From the laptop", "duration": 4, "art": "abc" });
    assert_eq!(super::changed_over(Some(&here), &sent, Some(&had)), json!({ "id": "t1", "title": "Mine here", "duration": 4.05, "art": "abc" }));
    // A field the tab removed goes; one it added comes.
    let sent = json!({ "id": "t1", "title": "From the laptop", "duration": 4, "rating": 5 });
    assert_eq!(super::changed_over(Some(&here), &sent, Some(&had)), json!({ "id": "t1", "title": "Mine here", "duration": 4.05, "rating": 5 }));
    // New here, or no base: as sent.
    assert_eq!(super::changed_over(None, &sent, Some(&had)), sent);
    assert_eq!(super::changed_over(Some(&here), &sent, None), sent);
  }
  #[test]
  fn iso_is_javascripts() {
    assert_eq!(super::iso(1_700_000_000_000), "2023-11-14T22:13:20.000Z");
    assert_eq!(super::iso(0), "1970-01-01T00:00:00.000Z");
    assert_eq!(super::iso(951_782_400_123), "2000-02-29T00:00:00.123Z");
  }
}
