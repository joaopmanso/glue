//! GLUE Home analyses its computer's songs (ADR 0103; home/ui/analysis.ts, lanes.ts and speed.ts in Rust, ADR 0154),
//! like a GLUE tab does, and goes on when no tab is open.
//! - One queue: the songs asked for now first ("Analyse now", on any device), then those never analysed or whose file
//!   changed, oldest added first.
//! - Each result goes to GLUE Home's cache (`analyse.rs`).
//! - The collection's writer takes them in (one writer, ADR 0051): the engine while no GLUE tab holds the lease; else
//!   the open tab, which asks for them over the channel and says which it took (it "delegates" the analysis by asking).
//! - A tab that doesn't ask (one from before the engine) analyses by itself: the songs are left to it while it holds
//!   the lease.
//! - Paused: nothing new starts (what runs finishes); asked-for songs still are analysed.
use crate::library::{is_away, shared, Seen};
use crate::{get, text, Engine, Host};
use glue_store::dir::{read_json, Dir};
use glue_store::json::{locale_cmp, stringify};
use glue_store::project::{truthy, unknown_computer, INFO_FIELDS};
use indexmap::{IndexMap, IndexSet};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};

/// src/store/types.ts `ANALYSIS_VERSION`.
pub const ANALYSIS_VERSION: f64 = 3.0;
const PENDING: &str = "s/pending.json";
/// A collection's songs whose tags were read (None: they couldn't be), waiting to go into the library.
type Tagged = Vec<(String, Option<Value>)>;

/// What a job does (ADR 0157). Every kind takes one of the "songs at a time", and the window's meter counts it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
  /// The song analysed for the library (a device or the user may be waiting: `waiters`).
  Analyse,
  /// A new song's tags read (only its tags), so its row shows its artist and title before it's analysed.
  Tags,
  /// A shared song's mini spectrogram and waveform made for other devices, the library having its analysis (ADR 0046).
  Background,
}
/// A song to work on. `net`: its network folder (ADR 0135), if it's in one; `waiters`: told when it's done (true:
/// analysed).
#[derive(Debug, Clone)]
pub struct Job { pub p: String, pub c: String, pub id: String, pub name: String, pub net: Option<String>, added: String, pub kind: Kind, waiters: Vec<mpsc::Sender<bool>> }
impl Job {
  fn new(p: &str, c: &str, id: &str, name: &str, net: Option<String>, added: &str, kind: Kind) -> Job {
    Job { p: p.into(), c: c.into(), id: id.into(), name: name.into(), net, added: added.into(), kind, waiters: vec![] }
  }
  fn key(&self) -> String { format!("{}/{}/{}", self.p, self.c, self.id) }
}

/// One song analysed (ADR 0136): when, its size, how long reading it took, and analysing it; from a network folder.
#[derive(Debug, Clone, Copy)]
pub struct Sample { pub at: f64, pub bytes: f64, pub read_ms: f64, pub analyse_ms: f64, pub net: bool }

/// What the queue says of itself (home/ui/analysis.ts `AnalysisState`; GLUE Home's window and a tab show it).
#[derive(Debug, Clone, Default)]
pub struct State {
  pub paused: bool, pub running: u32, pub current: Vec<String>,
  pub left: usize, pub done: u32, pub failed: u32, pub waiting: usize,
  pub by: &'static str, pub why: String, pub away: u32,
  pub speed: Option<Value>, pub suggestion: String, pub steps: (i32, i32),
}
impl State {
  pub fn to_json(&self) -> Value {
    let mut v = json!({ "paused": self.paused, "running": self.running, "current": self.current, "left": self.left, "done": self.done, "failed": self.failed, "waiting": self.waiting, "by": if self.by.is_empty() { "idle" } else { self.by }, "why": self.why, "away": self.away, "steps": { "reading": self.steps.0, "analysing": self.steps.1 } });
    if let Some(s) = &self.speed { v["speed"] = s.clone(); v["suggestion"] = json!(self.suggestion); }
    v
  }
}

#[derive(Default)]
pub struct Queue {
  q: Mutex<Q>,
  /// A step change waits half a second to be said (the window's meter).
  step_soon: AtomicBool,
}
#[derive(Default)]
struct Q {
  state: State,
  /// Results not taken into their collection yet, by collection.
  pending: IndexMap<(String, String), IndexSet<String>>,
  /// Asked for now (any device, ADR 0103; a song another device waits for), then new songs' tags, then the library's
  /// songs to analyse, then the background's (ADR 0157).
  urgent: VecDeque<Job>, tags: VecDeque<Job>, queue: Vec<Job>, background: VecDeque<Job>, scanned: f64,
  delegated_until: f64, looping: bool, loaded: bool,
  /// The collections were looked through since GLUE Home started (ADR 0157: once, then each edit's songs queued as they
  /// come); `stale`: they changed around the engine (a sync, a Restart): looked through again.
  looked: bool, stale: bool,
  /// Tags read and not in the library yet, by collection (written together).
  tagged: IndexMap<(String, String), Tagged>,
  /// Devices waiting for a song that's being analysed now.
  waiters: HashMap<String, Vec<mpsc::Sender<bool>>>,
  /// Being analysed now (a look while running doesn't queue them again).
  active: HashSet<String>,
  samples: Vec<Sample>,
  /// Songs that failed this session (ran out of time or memory: tried again, ADR 0109), at most three times.
  tries: HashMap<String, u32>,
  net_running: HashMap<String, u32>,
  /// When a song was last streamed to another device (ADR 0138): the analysis eases off.
  played_at: f64,
  /// Songs whose files were restamped (their tags written) lately, `p/c/id` → (was, now): an analysis of the file as it
  /// was that lands after it is restamped too (the same audio).
  restamped: IndexMap<String, (Value, Value)>,
}

fn ms() -> f64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0) }

// ---- lanes.ts (ADR 0135) ---------------------------------------------------------------------------------------
/// A network folder: a Windows share (\\server\share) or a mounted one (//server/share).
pub fn is_network(path: Option<&str>) -> bool { path.is_some_and(|p| p.starts_with("\\\\") || p.starts_with("//")) }
/// The first job that may start now: the next in order, except a network folder's while it has `cap` running (0: no
/// limit). None when none may.
pub fn pick_next(queue: &[Job], running: &HashMap<String, u32>, cap: u32) -> Option<usize> {
  queue.iter().position(|j| match &j.net { None => true, Some(n) => cap == 0 || running.get(n).copied().unwrap_or(0) < cap })
}

