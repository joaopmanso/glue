//! GLUE Home's service (ADR 0044), home/ui/service.ts in Rust (ADR 0160): the hidden page it ran in is gone. What it
//! does, and when:
//! - **at start** (`service_start`): the local link's tokens, the website's GLUE folder when none is chosen, songs that
//!   arrived while it was off analysed, online in the account's room, the shared collections' music folders found;
//! - **its timers:** the shared sync 25 s after starting, then every minute; the day's backups 45 s after, then hourly;
//!   a moved collection's cache followed 30 s after, then hourly; reminders 90 s after, then hourly; which computer
//!   this is, hourly; an update 60 s after, then every 6 hours, when nothing is being sent;
//! - **Start / Stop / Restart** (`control`, from the tray and the window), and **new settings** (`config_changed`: the
//!   room again when the account or Stop changed, the music folders found again when the GLUE folder or folders did);
//! - **its status** (`status_json`): what GLUE Home's window and tray show, said when it changes (`Host::status_changed`,
//!   at most every 2 s for the busy parts).
use crate::{text, truthy, Engine, Host};
use glue_store::dir::{read_json, Dir};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Default)]
struct St {
  /// What GLUE Home did lately, newest first, 30 at most: `{ at, text }`.
  events: VecDeque<Value>,
  /// What other devices asked since GLUE Home started, by kind: calls, ms, bytes (ADR 0083).
  served: indexmap::IndexMap<String, (u64, f64, u64)>,
  /// A song arriving now (`{ name, got, size }`), or null.
  receiving: Value,
  /// Finding the shared collections' music folders: `{ searching, found, missing }`.
  library: Value,
  /// The last look at the events: `{ at, coming, sent }`.
  reminders: Value,
  /// Said instead of the room's state for now (an update installing), until the room says something new.
  text: Option<String>,
}

#[derive(Default)]
pub struct Svc {
  st: Mutex<St>,
  /// The timers of this start (a later start stops them).
  gen: AtomicU64,
  /// A status is due (at most every 2 s).
  soon: AtomicBool,
  /// Finding the music folders now, and again after it.
  finding: Mutex<(bool, bool)>,
  /// The native engine check (verify.rs).
  pub(crate) check: crate::verify::Check,
  /// The room's state and text last said.
  room_last: Mutex<String>,
}

/// The settings' music folders a search found that should be kept (home/ui/library.ts `newlyFound`): only new places,
/// and only for folders the settings didn't change since the search began (`before`); a folder picked meanwhile stays
/// as picked. None: nothing to save.
pub fn newly_found(before: &Map<String, Value>, found: &Map<String, Value>, cur: &Map<String, Value>) -> Option<Map<String, Value>> {
  let mut add = Map::new();
  for (id, at) in found { if before.get(id) != Some(at) && cur.get(id) == before.get(id) { add.insert(id.clone(), at.clone()); } }
  if add.is_empty() { return None; }
  let mut out = cur.clone();
  out.extend(add);
  Some(out)
}
/// GLUE Home isn't stopped: settings that never said (Start or Stop never pressed) mean running.
fn running(cfg: &Value) -> bool { cfg["running"] != Value::Bool(false) }
fn ms() -> i64 { crate::now().0 }