// ---- speed.ts (ADR 0136) ---------------------------------------------------------------------------------------
const WINDOW: f64 = 120_000.0;
const HISTORY: f64 = 600_000.0;
const STEPS: usize = 20;
/// Songs a minute in each half minute of the last ten, oldest first.
pub fn history_of(samples: &[Sample], now: f64) -> Vec<f64> {
  let step = HISTORY / STEPS as f64;
  let mut out = vec![0.0; STEPS];
  for x in samples { let i = STEPS as f64 - 1.0 - ((now - x.at) / step).floor(); if i >= 0.0 && i < STEPS as f64 { out[i as usize] += 60_000.0 / step; } }
  out
}
pub fn speed_of(samples: &[Sample], now: f64) -> Option<Value> {
  let s: Vec<Sample> = samples.iter().filter(|x| now - x.at <= WINDOW).copied().collect();
  if s.is_empty() { return None; }
  // Over the time they cover (at least 10 s, so a first song doesn't read as hundreds a minute), at most the window.
  let first = s.iter().map(|x| x.at - x.read_ms - x.analyse_ms).fold(f64::INFINITY, f64::min);
  let span = 10_000f64.max(WINDOW.min(now - first));
  let (net, local): (Vec<Sample>, Vec<Sample>) = s.iter().partition(|x| x.net);
  let avg = |xs: &[Sample], f: &dyn Fn(&Sample) -> f64| if xs.is_empty() { 0.0 } else { xs.iter().map(f).sum::<f64>() / xs.len() as f64 };
  let mbs = |xs: &[Sample]| xs.iter().map(|x| x.bytes).sum::<f64>() / 1e6 / (span / 1000.0);
  Some(json!({
    "perMin": s.len() as f64 / (span / 60_000.0), "localMBs": mbs(&local), "netMBs": mbs(&net),
    "localReadMs": avg(&local, &|x| x.read_ms), "netReadMs": avg(&net, &|x| x.read_ms), "analyseMs": avg(&s, &|x| x.analyse_ms),
    "songs": s.len(), "netSongs": net.len(), "history": history_of(samples, now),
  }))
}
/// A suggestion from the numbers, or '' when nothing stands out. `net_cap` 0: no limit.
pub fn suggest(sp: Option<&Value>, at_once: u32, cores: u32, net_cap: u32) -> String {
  let Some(sp) = sp else { return String::new() };
  let f = |k: &str| sp[k].as_f64().unwrap_or(0.0);
  if f("songs") < 5.0 { return String::new(); }
  if f("netSongs") >= 3.0 && f("netReadMs") > 2.0 * f("analyseMs") && (net_cap == 0 || net_cap > 4) {
    return "Songs on network folders spend most of their time being read: fewer at once from each network folder (try 4) leaves places for songs on this computer’s drives.".into();
  }
  let reading = f("localReadMs").max(f("netReadMs"));
  if f("analyseMs") >= reading && at_once < cores { return format!("The processor has room: try {cores} at a time."); }
  if f("analyseMs") >= reading && at_once as f64 > cores as f64 * 1.5 { return format!("More at a time than this computer has processors ({cores}): {cores} may be as fast, and leaves the computer freer."); }
  String::new()
}

// ---- src/core/library/analysed.ts ------------------------------------------------------------------------------
/// A failure that says nothing about the song (out of time or memory, unreadable just then): tried again, never kept.
pub fn is_transient(msg: &str) -> bool {
  let m = msg.to_lowercase();
  ["took too long", "allocation failed", "out of memory", "worker stopped", "could not be read", "isn’t reachable", "notreadableerror", "read only part of"].iter().any(|x| m.contains(x))
}
/// Why GLUE Home gave up on a song after its last try (ADR 0144), in words that don't say "try again".
pub fn gave_up(why: &str) -> String {
  let w = why.to_lowercase();
  let what = if w.contains("took too long") { "it didn’t finish in time" } else if w.contains("allocation failed") || w.contains("out of memory") { "there wasn’t enough memory for it" } else if w.contains("worker stopped") { "its analysis stopped" } else { "it couldn’t be read" };
  format!("GLUE Home gave up after 3 tries: {what}. Analyse it again to retry.")
}
/// JavaScript's `a !== b` for the numbers (or null, or absent) of a song's file.
fn differ(a: Option<&Value>, b: Option<&Value>) -> bool {
  match (a, b) { (None, None) => false, (Some(Value::Null), Some(Value::Null)) => false, (Some(x), Some(y)) if x.is_number() && y.is_number() => x.as_f64() != y.as_f64(), _ => true }
}
/// Does this song need (another) analysis? (`needsAnalysis`: its state is "waiting"). `a`: its analysis on this computer.
pub fn needs_analysis(t: &Value, a: Option<&Value>) -> bool {
  if truthy(get(t, "remote")) || text(t, "status") != "linked" { return false; }
  let Some(a) = a.filter(|a| !a.is_null()) else { return true };
  if a["v"].as_f64().unwrap_or(0.0) < ANALYSIS_VERSION || differ(get(a, "fileSize"), get(t, "size")) || differ(get(a, "fileMtime"), get(t, "mtime")) { return true; }
  match a["error"].as_str().filter(|e| !e.is_empty()) { Some(e) => is_transient(e), None => false }
}
/// A song the JavaScript analysis couldn't analyse (no `engine`): tried once more by the native engine (ADR 0149).
fn failed_before(a: Option<&Value>) -> bool { a.is_some_and(|a| a["error"].as_str().is_some_and(|e| !e.is_empty()) && !truthy(get(a, "engine"))) }
/// The song after its analysis (`afterAnalysis`): the file's size, date, format and length, empty info filled from its
/// tags (never what was edited in GLUE), its cover.
pub fn after_analysis(cur: &Value, a: &Value) -> Value {
  let mut t = cur.as_object().cloned().unwrap_or_default();
  t.insert("size".into(), a["size"].clone());
  t.insert("mtime".into(), a["mtime"].clone());
  t.insert("format".into(), a.get("format").cloned().unwrap_or(Value::Null));
  let d = a.get("duration").filter(|d| d.as_f64().is_some_and(|x| x != 0.0 && !x.is_nan()));
  match d.or(cur.get("duration")) { Some(d) => { t.insert("duration".into(), d.clone()); } None => { t.shift_remove("duration"); } }
  let edited: Vec<&str> = cur["edited"].as_array().map(|e| e.iter().filter_map(|x| x.as_str()).collect()).unwrap_or_default();
  for k in INFO_FIELDS {
    let empty = t.get(k).is_none_or(|v| !truthy(Some(v)));
    if let Some(v) = a["fields"].get(k).filter(|v| truthy(Some(v))) { if empty && !edited.contains(&k) { t.insert(k.into(), v.clone()); } }
  }
  if let Some(art) = a.get("art") { t.insert("art".into(), art.clone()); }
  Value::Object(t)
}

/// Songs analysed at a time: as set in GLUE Home (Activity), else from the processors (bridge.ts `autoPool`).
pub fn pool_size(cfg: &Value) -> u32 {
  let set = cfg["analysisWorkers"].as_f64().map(|x| x.round()).filter(|x| *x > 0.0).map(|x| x as u32);
  set.unwrap_or_else(|| { let n = cores(); n.min(2).max(12.min(n.saturating_sub(4))) }).clamp(1, 32)
}
pub fn cores() -> u32 { std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(4) }

/// A song's step in the window's meter (reading, then analysing: `Some(true)`, `Some(false)`), undone however the
/// song ends (ADR 0157).
pub(crate) struct Stepping<'a, H: Host> { pub(crate) e: &'a Engine<H>, pub(crate) at: Option<bool> }
impl<H: Host> Stepping<'_, H> { pub(crate) fn to(&mut self, next: Option<bool>) { self.e.step(self.at, next); self.at = next; } }
impl<H: Host> Drop for Stepping<'_, H> { fn drop(&mut self) { if self.at.is_some() { self.e.step(self.at, None); } } }

/// One of the "songs at a time", taken by a job: counted (running, the window's list of names, its network folder's
/// turn) until it's given back, however the job ends, and those waiting for the song told (`ok`: analysed). Before, a job
/// that ended early stayed in the window's list (the user, 2026-10-06: about 30 names shown while 8 ran).
struct Slot<'a, H: Host> { e: &'a Engine<H>, key: String, name: String, net: Option<String>, waiters: Vec<mpsc::Sender<bool>>, ok: bool }
impl<'a, H: Host> Slot<'a, H> {
  fn take(e: &'a Engine<H>, j: &Job) -> Self {
    {
      let mut q = e.q();
      q.active.insert(j.key());
      if let Some(n) = &j.net { *q.net_running.entry(n.clone()).or_default() += 1; }
      q.state.running += 1; q.state.current.push(j.name.clone()); q.state.left = q.urgent.len() + q.queue.len();
    }
    e.told();
    Slot { e, key: j.key(), name: j.name.clone(), net: j.net.clone(), waiters: j.waiters.clone(), ok: false }
  }
}
impl<H: Host> Drop for Slot<'_, H> {
  fn drop(&mut self) {
    let waiting = {
      let mut q = self.e.q();
      q.active.remove(&self.key);
      if let Some(n) = &self.net { if let Some(r) = q.net_running.get_mut(n) { *r = r.saturating_sub(1); } }
      q.state.running = q.state.running.saturating_sub(1);
      if let Some(i) = q.state.current.iter().position(|n| *n == self.name) { q.state.current.remove(i); }
      q.waiters.remove(&self.key).unwrap_or_default()
    };
    for w in self.waiters.drain(..).chain(waiting) { let _ = w.send(self.ok); }
    self.e.told();
  }
}

impl<H: Host> Engine<H> {
  fn q(&self) -> std::sync::MutexGuard<'_, Q> { self.queue.q.lock().unwrap() }
  /// Said to GLUE Home (its window, a tab's status).
  fn told(&self) {
    let s = { let mut q = self.q(); q.state.waiting = q.pending.values().map(|s| s.len()).sum(); q.state.to_json() };
    self.host.analysis_changed(&s);
  }
  pub fn analysis_json(&self) -> Value { self.q().state.to_json() }
  /// The background's songs (answers.rs), queued last: those not queued already. How many.
  pub(crate) fn queue_background(&self, todo: Vec<(String, String, String, String)>) -> usize {
    let mut q = self.q();
    let have: HashSet<String> = q.background.iter().map(Job::key).collect();
    let mut n = 0;
    for (p, c, id, name) in todo {
      let j = Job::new(&p, &c, &id, &name, None, "", Kind::Background);
      if have.contains(&j.key()) { continue; }
      q.background.push_back(j);
      n += 1;
    }
    n
  }

  fn save_pending(&self) {
    let out: Vec<Value> = self.q().pending.iter().flat_map(|((p, c), ids)| ids.iter().map(move |id| json!([p, c, id]))).collect();
    let _ = self.cache_dir().write(PENDING, &stringify(&Value::Array(out)));
  }
  fn load_pending(&self) {
    if std::mem::replace(&mut self.q().loaded, true) { return; }
    if let Ok(Some(v)) = read_json(&self.cache_dir(), PENDING) {
      let mut q = self.q();
      for x in v.as_array().into_iter().flatten() { if let (Some(p), Some(c), Some(id)) = (x[0].as_str(), x[1].as_str(), x[2].as_str()) { q.pending.entry((p.into(), c.into())).or_default().insert(id.into()); } }
    }
    self.told();
  }
  fn add_pending(&self, p: &str, c: &str, id: &str) {
    self.q().pending.entry((p.into(), c.into())).or_default().insert(id.into());
    self.told();
    self.save_pending();
  }

  /// A tab holding the lease asked (it takes the results in): GLUE Home analyses for it.
  pub fn delegate(&self) { self.q().delegated_until = ms() + 30_000.0; }
  /// The results of one collection waiting to be taken in.
  pub fn waiting_in(&self, p: &str, c: &str) -> Vec<String> { self.q().pending.get(&(p.into(), c.into())).map(|s| s.iter().cloned().collect()).unwrap_or_default() }
  /// The tab took these in.
  pub fn taken(&self, p: &str, c: &str, ids: &[String]) {
    { let mut q = self.q(); let Some(s) = q.pending.get_mut(&(p.into(), c.into())) else { return }; for id in ids { s.shift_remove(id); } }
    self.told(); self.save_pending();
  }
  /// Analyse these first (any device asked).
  pub fn analyse_now(self: &std::sync::Arc<Self>, p: &str, c: &str, ids: &[String], names: &Value) {
    {
      let mut q = self.q();
      let want: HashSet<&String> = ids.iter().collect();
      let same = |j: &Job| j.p == p && j.c == c && want.contains(&j.id);
      let mut u: VecDeque<Job> = ids.iter().map(|id| {
        // One already asked for keeps who's waiting for it.
        let mut j = Job::new(p, c, id, names[id].as_str().unwrap_or(id), None, "", Kind::Analyse);
        j.waiters = q.urgent.iter().filter(|x| x.p == p && x.c == c && x.id == *id).flat_map(|x| x.waiters.clone()).collect();
        j
      }).collect();
      u.extend(q.urgent.drain(..).filter(|j| !same(j)));
      q.urgent = u;
      q.queue.retain(|j| !same(j));
      q.state.left = q.urgent.len() + q.queue.len();
    }
    self.host.event(&format!("Analysing {} song{} now, as asked", ids.len(), if ids.len() == 1 { "" } else { "s" }));
    self.told();
    self.run_analysis();
  }
  /// A song another device waits for (its full analysis, its row's pictures: answers.rs), analysed in the next free place,
  /// a song page's first: told when it's done (true: analysed). Already running: told when that one ends.
  pub fn analyse_for(self: &std::sync::Arc<Self>, p: &str, c: &str, id: &str, first: bool) -> mpsc::Receiver<bool> {
    let (tx, rx) = mpsc::channel();
    let name = self.store(p, c).ok().and_then(|s| s.lock().unwrap().tracks.get(id).map(|t| Some(text(t, "title")).filter(|x| !x.is_empty()).unwrap_or_else(|| text(t, "fileName")))).unwrap_or_else(|| id.to_string());
    {
      let mut q = self.q();
      let k = format!("{p}/{c}/{id}");
      if q.active.contains(&k) { q.waiters.entry(k).or_default().push(tx); return rx; }
      let mut j = match q.urgent.iter().position(|j| j.key() == k) { Some(i) => q.urgent.remove(i).unwrap(), None => Job::new(p, c, id, &name, None, "", Kind::Analyse) };
      j.waiters.push(tx);
      q.queue.retain(|j| j.key() != k);
      q.background.retain(|j| j.key() != k);
      if first { q.urgent.push_front(j) } else { q.urgent.push_back(j) }
      q.state.left = q.urgent.len() + q.queue.len();
    }
    self.told();
    self.run_analysis();
    rx
  }