impl<H: Host> Engine<H> {
  // ---- the status -----------------------------------------------------------------------------------------------
  pub(crate) fn svc_event(&self, text: &str) {
    { let mut st = self.svc.st.lock().unwrap(); st.events.push_front(json!({ "at": ms(), "text": text })); st.events.truncate(30); }
    self.report_soon();
  }
  /// What another device asked was answered (ADR 0083): counted for GLUE Home's window.
  pub fn served(&self, what: &str, ms: f64, bytes: u64) {
    { let mut st = self.svc.st.lock().unwrap(); let r = st.served.entry(what.into()).or_default(); r.0 += 1; r.1 += ms; r.2 += bytes; }
    self.report_soon();
  }
  /// A song arriving from another device (`{ name, got, size }`), or none now.
  pub fn receiving(&self, r: Value) {
    // Said at once when a song starts or ends arriving; its progress (every MB) within 2 s.
    let now = r.is_null() || r["got"].as_u64() == Some(0);
    self.svc.st.lock().unwrap().receiving = r;
    if now { self.report() } else { self.report_soon() }
  }
  /// GLUE Home's status, as its window and tray show it (home/ui/bridge.ts `Status`).
  pub fn status_json(&self) -> Value {
    let cfg = self.host.config();
    let room = self.room_json();
    let state = room["state"].as_str().unwrap_or("stopped").to_string();
    // The engine's parts first, then the service's own (never one lock held while asking for another).
    let (background, analysing, engine, verify) = (self.background_json(), self.analysis_json(), self.status(), self.svc.check.json());
    let st = self.svc.st.lock().unwrap();
    let served: Map<String, Value> = st.served.iter().map(|(k, (c, m, b))| (k.clone(), json!({ "calls": c, "ms": m, "bytes": b }))).collect();
    json!({
      "state": state, "text": st.text.clone().map(Value::from).unwrap_or_else(|| room["text"].clone()),
      "running": running(&cfg) && state != "unpaired" && state != "removed",
      "receiving": st.receiving, "received": cfg["received"].as_array().cloned().unwrap_or_default(),
      "library": st.library, "analysis": background, "analysing": analysing, "engine": engine,
      "verify": verify, "events": st.events.iter().cloned().collect::<Vec<_>>(), "reminders": st.reminders,
      "served": served, "sessions": room["sessions"], "computer": { "id": cfg["computer"], "why": cfg["computerWhy"].as_str().unwrap_or("") },
    })
  }
  /// Said now.
  pub fn report(&self) { self.host.status_changed(&self.status_json()); }
  /// Said within 2 s (what changes often: the analysis, what devices asked).
  pub(crate) fn report_soon(&self) {
    if self.svc.soon.swap(true, Ordering::SeqCst) { return; }
    let Some(me) = self.arc() else { self.svc.soon.store(false, Ordering::SeqCst); return };
    std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(2)); me.svc.soon.store(false, Ordering::SeqCst); me.report(); });
  }
  /// Something said instead of the room's state for now (an update installing).
  fn say(&self, text: &str) { self.svc.st.lock().unwrap().text = Some(text.into()); self.report(); }
  /// The room said something new: its own state again.
  pub(crate) fn room_says(&self) { self.svc.st.lock().unwrap().text = None; }
  /// The room changed: said at once when its state or text did (online, stopped…); its sessions' comings and goings and
  /// activity within 2 s (2026-10-07: a status on each, to a window that also carries the transfers, held them up).
  pub(crate) fn room_report(&self, room: &Value) {
    let k = format!("{}|{}", room["state"], room["text"]);
    let changed = { let mut last = self.svc.room_last.lock().unwrap(); let c = *last != k; *last = k; c };
    if changed { self.report() } else { self.report_soon() }
  }

  // ---- start, Start / Stop / Restart, new settings ---------------------------------------------------------------------
  /// GLUE Home started: its service, and its timers.
  pub fn service_start(self: &Arc<Self>) {
    let cfg = self.host.config();
    // The tokens that let a GLUE page on this computer use the local link (the full one, and the read-only one for a
    // GLUE tab while GLUE Home is the library's engine, ADR 0104), made once.
    if let Some(t) = self.host.new_token().filter(|_| cfg["localToken"].as_str().is_none_or(|s| s.is_empty())) { self.host.patch_config(&|cur| cur["localToken"].as_str().is_none_or(|s| s.is_empty()).then(|| json!({ "localToken": t }))); }
    if let Some(t) = self.host.new_token().filter(|_| cfg["readToken"].as_str().is_none_or(|s| s.is_empty())) { self.host.patch_config(&|cur| cur["readToken"].as_str().is_none_or(|s| s.is_empty()).then(|| json!({ "readToken": t }))); }
    // The website's GLUE folder, when it's in a usual place and none was chosen.
    if cfg["glue"].as_str().is_none_or(|g| g.is_empty()) { if let Some(g) = self.host.find_glue() { self.host.patch_config(&|cur| cur["glue"].as_str().is_none_or(|x| x.is_empty()).then(|| json!({ "glue": g }))); } }
    // Songs already waiting without an analysis (arrived while it was off).
    { let me = self.clone(); std::thread::spawn(move || me.analyse_waiting()); }
    self.room_start();
    self.find_folders();
    self.timers();
    self.report();
  }
  /// Start, Stop or Restart (the tray, the window). Stopped, GLUE Home does nothing: offline, nothing analysed, synced or
  /// written, and the local link answers only its own windows, so a GLUE tab here carries on in the browser as if it
  /// were quit (2026-10-01). Restart also starts the engine and the analysis over.
  pub fn control(self: &Arc<Self>, what: &str) {
    let run = what != "stop";
    if running(&self.host.config()) != run { self.host.patch_config(&|_| Some(json!({ "running": run }))); }
    if what == "stop" { self.room_stop(); self.event("Stopped: GLUE in the browser carries on by itself"); return; }
    if what == "restart" { self.forget(); self.analysis_restart(); }
    self.room_start();
    self.event(if what == "restart" { "Restarted" } else { "Started" });
    self.run_analysis();
    self.sync_soon(1500);
    self.find_folders();
  }
  /// New settings (joined an account, another GLUE folder, a folder picked, the pause): acted on, online again when the
  /// account or Stop changed.
  pub fn config_changed(self: &Arc<Self>, before: &Value, after: &Value) {
    let differ = |k: &str| before[k] != after[k];
    if differ("glue") || differ("serve") || differ("folders") { self.find_folders(); }
    if truthy(before.get("analysisPaused")) != truthy(after.get("analysisPaused")) { self.set_paused(truthy(after.get("analysisPaused")), false); }
    if differ("deviceId") || differ("token") || running(before) != running(after) || before["api"].as_str().unwrap_or("") != after["api"].as_str().unwrap_or("") { self.room_start(); }
    self.report();
  }

  // ---- the shared collections' music folders -----------------------------------------------------------------------
  /// Found by themselves (at start, and when the settings change); what's found is remembered, so songs play at once.
  /// Then the background's mini spectrograms and analyses for other devices.
  pub fn find_folders(self: &Arc<Self>) {
    { let mut f = self.svc.finding.lock().unwrap(); if f.0 { f.1 = true; return; } f.0 = true; }
    let me = self.clone();
    std::thread::spawn(move || loop {
      me.svc.finding.lock().unwrap().1 = false;
      let cfg = me.host.config();
      if cfg["glue"].as_str().is_none_or(|g| g.is_empty()) { me.svc.st.lock().unwrap().library = Value::Null; me.report(); }
      else {
        me.svc.st.lock().unwrap().library = json!({ "searching": true, "found": 0, "missing": [] });
        me.report();
        let before = cfg["folders"].as_object().cloned().unwrap_or_default();
        let r = me.locate_all(&cfg);
        let found = r["folders"].as_object().cloned().unwrap_or_default();
        // Only what the search found anew, and only where nothing changed meanwhile.
        me.host.patch_config(&|cur| newly_found(&before, &found, &cur["folders"].as_object().cloned().unwrap_or_default()).map(|f| json!({ "folders": f })));
        me.svc.st.lock().unwrap().library = json!({ "searching": false, "found": found.len(), "missing": r["missing"] });
        me.report();
        me.background();
      }
      let mut f = me.svc.finding.lock().unwrap();
      if !f.1 { f.0 = false; return; }
    });
  }

  // ---- the timers ---------------------------------------------------------------------------------------------------
  fn timers(self: &Arc<Self>) {
    let gen = self.svc.gen.fetch_add(1, Ordering::SeqCst) + 1;
    let me = Arc::downgrade(self);
    std::thread::Builder::new().name("glue-service".into()).spawn(move || {
      let t0 = Instant::now();
      let s = Duration::from_secs;
      // (what, first after, then every): the service page's, as it had them.
      let mut due: Vec<(&str, Duration, Duration)> = vec![("sync", s(25), s(60)), ("moves", s(30), s(3600)), ("backups", s(45), s(3600)), ("update", s(60), s(6 * 3600)), ("reminders", s(90), s(3600)), ("computer", s(3600), s(3600))];
      loop {
        std::thread::sleep(s(1));
        let Some(e) = me.upgrade() else { return };
        if e.svc.gen.load(Ordering::SeqCst) != gen { return; }
        let now = t0.elapsed();
        for d in due.iter_mut() {
          if now < d.1 { continue; }
          d.1 = now + d.2;
          let (e2, what) = (e.clone(), d.0);
          std::thread::spawn(move || e2.tick(what));
        }
      }
    }).ok();
  }
  fn tick(self: &Arc<Self>, what: &str) {
    let cfg = self.host.config();
    let on = running(&cfg);
    match what {
      "sync" if on => self.sync_soon(0),
      "moves" if on => { let n = self.follow_moves(); if n > 0 { eprintln!("GLUE Home: {n} cache files followed their moved collections"); } }
      "backups" if on => { self.backups_daily(); }
      "reminders" => self.check_reminders(false),
      "computer" => self.learn_computer(),
      "update" if cfg["autoUpdate"] != false && !self.busy() => self.host.auto_update(&|t| self.say(t)),
      _ => {}
    }
  }
  /// GLUE Home is sending or receiving for another device (updates wait).
  fn busy(&self) -> bool { !self.svc.st.lock().unwrap().receiving.is_null() || self.host.serving() }

  // ---- the day's backups (ADR 0090), when no GLUE tab here makes them ------------------------------------------------
  /// One backup a day of each profile (`backups/auto/<day>-<profile>.zip`, the last 14 kept), as the website's
  /// `autoBackup`: how many were made.
  pub fn backups_daily(&self) -> usize {
    let cfg = self.host.config();
    if cfg["glue"].as_str().is_none_or(|g| g.is_empty()) || self.host.lease_held() { return 0; }
    let dir = self.dir();
    let (_, iso) = self.host.now();
    let day = &iso[..10];
    let mut made = 0;
    let lib = self.describe().unwrap_or(Value::Null);
    for p in lib["profiles"].as_array().into_iter().flatten() {
      let pid = text(p, "id");
      let Ok(Some(profile)) = read_json(&dir, &format!("profiles/{pid}/profile.json")) else { continue };
      let mut mine: Vec<String> = dir.list(AUTO_DIR, false).unwrap_or_default().into_iter().filter(|n| n.ends_with(&format!("-{pid}.zip"))).collect();
      mine.sort();
      let name = format!("{day}-{pid}.zip");
      if mine.contains(&name) { continue; }
      let Ok(zip) = glue_store::backup::build_backup(&dir, &profile, false, &iso) else { continue };
      if dir.write_bytes(&format!("{AUTO_DIR}/{name}"), &zip).is_err() { continue; }
      made += 1;
      mine.push(name);
      mine.sort();
      for old in mine.iter().take(mine.len().saturating_sub(AUTO_KEEP)) { let _ = dir.remove(&format!("{AUTO_DIR}/{old}")); }
    }
    made
  }

  // ---- a collection that went into another (ADR 0102): GLUE Home's cache follows it ---------------------------------
  /// The mini spectrograms, waveforms, analyses and covers made for a moved collection's songs are the new one's (with
  /// the ids `movedIds` changed). Once per moved collection: the files copied.
  pub fn follow_moves(&self) -> usize {
    if self.host.config()["glue"].as_str().is_none_or(|g| g.is_empty()) { return 0; }
    let (dir, cache) = (self.dir(), self.cache_dir());
    let mut moved = 0;
    for pid in dir.list("profiles", true).unwrap_or_default() { for cid in dir.list(&format!("profiles/{pid}/collections"), true).unwrap_or_default() {
      let Ok(Some(meta)) = read_json(&dir, &format!("profiles/{pid}/collections/{cid}/collection.json")) else { continue };
      let Some(to) = meta["movedTo"].as_str().filter(|t| !t.is_empty()) else { continue };
      let done = format!("m/{pid}/{cid}.done");
      if cache.read_bytes(&done).ok().flatten().is_some() { continue; }
      let ids = meta["movedIds"].as_object().cloned().unwrap_or_default();
      for k in ["t", "w", "d", "c"] { for a in HEX { for b in HEX {
        let at = format!("{k}/{pid}/{cid}/{}{}", *a as char, *b as char);
        for n in cache.list(&at, false).unwrap_or_default() {
          let (id, ext) = match n.find('.') { Some(i) => (&n[..i], &n[i..]), None => (n.as_str(), "") };
          let nid = ids.get(id).and_then(|v| v.as_str()).unwrap_or(id);
          let Ok(Some(bytes)) = cache.read_bytes(&format!("{at}/{n}")) else { continue };
          if cache.write_bytes(&format!("{k}/{pid}/{to}/{}/{nid}{ext}", glue_store::store::shard_of(nid)), &bytes).is_ok() { moved += 1; }
        }
      } } }
      let _ = cache.write(&done, &ms().to_string());
    } }
    moved
  }

  // ---- reminders of events that need music (ADR 0074) -----------------------------------------------------------------
  /// A look at the events (hourly, and the window's Check now: `again`, notified even if reminded today).
  pub fn check_reminders(&self, again: bool) {
    let cfg = self.host.config();
    if cfg["glue"].as_str().is_none_or(|g| g.is_empty()) || cfg["reminders"] == false { return; }
    use crate::reminders::{day_key, message, needs_music, songs_of, week_ago};
    let now = chrono::Local::now().naive_local();
    let today = day_key(now);
    let mut done: Map<String, Value> = cfg["reminded"].as_object().cloned().unwrap_or_default();
    let (mut coming, mut sent) = (0, Vec::<String>::new());
    let dir = self.dir();
    let lib = self.describe().unwrap_or(Value::Null);
    for p in lib["profiles"].as_array().into_iter().flatten() { for c in p["collections"].as_array().into_iter().flatten() {
      let base = format!("profiles/{}/collections/{}", text(p, "id"), text(c, "id"));
      let events = read_json(&dir, &format!("{base}/events.json")).ok().flatten().unwrap_or(Value::Null);
      let soon: Vec<&Value> = events["items"].as_object().into_iter().flat_map(|m| m.values()).filter(|e| needs_music(e, 0, now)).collect();
      if soon.is_empty() { continue; }
      // Only then its playlists, to count their songs.
      let mut lists = HashMap::new();
      for f in dir.list(&format!("{base}/lists"), false).unwrap_or_default() {
        if !f.ends_with(".json") { continue; }
        if let Ok(Some(l)) = read_json(&dir, &format!("{base}/lists/{f}")) { lists.insert(text(&l, "id"), l); }
      }
      for e in soon {
        if !needs_music(e, songs_of(e, &lists), now) { continue; }
        coming += 1;
        let k = format!("{}/{}", text(c, "id"), text(e, "id"));
        if done.get(&k).and_then(|d| d.as_str()) == Some(today.as_str()) && !again { continue; }
        let (title, body) = message(e, now);
        if self.host.notify(&title, &body) { done.insert(k, json!(today)); sent.push(text(e, "name")); }
      }
    } }
    // A week of memory is enough.
    let week = week_ago(now);
    done.retain(|_, d| d.as_str().is_some_and(|d| d >= week.as_str()));
    self.host.patch_config(&|_| Some(json!({ "reminded": done })));
    self.svc.st.lock().unwrap().reminders = json!({ "at": ms(), "coming": coming, "sent": sent });
    self.report();
  }
}