  /// Songs an edit added or whose file changed (a tab's scan, ADR 0157): queued at once (a new one to have its tags read
  /// first), never by looking through the whole collection again. `ids`: the songs the edit named; `new`: those it added.
  pub(crate) fn queue_edit(self: &std::sync::Arc<Self>, p: &str, c: &str, ids: &[String], new: &HashSet<String>) {
    let cfg = self.host.config();
    if cfg["glue"].as_str().is_none_or(|g| g.is_empty()) { return; }
    let Ok(s) = self.store(p, c) else { return };
    let mut add: Vec<(Job, bool, bool)> = vec![];
    {
      let st = s.lock().unwrap();
      if st.shared.is_some() && unknown_computer(cfg["computer"].as_str()) { return; }
      let roots: Vec<Value> = st.meta["roots"].as_array().cloned().unwrap_or_default();
      let tag = !self.host.lease_held();
      for id in ids {
        let Some(t) = st.tracks.get(id) else { continue };
        if truthy(get(t, "remote")) || text(t, "status") != "linked" { continue; }
        if (text(t, "rootId").is_empty() || text(t, "relPath").is_empty()) && !text(t, "fileKey").starts_with("copy:") && text(t, "filePath").is_empty() { continue; }
        let a = st.analysis.get(id);
        let needs = needs_analysis(t, a) || failed_before(a);
        let tags = tag && new.contains(id);
        if !needs && !tags { continue; }
        let rid = text(t, "rootId");
        let net = cfg["folders"][&rid].as_str().map(String::from).or_else(|| roots.iter().find(|r| text(r, "id") == rid).and_then(|r| r["absPath"].as_str().map(String::from))).filter(|a| is_network(Some(a)));
        let name = Some(text(t, "title")).filter(|s| !s.is_empty()).unwrap_or_else(|| text(t, "fileName"));
        add.push((Job::new(p, c, id, &name, net, &text(t, "addedAt"), Kind::Analyse), needs, tags));
      }
    }
    if add.is_empty() { return; }
    {
      let mut q = self.q();
      let waiting: HashSet<String> = q.pending.get(&(p.into(), c.into())).map(|s| s.iter().cloned().collect()).unwrap_or_default();
      for (j, needs, tags) in add {
        let k = j.key();
        if tags && !q.tags.iter().any(|x| x.key() == k) { q.tags.push_back(Job { kind: Kind::Tags, ..j.clone() }); }
        let queued = q.active.contains(&k) || q.urgent.iter().chain(q.queue.iter()).any(|x| x.key() == k);
        if needs && !queued && !waiting.contains(&j.id) && q.tries.get(&k).copied().unwrap_or(0) < 3 { q.queue.push(j); }
      }
      q.state.left = q.urgent.len() + q.queue.len();
    }
    self.told();
    self.run_analysis();
  }
  /// The collections changed around the engine (a sync took changes in): looked through again.
  pub fn analysis_stale(self: &std::sync::Arc<Self>) { self.q().stale = true; self.run_analysis(); }
  /// Restart (the settings or the tray): songs that failed this session are tried again, everything looked for anew.
  pub fn analysis_restart(&self) { let mut q = self.q(); q.tries.clear(); q.stale = true; }
  /// Paused or not, as the settings say (`analysisPaused`); `quiet`: GLUE Home starting.
  pub fn set_paused(self: &std::sync::Arc<Self>, paused: bool, quiet: bool) {
    { let mut q = self.q(); if q.state.paused == paused { return; } q.state.paused = paused; }
    if !quiet { self.host.event(if paused { "Analysis paused" } else { "Analysis resumed" }); }
    self.told();
    if !paused && !quiet { self.run_analysis(); }
  }
  /// Another device streamed a song from here just now (ADR 0138).
  pub fn played(&self) { self.q().played_at = ms(); }

  /// This computer's songs that need an analysis, oldest added first (a result already made is waiting).
  fn scan(&self, cfg: &Value) -> Vec<Job> {
    let mut jobs = vec![];
    let computer = cfg["computer"].as_str();
    let lib = self.describe().unwrap_or(Value::Null);
    for p in lib["profiles"].as_array().into_iter().flatten() { for col in p["collections"].as_array().into_iter().flatten() {
      let (pid, cid) = (text(p, "id"), text(col, "id"));
      let base = format!("profiles/{pid}/collections/{cid}");
      let Ok(Some(meta)) = read_json(&self.dir(), &format!("{base}/collection.json")) else { continue };
      if truthy(get(&meta, "movedTo")) { continue; }
      let sh = truthy(get(&meta, "shared"));
      // A shared collection: this computer's songs, once GLUE Home knows which computer it is (ADR 0108).
      if sh && unknown_computer(computer) { continue; }
      let me = if sh { computer.unwrap_or("").to_string() } else { String::new() };
      let roots: Vec<Value> = (if sh { meta["rootsBy"][&me].as_array() } else { meta["roots"].as_array() }).cloned().unwrap_or_default();
      let seen = Seen::new(Some(meta), &pid, &cid, computer);
      let waiting: HashSet<String> = self.q().pending.get(&(pid.clone(), cid.clone())).map(|s| s.iter().cloned().collect()).unwrap_or_default();
      let tries = self.q().tries.clone();
      // Where each music folder is: a network folder's songs take turns (ADR 0135).
      let net_of = |rid: &str| -> Option<String> {
        if rid.is_empty() { return None; }
        let at = cfg["folders"][rid].as_str().map(String::from).or_else(|| roots.iter().find(|r| text(r, "id") == rid).and_then(|r| r["absPath"].as_str().map(String::from)));
        at.filter(|a| is_network(Some(a)))
      };
      // The shards there are (listed, not guessed).
      for f in self.dir().list(&format!("{base}/tracks"), false).unwrap_or_default().into_iter().filter(|n| n.ends_with(".json")) {
        let Ok(Some(tracks)) = read_json(&self.dir(), &format!("{base}/tracks/{f}")) else { continue };
        let an = read_json(&self.dir(), &format!("{base}/analysis/{f}")).ok().flatten().unwrap_or(Value::Null);
        for raw in tracks["items"].as_object().into_iter().flatten().map(|x| x.1) {
          let t = seen.track(raw);
          let id = text(&t, "id");
          if (text(&t, "rootId").is_empty() || text(&t, "relPath").is_empty()) && !text(&t, "fileKey").starts_with("copy:") && text(&t, "filePath").is_empty() { continue; }
          let mine = if sh { an["items"][&id].get(&me) } else { an["items"].get(&id) };
          if !(needs_analysis(&t, mine) || failed_before(mine)) || waiting.contains(&id) || tries.get(&format!("{pid}/{cid}/{id}")).copied().unwrap_or(0) >= 3 { continue; }
          // Analysed already (the result wasn't taken in yet, GLUE Home was restarted): waiting, not again.
          if let Some(r) = self.result(&pid, &cid, &id) {
            if !differ(get(&r, "size"), get(&t, "size")) && !differ(get(&r, "mtime"), get(&t, "mtime")) && r["summary"]["v"].as_f64().unwrap_or(0.0) >= ANALYSIS_VERSION && !failed_before(get(&r, "summary")) {
              self.q().pending.entry((pid.clone(), cid.clone())).or_default().insert(id);
              continue;
            }
          }
          let name = Some(text(&t, "title")).filter(|s| !s.is_empty()).unwrap_or_else(|| text(&t, "fileName"));
          jobs.push(Job::new(&pid, &cid, &id, &name, net_of(&text(&t, "rootId")), &text(&t, "addedAt"), Kind::Analyse));
        }
      }
    } }
    self.told(); self.save_pending();
    jobs.sort_by(|x, y| locale_cmp(&x.added, &y.added));
    jobs
  }

  /// A song's analysis result kept here (`s/…json`).
  pub fn result(&self, p: &str, c: &str, id: &str) -> Option<Value> { read_json(&self.cache_dir(), &crate::analyse::key("s", p, c, id, "json")).ok().flatten() }

  pub(crate) fn step(&self, from: Option<bool>, to: Option<bool>) {
    {
      let mut q = self.q();
      let s = &mut q.state.steps;
      if let Some(r) = from { if r { s.0 -= 1 } else { s.1 -= 1 } }
      if let Some(r) = to { if r { s.0 += 1 } else { s.1 += 1 } }
    }
    if !self.queue.step_soon.swap(true, Ordering::SeqCst) {
      let me = self.me.lock().unwrap().upgrade();
      if let Some(e) = me { std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_millis(500)); e.queue.step_soon.store(false, Ordering::SeqCst); e.told(); }); }
    }
  }

  /// A song's file was restamped: kept a while (the last 200) for an analysis of it that's running now.
  pub(crate) fn restamped(&self, p: &str, c: &str, id: &str, was: &Value, now: &Value) {
    let mut q = self.q();
    q.restamped.insert(format!("{p}/{c}/{id}"), (was.clone(), now.clone()));
    while q.restamped.len() > 200 { q.restamped.shift_remove_index(0); }
  }

  /// A song of this computer's library analysed here (ADR 0147, 0148): read, decoded and analysed natively, its parts
  /// written to the cache. Err when it couldn't be: a passing failure (unreadable now, out of time) isn't saved, a
  /// lasting one is saved as failed. `tell`: the result is for the library (false: only this cache's, filled in the
  /// background; the library has it).
  pub fn analyse_song(&self, p: &str, c: &str, id: &str, cfg: &Value, tell: bool) -> Result<(f64, f64, f64), String> {
    if [p, c, id].iter().any(|s| s.is_empty() || s.contains(['/', '\\', '.'])) { return Err("bad song".into()); }
    let f = self.track_path(p, c, id, cfg)?;
    let mut step = Stepping { e: self, at: None };
    step.to(Some(true));
    let t0 = std::time::Instant::now();
    let bytes = self.host.read_song(std::path::Path::new(&f.path), &f.name);
    let read_ms = t0.elapsed().as_millis() as f64;
    step.to(bytes.is_ok().then_some(false));
    let bytes = bytes?;
    let cache = self.cache_dir();
    let (pp, cc, ii) = (p.to_string(), c.to_string(), id.to_string());
    let (name, mtime) = (f.name.clone(), f.mtime);
    let r = crate::analyse::on_own_thread("glue-analysis", move || crate::analyse::analyse_into(bytes, &name, mtime, &|d, e| crate::analyse::key(d, &pp, &cc, &ii, e), &|rel, data| cache.write_bytes(&rel, data)));
    step.to(None);
    let r = r??;
    // Its tags were written while it was analysed: what was just made follows the file's new size and date.
    let late = self.q().restamped.get(&format!("{p}/{c}/{id}")).cloned();
    if let Some((was, now)) = late { if !differ(was.get("mtime"), Some(&json!(f.mtime))) { self.restamp(p, c, id, &was, &now); } }
    if tell { self.add_pending(p, c, id); }
    if let Some(m) = r["failed"].as_str() { return Err(m.to_string()); }
    self.host.made(p, c, id);
    self.room_made(p, c, id);
    Ok((r["bytes"].as_f64().unwrap_or(0.0), read_ms, r["analyseMs"].as_f64().unwrap_or(0.0)))
  }

  /// A song given up on (ADR 0144), saved as failed: tried again when asked, or when its file changes.
  fn give_up(&self, p: &str, c: &str, id: &str, cfg: &Value, why: &str) -> Result<(), String> {
    let f = self.track_path(p, c, id, cfg)?;
    let size = std::fs::metadata(&f.path).map_err(|e| e.to_string())?.len() as f64;
    let s = glue_audio::out::summary::failed(&gave_up(why), size, f.mtime, crate::analyse::now_iso());
    self.cache_dir().write_bytes(&crate::analyse::key("s", p, c, id, "json"), &serde_json::to_vec(&glue_audio::out::files::analysed_failed(&s, size, f.mtime)).unwrap_or_default())?;
    self.add_pending(p, c, id);
    Ok(())
  }

  /// Analyse what's to analyse, several songs at a time; take the results in when GLUE Home is the writer. One run at
  /// a time (a call while one runs does nothing; the run looks again for songs added meanwhile).
  pub fn run_analysis(self: &std::sync::Arc<Self>) {
    { let mut q = self.q(); if q.looping { return; } q.looping = true; }
    let e = self.clone();
    std::thread::spawn(move || e.run_loop());
  }
  fn run_loop(self: &std::sync::Arc<Self>) {
    self.load_pending();
    let (done0, failed0) = { let q = self.q(); (q.state.done, q.state.failed) };
    let c0 = self.host.config();
    if c0["glue"].as_str().is_some_and(|g| !g.is_empty()) {
      // The collections looked through once since GLUE Home started, and again when they changed around the engine;
      // otherwise each edit's songs are queued as they come (queue_edit, ADR 0157).
      let rescan = { let q = self.q(); q.stale || !q.looked };
      if rescan {
        // Songs whose folder isn't reachable are counted again by this look (a run that doesn't look leaves them waiting).
        { let mut q = self.q(); q.stale = false; q.looked = true; q.scanned = ms(); q.state.away = 0; }
        let found = self.scan(&c0);
        let mut q = self.q();
        let have: HashSet<String> = q.queue.iter().chain(q.urgent.iter()).map(Job::key).chain(q.active.iter().cloned()).collect();
        q.queue.extend(found.into_iter().filter(|j| !have.contains(&j.key())));
      }
      let left = { let mut q = self.q(); q.state.left = q.urgent.len() + q.queue.len(); q.state.left };
      if left > 0 { self.host.event(&format!("Analysing {left} song{}", if left == 1 { "" } else { "s" })); }
      self.workers();
      let c1 = self.host.config();
      let _ = self.write_results(&c1);
      let (done, failed, left) = { let q = self.q(); (q.state.done - done0, q.state.failed - failed0, q.state.left) };
      if left == 0 && (done > 0 || failed > 0) { self.host.event(&format!("Analysis done: {done} song{}{}", if done == 1 { "" } else { "s" }, if failed > 0 { format!(", {failed} couldn’t be read") } else { String::new() })); }
    }
    {
      let mut q = self.q();
      q.looping = false; q.state.running = 0; q.state.current.clear(); q.state.left = q.urgent.len() + q.queue.len();
      if q.state.by != "tab-self" { q.state.by = "idle"; }
    }
    self.told();
  }

  /// The next song to analyse, or None (nothing left, paused, stopped, a tab analysing by itself, a song playing, or
  /// only network songs whose folder is at its limit).
  fn next(&self) -> Option<Job> {
    if let Some(j) = self.q().urgent.pop_front() { return Some(j); }
    let c = self.host.config();
    // Songs added while this runs: into the queue (those running or queued already aren't twice).
    if std::mem::replace(&mut self.q().stale, false) {
      { let mut q = self.q(); q.scanned = ms(); q.state.away = 0; }
      let found = self.scan(&c);
      let mut q = self.q();
      let have: HashSet<String> = q.queue.iter().map(|j| format!("{}/{}/{}", j.p, j.c, j.id)).chain(q.active.iter().cloned()).collect();
      q.queue.extend(found.into_iter().filter(|j| !have.contains(&format!("{}/{}/{}", j.p, j.c, j.id))));
      q.state.left = q.urgent.len() + q.queue.len();
    }
    // Stopped (GLUE Home's Stop) or paused: nothing new starts; what runs finishes.
    if { let q = self.q(); q.state.paused || (q.tags.is_empty() && q.queue.is_empty() && q.background.is_empty()) } || c["running"] == Value::Bool(false) { return None; }
    // A tab here analysing by itself (it holds the lease and doesn't ask): the songs are its.
    if self.host.lease_held() && ms() > self.q().delegated_until { self.q().state.by = "tab-self"; return None; }
    // A song being played here or on another device goes first: no new song beyond 2 while one was read in the last
    // 10 s (ADR 0138).
    let played = self.q().played_at.max(self.host.foreground_at());
    let mut q = self.q();
    if q.state.running >= 2 && ms() - played < 10_000.0 { return None; }
    // New songs' tags first (a read of their tags only), so their rows show who and what (ADR 0157).
    if let Some(j) = q.tags.pop_front() { return Some(j); }
    // In order, but a network folder's songs take turns (ADR 0135).
    let cap = c["networkAtOnce"].as_f64().map(|x| x.round().max(0.0) as u32).unwrap_or(0);
    if let Some(i) = pick_next(&q.queue, &q.net_running, cap) { return Some(q.queue.remove(i)); }
    // Nothing of the library's left: the background's, for other devices.
    if q.queue.is_empty() { return q.background.pop_front(); }
    None
  }

  /// As many songs at a time as the settings say (changed while it runs too): a worker takes songs until there are
  /// none it may start; one finishing a song tops the workers up again.
  fn workers(self: &std::sync::Arc<Self>) {
    let (tx, rx) = mpsc::channel::<bool>();
    let since_write = Mutex::new(0u32);
    std::thread::scope(|s| {
      let mut live = 0u32;
      let top_up = |live: &mut u32| {
        while *live < pool_size(&self.host.config()) {
          *live += 1;
          let (tx, me, sw) = (tx.clone(), self.clone(), &since_write);
          let spawned = std::thread::Builder::new().name("glue-queue".into()).spawn_scoped(s, move || {
            let mut first = true;
            loop {
              if !first && self_over(&me) { break; }
              first = false;
              let Some(j) = me.next() else { break };
              me.one(&j);
              let write = { let mut n = sw.lock().unwrap(); *n += 1; if *n >= 25 { *n = 0; true } else { false } };
              if write { let _ = me.write_results(&me.host.config()); }
              let _ = tx.send(true);
            }
            let _ = tx.send(false);
          });
          if spawned.is_err() { *live -= 1; break; }
        }
      };
      top_up(&mut live);
      while live > 0 {
        match rx.recv() { Ok(true) => top_up(&mut live), Ok(false) => live -= 1, Err(_) => break }
      }
    });
    // A worker beyond the settings' number stops after its song.
    fn self_over<H: Host>(e: &std::sync::Arc<Engine<H>>) -> bool { let n = pool_size(&e.host.config()); e.q().state.running >= n }
  }

  /// One job in one of the places, counted. Its place is given back however the job ends (`Slot`).
  fn one(&self, j: &Job) {
    let jk = j.key();
    let mut slot = Slot::take(self, j);
    let c = self.host.config();
    match j.kind {
      Kind::Tags => { self.tags_one(j, &c); return; }
      Kind::Background => { self.background_one(&j.p, &j.c, &j.id, &c); return; }
      Kind::Analyse => {}
    }
    match self.analyse_song(&j.p, &j.c, &j.id, &c, true) {
      Ok((bytes, read_ms, analyse_ms)) => {
        slot.ok = true;
        let now = ms();
        let mut q = self.q();
        q.state.done += 1;
        q.samples.push(Sample { at: now, bytes, read_ms, analyse_ms, net: j.net.is_some() });
        q.samples.retain(|x| now - x.at <= 600_000.0);   // the chart's ten minutes
        q.state.speed = speed_of(&q.samples, now);
        let cap = c["networkAtOnce"].as_f64().map(|x| x.round() as u32).unwrap_or(0);
        q.state.suggestion = suggest(q.state.speed.as_ref(), pool_size(&c), cores(), cap);
      }
      Err(e) => {
        // Its folder isn't reachable (a network folder not connected): left for a later look, not a failure.
        if is_away(&e) { self.q().state.away += 1; }
        else {
          let n = { let mut q = self.q(); q.state.failed += 1; let n = q.tries.entry(jk.clone()).or_default(); *n += 1; *n };
          eprintln!("GLUE Home: couldn’t analyse {}: {e}", j.name);
          // The last try: saved as failed, with why, so it isn't "waiting" for ever in every GLUE (ADR 0144).
          if n >= 3 { if let Err(x) = self.give_up(&j.p, &j.c, &j.id, &c, &e) { eprintln!("GLUE Home: couldn’t save that it gave up on {}: {x}", j.name); } }
        }
      }
    }
  }

  /// A new song's tags read (only them), its place in the meter while it reads; written into the library with the
  /// others read meanwhile.
  fn tags_one(&self, j: &Job, cfg: &Value) {
    let Ok(f) = self.track_path(&j.p, &j.c, &j.id, cfg) else { return };
    let info = { let mut step = Stepping { e: self, at: None }; step.to(Some(true)); crate::tags::read_info(std::path::Path::new(&f.path)) };
    let flush = {
      let mut q = self.q();
      let list = q.tagged.entry((j.p.clone(), j.c.clone())).or_default();
      list.push((j.id.clone(), info));
      let n = list.len();
      n >= 50 || q.tags.is_empty()
    };
    if flush { self.flush_tags(); }
  }
  /// The tags read, into their songs (only empty fields not edited in GLUE, then the file's name for a song without a
  /// title), and the tabs told. A tab that writes the library itself (it holds the lease) read its own.
  fn flush_tags(&self) {
    let all: Vec<((String, String), Tagged)> = self.q().tagged.drain(..).collect();
    if self.host.lease_held() { return; }
    for ((p, c), got) in all {
      let Ok(s) = self.store(&p, &c) else { continue };
      let paths = {
        let mut st = s.lock().unwrap();
        let ts: Vec<Value> = got.iter().filter_map(|(id, info)| { let cur = st.tracks.get(id)?; let next = crate::tags::with_tags(cur, info.as_ref()); (next != *cur).then_some(next) }).collect();
        if ts.is_empty() { continue; }
        st.apply(&json!({ "m": "tracks", "ts": ts }));
        match self.flush(&mut st, &p, &c) { Ok(x) => x, Err(_) => continue }
      };
      self.changed(&p, &c, &paths, &[]);
      self.host.edited(&p, &c, &paths);
    }
  }

  /// The results into their collections, when no tab holds the lease (it takes them in itself).
  pub fn write_results(&self, cfg: &Value) -> Result<usize, String> {
    let count: usize = self.q().pending.values().map(|s| s.len()).sum();
    if count == 0 || cfg["glue"].as_str().is_none_or(|g| g.is_empty()) { self.q().state.why.clear(); return Ok(0); }
    if cfg["running"] == Value::Bool(false) { self.q().state.why = "GLUE Home is stopped".into(); return Ok(0); }
    if self.host.lease_held() {
      let mut q = self.q();
      q.state.by = if ms() < q.delegated_until { "tab" } else { "tab-self" };
      // A GLUE tab that writes the library itself and doesn't ask (one from before GLUE Home's engine): they wait.
      q.state.why = if q.state.by == "tab" { String::new() } else { "a GLUE tab open on this computer writes the library itself; reload it, or close it".into() };
      return Ok(0);
    }
    self.q().state.by = "home";
    let r = self.write_all();
    if let Err(e) = &r { self.q().state.why = format!("couldn’t put them in: {e}"); self.told(); }
    r
  }
  fn write_all(&self) -> Result<usize, String> {
    self.q().state.why.clear();
    let mut n = 0;
    let all: Vec<((String, String), Vec<String>)> = self.q().pending.iter().map(|(k, s)| (k.clone(), s.iter().cloned().collect())).collect();
    for ((p, c), ids) in all {
      if ids.is_empty() { continue; }
      if !matches!(read_json(&self.dir(), &format!("profiles/{p}/collections/{c}/collection.json")), Ok(Some(_))) { self.q().pending.shift_remove(&(p, c)); continue; }
      let s = self.store(&p, &c)?;
      let (mut ops, mut done, mut here) = (vec![], vec![], 0);
      {
        let st = s.lock().unwrap();
        for id in &ids {
          let Some(a) = self.result(&p, &c, id) else { done.push(id.clone()); continue };
          done.push(id.clone());
          let Some(cur) = st.tracks.get(id) else { continue };
          if truthy(get(cur, "remote")) { continue; }
          // Of the file as the library's record had it when it started (the date comes from the record, the size from
          // the bytes read): a record that moved on meanwhile is never put back; the song is analysed again.
          if get(cur, "mtime").is_some_and(|v| v.is_number()) && differ(get(cur, "mtime"), get(&a, "mtime")) { continue; }
          // The library has this already (the same file, as new an analysis): nothing to write, or to sync.
          if let Some(had) = st.analysis.get(id) {
            if !truthy(get(had, "error")) && had["v"].as_f64().unwrap_or(0.0) >= a["summary"]["v"].as_f64().unwrap_or(0.0) && !differ(get(had, "fileSize"), get(&a, "size")) && !differ(get(had, "fileMtime"), get(&a, "mtime")) { continue; }
          }
          ops.push(json!({ "m": "analysis", "id": id, "a": a["summary"] }));
          ops.push(json!({ "m": "tracks", "ts": [after_analysis(cur, &a)] }));
          here += 1;
        }
      }
      if self.host.lease_held() { return Ok(0); }   // a tab opened meanwhile: it's the writer now (these wait)
      let mut paths = vec![];
      if !ops.is_empty() { let mut st = s.lock().unwrap(); for op in &ops { st.apply(op); } paths = self.flush(&mut st, &p, &c)?; }
      // A GLUE tab takes their mini spectrograms and details from the cache.
      self.changed(&p, &c, &[], &done);
      if here > 0 { self.host.edited(&p, &c, &paths); }
      n += here;
      if let Some(s) = self.q().pending.get_mut(&(p.clone(), c.clone())) { for id in &done { s.shift_remove(id); } }
    }
    self.told(); self.save_pending();
    if n > 0 { self.host.event(&format!("Put {n} analys{} into the library", if n == 1 { "is" } else { "es" })); }
    Ok(n)
  }

  /// The channel's ask from a GLUE tab (service.ts's `analysis` request): it takes the results in (`take`), pauses,
  /// asks for songs now, says which it took; the state and this collection's results waiting.
  pub fn analysis_ask(self: &std::sync::Arc<Self>, m: &Value) -> Value {
    let (p, c) = (text(m, "p"), text(m, "c"));
    if truthy(get(m, "take")) { self.delegate(); }
    if let Some(on) = m["pause"].as_bool() { self.pause(on); }
    let ids = |k: &str| -> Vec<String> { m[k].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default() };
    if !ids("now").is_empty() { self.analyse_now(&p, &c, &ids("now"), &m["names"]); }
    if !ids("taken").is_empty() { self.taken(&p, &c, &ids("taken")); }
    self.run_analysis();
    let mut w = self.waiting_in(&p, &c);
    w.truncate(200);
    json!({ "state": self.analysis_json(), "waiting": w })
  }
  /// Paused from a GLUE tab: kept in the settings, like a pause there (the settings window shows it).
  pub fn pause(self: &std::sync::Arc<Self>, on: bool) {
    if self.host.config()["analysisPaused"].as_bool().unwrap_or(false) != on { self.host.patch_config(&move |_| Some(json!({ "analysisPaused": on }))); }
    self.set_paused(on, false);
  }
}