const AUTO_DIR: &str = "backups/auto";
const AUTO_KEEP: usize = 14;
const HEX: &[u8] = b"0123456789abcdef";

#[cfg(test)]
mod tests {
  use super::*;
  /// A search keeps what it found anew, never a folder picked meanwhile (the lost folder, 2026-09-29; it was
  /// tests/home.test.ts).
  #[test]
  fn a_search_keeps_only_what_it_found_anew() {
    let m = |v: Value| v.as_object().cloned().unwrap();
    let before = m(json!({ "r1": "C:/old/Music", "r2": "D:/Sets" }));
    // The search found r1 where it already was, r2 moved, r3 new; meanwhile the user picked r1 again.
    let found = m(json!({ "r1": "C:/old/Music", "r2": "E:/Sets", "r3": "F:/More" }));
    let cur = m(json!({ "r1": "C:/new/Music", "r2": "D:/Sets" }));
    assert_eq!(newly_found(&before, &found, &cur), Some(m(json!({ "r1": "C:/new/Music", "r2": "E:/Sets", "r3": "F:/More" }))));
    // A folder changed meanwhile isn't touched even when the search found it elsewhere.
    assert_eq!(newly_found(&before, &m(json!({ "r2": "E:/Sets" })), &m(json!({ "r1": "C:/new/Music", "r2": "G:/Picked" }))), None);
    // Nothing new: nothing to save.
    assert_eq!(newly_found(&before, &m(json!({ "r1": "C:/old/Music" })), &before), None);
  }
}