/// Is a collection's song shared from here (for the background thumbs, the verify)?
pub fn serves(cfg: &Value, p: &str, c: &str) -> bool { shared(cfg, p, c) }

#[cfg(test)]
mod tests {
  use super::*;
  // Which song GLUE Home analyses next (ADR 0135): a network folder's songs take turns (the user's NAS: 12 MB/s for
  // one file, 24 MB/s for eight, 2026-10-01). Moved from tests/lanes.test.ts.
  const NAS: &str = r"\\homenas\Music HR";
  fn jobs(nets: &[Option<&str>]) -> Vec<Job> { nets.iter().map(|n| Job::new("p", "c", "x", "x", n.map(String::from), "", Kind::Analyse)).collect() }
  #[test]
  fn network_folders_take_turns() {
    assert!(is_network(Some(NAS)) && is_network(Some("//homenas/music")));
    assert!(!is_network(Some(r"F:\Music")) && !is_network(Some("/Users/dj/Music")) && !is_network(None));
    let r = |n: u32| HashMap::from([(NAS.to_string(), n)]);
    assert_eq!(pick_next(&jobs(&[Some(NAS), None]), &HashMap::new(), 4), Some(0));
    assert_eq!(pick_next(&jobs(&[Some(NAS), None]), &r(3), 4), Some(0));
    assert_eq!(pick_next(&jobs(&[Some(NAS), Some(NAS), None]), &r(4), 4), Some(2));
    assert_eq!(pick_next(&jobs(&[Some(NAS), None]), &r(99), 0), Some(0), "no limit: in order");
    assert_eq!(pick_next(&jobs(&[Some(NAS)]), &r(4), 4), None);
    assert_eq!(pick_next(&[], &HashMap::new(), 4), None);
    assert_eq!(pick_next(&jobs(&[Some(NAS), Some(r"\\homenas\SACD")]), &r(4), 4), Some(1), "each network folder its own turns");
  }
  // GLUE Home's speed and its suggestion (ADR 0136). Moved from tests/speed.test.ts.
  fn at(n: f64) -> Sample { Sample { at: 100_000.0 + n * 1000.0, bytes: 50e6, read_ms: 400.0, analyse_ms: 800.0, net: false } }
  #[test]
  fn how_fast_and_what_to_try() {
    let mut s: Vec<Sample> = (0..6).map(|i| at(i as f64)).collect();
    s.extend((0..4).map(|i| Sample { net: true, read_ms: 5000.0, ..at(6.0 + i as f64) }));
    let sp = speed_of(&s, 110_000.0).unwrap();
    assert_eq!((sp["songs"].as_u64(), sp["netSongs"].as_u64()), (Some(10), Some(4)));
    assert!(sp["perMin"].as_f64().unwrap() > 30.0 && sp["netMBs"].as_f64().unwrap() > 0.0);
    assert_eq!((sp["netReadMs"].as_f64(), sp["localReadMs"].as_f64()), (Some(5000.0), Some(400.0)));
    assert!(speed_of(&s, 110_000.0 + 10.0 * 60_000.0).is_none(), "nothing in the last two minutes");
    let net: Vec<Sample> = (0..6).map(|i| Sample { net: true, read_ms: 6000.0, ..at(i as f64) }).collect();
    assert!(suggest(speed_of(&net, 110_000.0).as_ref(), 24, 16, 0).contains("network folders"));
    assert_eq!(suggest(speed_of(&net, 110_000.0).as_ref(), 24, 16, 4), "", "already few");
    let local: Vec<Sample> = (0..6).map(|i| at(i as f64)).collect();
    let sp = speed_of(&local, 110_000.0);
    assert!(suggest(sp.as_ref(), 4, 16, 0).contains("try 16 at a time"));
    assert!(suggest(sp.as_ref(), 32, 16, 0).contains("16 may be as fast"));
    assert_eq!(suggest(sp.as_ref(), 16, 16, 0), "");
    assert_eq!(suggest(speed_of(&local[..3], 110_000.0).as_ref(), 4, 16, 0), "", "too few to say");
    let now = 1_000_000.0;
    let h = history_of(&[Sample { at: now - 1000.0, ..at(0.0) }, Sample { at: now - 2000.0, ..at(0.0) }, Sample { at: now - 9.5 * 60_000.0, ..at(0.0) }, Sample { at: now - 11.0 * 60_000.0, ..at(0.0) }], now);
    assert_eq!((h.len(), h[19], h[0], h.iter().sum::<f64>()), (20, 4.0, 2.0, 6.0));
  }
  #[test]
  fn the_next_song_and_the_speed() {
    let j = |net: Option<&str>| Job::new("p", "c", "x", "x", net.map(String::from), "", Kind::Analyse);
    let q = vec![j(Some("\\\\nas\\a")), j(None)];
    let mut running = HashMap::new();
    assert_eq!(pick_next(&q, &running, 0), Some(0));
    running.insert("\\\\nas\\a".to_string(), 4);
    assert_eq!(pick_next(&q, &running, 4), Some(1));
    assert_eq!(pick_next(&q[..1], &running, 4), None);
    assert!(is_network(Some("//nas/music")) && !is_network(Some("C:\\Music")));
    let s: Vec<Sample> = (0..6).map(|i| Sample { at: 100_000.0 + i as f64 * 1000.0, bytes: 1e6, read_ms: 100.0, analyse_ms: 900.0, net: false }).collect();
    let sp = speed_of(&s, 106_000.0).unwrap();
    assert_eq!(sp["songs"], json!(6));
    assert_eq!(suggest(Some(&sp), 2, 8, 0), "The processor has room: try 8 at a time.");
    assert_eq!(gave_up("It took too long"), "GLUE Home gave up after 3 tries: it didn’t finish in time. Analyse it again to retry.");
  }
  #[test]
  fn what_needs_an_analysis() {
    let t = json!({ "status": "linked", "size": 10, "mtime": 5 });
    assert!(needs_analysis(&t, None));
    assert!(!needs_analysis(&t, Some(&json!({ "v": 3, "fileSize": 10, "fileMtime": 5 }))));
    assert!(needs_analysis(&t, Some(&json!({ "v": 3, "fileSize": 11, "fileMtime": 5 }))));
    assert!(needs_analysis(&t, Some(&json!({ "v": 3, "fileSize": 10, "fileMtime": 5, "error": "It took too long" }))));
    assert!(!needs_analysis(&t, Some(&json!({ "v": 3, "fileSize": 10, "fileMtime": 5, "error": "It couldn’t be decoded." }))));
    assert!(!needs_analysis(&json!({ "status": "linked", "remote": true }), None));
    let after = after_analysis(&json!({ "id": "a", "title": "", "artist": "Kept", "edited": ["album"], "duration": 3 }), &json!({ "size": 9, "mtime": 8, "format": null, "duration": 0, "fields": { "title": "T", "artist": "X", "album": "No" } }));
    assert_eq!(stringify(&after), r#"{"id":"a","title":"T","artist":"Kept","edited":["album"],"duration":3,"size":9,"mtime":8,"format":null}"#);
  }
}
