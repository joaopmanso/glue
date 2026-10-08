//! src/store/collection.ts: one collection's files in memory: songs and analyses in shards (by the id's first two
//! characters), playlists and DJ libraries one file each, events in one file; changes mark files to write, and `flush`
//! writes them. A shared collection (ADR 0094) is kept as the files hold it and seen as this computer.
use crate::dir::{read_json, write_json, Dir, ReadError};
use crate::json::{js_keys, Obj};
use crate::project::{self, analysis_here, analysis_shared, collection_here, collection_shared, me_for, to_local, to_shared, truthy, unknown_computer, writes_for, Here};
use crate::repair::{fold_computer, needs_fold, Counts, FoldInput};
use indexmap::{IndexMap, IndexSet};
use serde_json::{json, Value};

/// `SCHEMA` (src/store/types.ts).
pub const SCHEMA: f64 = 1.0;
pub fn shard_of(id: &str) -> String { id.chars().take(2).collect() }

/// `migrate`: no steps yet; a file without `schemaVersion` gets it (as the last key, as JavaScript adds it).
pub fn migrate(mut data: Value) -> Result<Value, String> {
  let v = data.get("schemaVersion").and_then(|v| v.as_f64()).unwrap_or(0.0);
  if v > SCHEMA { return Err("This GLUE folder was written by a newer version of GLUE. Update the page (reload) and try again.".into()); }
  if v < SCHEMA { if let Some(o) = data.as_object_mut() { o.insert("schemaVersion".into(), json!(SCHEMA)); } }
  Ok(data)
}

/// A change, as a GLUE tab sends it to GLUE Home's engine (`StoreOp`): `{ m: 'tracks', ts: [...] }`…
pub type Op = Value;

/// What a shared collection keeps (`SharedMode`).
#[derive(Debug, Clone)]
pub struct Shared { pub here: Here, pub own: bool, pub shown_only: bool, pub member: Value, pub meta: Value, pub tracks: IndexMap<String, Value>, pub analysis: IndexMap<String, Value> }

/// What `write_unwritten` did: songs written, failed (and why the last did), music folders not reachable.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Unwritten { pub written: u32, pub failed: u32, pub why: String, pub away: Vec<String> }
/// Writes a song's tags into its file: its new size and date.
pub type WriteTags<'a> = dyn FnMut(&Value, &Obj) -> Result<(f64, f64), String> + 'a;
/// Follows a file's new size and date (the song, what it was, what it is now) in GLUE Home's cache.
pub type Restamp<'a> = dyn FnMut(&Value, (Value, Value), (f64, f64)) + 'a;

/// A number as JSON keeps it: a whole one as an integer (JavaScript's numbers are all doubles; this is how they read).
pub fn num(x: f64) -> Value { if x.fract() == 0.0 && x.abs() < 9.0e15 { json!(x as i64) } else { json!(x) } }
/// JavaScript's `===` between a value and a number or null (absent is undefined: equal to nothing here).
pub fn same_num(a: Option<&Value>, b: &Value) -> bool {
  match (a, b) { (Some(Value::Number(x)), Value::Number(y)) => x.as_f64() == y.as_f64(), (Some(Value::Null), Value::Null) => true, (Some(x), y) => x == y, (None, _) => false }
}

/// `LoadOpts`.
#[derive(Debug, Clone, Default)]
pub struct LoadOpts { pub me: Option<String>, pub name: Option<String>, pub shown_only: bool }

/// The time, for the bin's names: ms since 1970 and its ISO form (`Date.now()`, `toISOString()`).
pub type Clock = Box<dyn Fn() -> (i64, String) + Send + Sync>;
/// Where new ids come from (`newId`): random, or given in order by a test.
pub type Ids = Box<dyn FnMut() -> String + Send + Sync>;

/// `newId`: a random UUID's first 16 hex digits (its 13th says version 4).
pub fn random_id() -> String {
  let mut b = [0u8; 8];
  getrandom::fill(&mut b).expect("no randomness");
  let mut s: String = b.iter().map(|x| format!("{x:02x}")).collect();
  s.replace_range(12..13, "4");
  s
}

struct BinEntry { name: String, deleted_at: String, lists: Vec<Value> }

/** A store opened as this computer's own whose collection became shared since (`flush`): opened again. */
pub const OUTDATED: &str = "OUTDATED: this collection became shared meanwhile";

pub struct Store<D: Dir> {
  pub root: D,
  pub base: String,
  pub meta: Value,
  pub tracks: IndexMap<String, Value>,
  pub analysis: IndexMap<String, Value>,
  pub lists: IndexMap<String, Value>,
  pub sources: IndexMap<String, Value>,
  pub events: IndexMap<String, Value>,
  pub damaged: Vec<String>,
  pub shared: Option<Shared>,
  dirty: IndexSet<String>,
  deleted: IndexSet<String>,
  binned: Vec<BinEntry>,
  clock: Clock,
  ids: Ids,
}

fn get<'a>(o: &'a Value, k: &str) -> Option<&'a Value> { o.as_object().and_then(|o| o.get(k)) }
fn id_of(v: &Value) -> String { get(v, "id").map(project::str_of).unwrap_or_default() }

impl<D: Dir> Store<D> {
  /// `CollectionStore.load`.
  pub fn load(root: D, pid: &str, cid: &str, opts: LoadOpts, clock: Clock) -> Result<Self, String> {
    let base = format!("profiles/{pid}/collections/{cid}");
    let raw = match read_json(&root, &format!("{base}/collection.json")) { Ok(Some(v)) => v, Ok(None) => return Err("Collection not found in your GLUE folder.".into()), Err(ReadError::Damaged(_)) => return Err(format!("Damaged file in your GLUE folder: {base}/collection.json")), Err(ReadError::Io(e)) => return Err(e) };
    // A shared collection: seen as this computer, its parts written only when it's known and this is its folder.
    let mut shared = None;
    if truthy(get(&raw, "shared")) {
      let members = get(&raw, "members").and_then(|m| m.as_object()).cloned().unwrap_or_default();
      let me = opts.me.clone().filter(|m| !unknown_computer(Some(m))).or_else(|| me_for(Some(&members), pid, None)).unwrap_or_default();
      let own = !opts.shown_only && writes_for(Some(&members), Some(&me), pid);
      let name = opts.name.clone().map(Value::String).or_else(|| members.get(&me).and_then(|m| get(m, "name")).filter(|v| !v.is_null()).cloned()).unwrap_or(json!("This computer"));
      shared = Some(Shared {
        here: Here { me: me.clone(), collection: cid.to_string(), members, roots_by: get(&raw, "rootsBy").and_then(|r| r.as_object()).cloned() },
        own, shown_only: opts.shown_only, member: json!({ "profile": pid, "name": name }), meta: raw.clone(), tracks: IndexMap::new(), analysis: IndexMap::new(),
      });
    }
    let meta = migrate(match &shared { Some(m) => collection_here(&raw, &m.here.me), None => raw.clone() })?;
    let mut s = Store { root, base, meta, tracks: IndexMap::new(), analysis: IndexMap::new(), lists: IndexMap::new(), sources: IndexMap::new(), events: IndexMap::new(),
      damaged: vec![], shared, dirty: IndexSet::new(), deleted: IndexSet::new(), binned: vec![], clock, ids: Box::new(random_id) };
    // The songs and analyses taken after the sources: a song's computer (`with_copies`).
    let mut shards: Vec<(&str, Value)> = vec![];
    for dir in ["tracks", "analysis", "lists", "sources"] {
      let names: Vec<String> = s.root.list(&format!("{}/{dir}", s.base), false)?.into_iter().filter(|n| n.ends_with(".json")).collect();
      for n in names {
        let Some(v) = s.read(&format!("{}/{dir}/{n}", s.base))? else { continue };
        let v = migrate(v)?;
        match dir {
          "tracks" | "analysis" => shards.push((dir, v)),
          "lists" => { s.lists.insert(id_of(&v), v); }
          _ => { s.sources.insert(id_of(&v), v); }
        }
      }
    }
    for (dir, v) in shards { if dir == "tracks" { s.take_tracks(&v) } else { s.take_analysis(&v) } }
    if let Some(ev) = s.read(&format!("{}/events.json", s.base))? {
      if let Some(items) = get(&ev, "items").and_then(|i| i.as_object()) { for k in js_keys(items) { s.events.insert(k.clone(), items[k].clone()); } }
    }
    // Opened on a computer that isn't a member yet (it just joined): it becomes one on the next save.
    if let Some(m) = &s.shared {
      if m.own && opts.me.as_deref().is_some_and(|x| !x.is_empty()) && !truthy(get(&m.meta, "members").and_then(|mm| get(mm, &m.here.me))) { s.save_meta(); }
    }
    Ok(s)
  }

  /// One unreadable file must not lock the user out of the rest: a copy aside (`.damaged`), and on.
  fn read(&mut self, path: &str) -> Result<Option<Value>, String> {
    match read_json(&self.root, path) {
      Ok(v) => Ok(v),
      Err(ReadError::Damaged(text)) => {
        self.damaged.push(path[self.base.len() + 1..].to_string());
        self.root.write(&format!("{}.damaged", path.strip_suffix(".json").unwrap_or(path)), &text)?;
        Ok(None)
      }
      Err(ReadError::Io(e)) => Err(e),
    }
  }

  fn take_tracks(&mut self, shard: &Value) {
    let Some(items) = get(shard, "items").and_then(|i| i.as_object()) else { return };
    for id in js_keys(items) {
      let v = &items[id];
      match &mut self.shared {
        Some(m) => {
          // A record without its copies, put right (ADR 0161; saved so when its computer is known, for the other devices).
          let fixed = project::with_copies(v, &m.meta, self.sources.values());
          let st = fixed.clone().unwrap_or_else(|| v.clone());
          m.tracks.insert(id.clone(), st.clone());
          let l = to_local(&st, &m.here);
          self.tracks.insert(id.clone(), l);
          if fixed.as_ref().and_then(|f| f.get("copies")).and_then(|c| c.as_object()).is_some_and(|c| !c.is_empty()) { self.mark(format!("tracks/{}.json", shard_of(id))); }
        }
        None => { self.tracks.insert(id.clone(), v.clone()); }
      }
    }
  }
  fn take_analysis(&mut self, shard: &Value) {
    let Some(items) = get(shard, "items").and_then(|i| i.as_object()) else { return };
    for id in js_keys(items) {
      let v = &items[id];
      match &mut self.shared {
        Some(m) => { m.analysis.insert(id.clone(), v.clone()); if let Some(a) = analysis_here(Some(v), &m.here.me) { self.analysis.insert(id.clone(), a); } }
        None => { self.analysis.insert(id.clone(), v.clone()); }
      }
    }
  }

  /// `reloadFiles`: a sync changed these files; read them again, marking nothing to save.
  pub fn reload_files(&mut self, paths: &[String]) -> Result<(), String> {
    for p in paths {
      let v = read_json(&self.root, &format!("{}/{p}", self.base)).ok().flatten();
      let (dir, file) = p.split_once('/').unwrap_or((p.as_str(), ""));
      if p == "collection.json" {
        let Some(v) = v else { continue };
        if let Some(m) = &mut self.shared {
          m.meta = v.clone();
          m.here.members = get(&v, "members").and_then(|x| x.as_object()).cloned().unwrap_or_default();
          m.here.roots_by = get(&v, "rootsBy").and_then(|x| x.as_object()).cloned();
          if !m.shown_only { m.own = writes_for(get(&m.meta, "members").and_then(|x| x.as_object()), Some(&m.here.me), get(&m.member, "profile").and_then(|x| x.as_str()).unwrap_or("")); }
          self.meta = migrate(collection_here(&v, &m.here.me))?;
        } else { self.meta = migrate(v)?; }
      } else if p == "events.json" {
        self.events.clear();
        if let Some(items) = v.as_ref().and_then(|v| get(v, "items")).and_then(|i| i.as_object()) { for k in js_keys(items) { self.events.insert(k.clone(), items[k].clone()); } }
      } else if dir == "tracks" || dir == "analysis" {
        let key = file.strip_suffix(".json").unwrap_or(file).to_string();
        let ids: Vec<String> = if dir == "tracks" { self.tracks.keys() } else { self.analysis.keys() }.filter(|id| shard_of(id) == key).cloned().collect();
        for id in ids {
          if dir == "tracks" { self.tracks.shift_remove(&id); if let Some(m) = &mut self.shared { m.tracks.shift_remove(&id); } }
          else { self.analysis.shift_remove(&id); if let Some(m) = &mut self.shared { m.analysis.shift_remove(&id); } }
        }
        let sh = match v { Some(v) => migrate(v)?, None => json!({ "items": {} }) };
        if dir == "tracks" { self.take_tracks(&sh) } else { self.take_analysis(&sh) }
      } else if dir == "lists" || dir == "sources" {
        let id = file.strip_suffix(".json").unwrap_or(file).to_string();
        let map = if dir == "lists" { &mut self.lists } else { &mut self.sources };
        match v { Some(v) => { map.insert(id, migrate(v)?); } None => { map.shift_remove(&id); } }
      }
    }
    Ok(())
  }

  /// `apply`: a client's change.
  pub fn apply(&mut self, op: &Op) {
    let s = |k: &str| get(op, k).map(project::str_of).unwrap_or_default();
    match get(op, "m").and_then(|m| m.as_str()).unwrap_or("") {
      "meta" => { self.meta = get(op, "meta").cloned().unwrap_or(Value::Null); self.save_meta(); }
      "tracks" => { let ts = get(op, "ts").and_then(|t| t.as_array()).cloned().unwrap_or_default(); self.put_tracks(ts); }
      "removeTrack" => self.remove_track(&s("id")),
      "analysis" => self.put_analysis(&s("id"), get(op, "a").cloned().unwrap_or(Value::Null)),
      "list" => self.put_list(get(op, "l").cloned().unwrap_or(Value::Null)),
      "deleteList" => self.delete_list(&s("id")),
      "event" => self.put_event(get(op, "e").cloned().unwrap_or(Value::Null)),
      "deleteEvent" => self.delete_event(&s("id")),
      "source" => self.put_source(get(op, "s").cloned().unwrap_or(Value::Null)),
      "deleteSource" => self.delete_source(&s("id")),
      _ => {}
    }
  }

  fn mark(&mut self, path: String) { self.deleted.shift_remove(&path); self.dirty.insert(path); }

  pub fn save_meta(&mut self) { self.mark("collection.json".into()); }
  /// A library this computer can read (`ownSource`): its own, or any outside a shared collection.
  pub fn own_source(&self, s: &Value) -> bool {
    match &self.shared { None => true, Some(m) => !truthy(get(s, "computer")) || get(s, "computer").and_then(Value::as_str) == Some(m.here.me.as_str()) }
  }
  /// A new id (`newId`).
  pub fn new_id(&mut self) -> String { (self.ids)() }
  /// New ids from elsewhere (a test gives them in order).
  pub fn set_ids(&mut self, ids: Ids) { self.ids = ids; }
  /// Now: milliseconds, and as `toISOString` writes it.
  pub fn now(&self) -> (i64, String) { (self.clock)() }
  pub fn put_track(&mut self, t: Value) { let id = id_of(&t); self.tracks.insert(id.clone(), t); self.mark(format!("tracks/{}.json", shard_of(&id))); }
  pub fn put_tracks(&mut self, ts: Vec<Value>) { for t in ts { self.put_track(t); } }

  pub fn remove_track(&mut self, id: &str) {
    // Shared, and this folder doesn't hold this computer's parts (ADR 0108): it removes nothing.
    if self.shared.as_ref().is_some_and(|m| !m.own) { return; }
    let sh = shard_of(id);
    // Shared, and another computer has it too: only this computer's copy goes (ADR 0100).
    if let Some(m) = &mut self.shared {
      if let Some(st) = m.tracks.get(id).cloned() {
        let copies = get(&st, "copies").and_then(|c| c.as_object()).cloned().unwrap_or_default();
        if copies.keys().any(|c| *c != m.here.me) {
          let mut rest_copies = copies.clone();
          rest_copies.shift_remove(&m.here.me);
          let mut rest = st.as_object().cloned().unwrap_or_default();
          rest.insert("copies".into(), Value::Object(rest_copies));
          let rest = Value::Object(rest);
          m.tracks.insert(id.to_string(), rest.clone());
          let local = to_local(&rest, &m.here);
          self.tracks.insert(id.to_string(), local);
          if let Some(by) = m.analysis.get(id).cloned() {
            if truthy(get(&by, &m.here.me)) {
              let mut others = by.as_object().cloned().unwrap_or_default();
              others.shift_remove(&m.here.me);
              let others = Value::Object(others);
              m.analysis.insert(id.to_string(), others.clone());
              match analysis_here(Some(&others), &m.here.me) { Some(a) => { self.analysis.insert(id.to_string(), a); } None => { self.analysis.shift_remove(id); } }
            }
          }
          self.mark(format!("tracks/{sh}.json")); self.mark(format!("analysis/{sh}.json"));
          return;
        }
      }
    }
    self.tracks.shift_remove(id); self.analysis.shift_remove(id);
    self.mark(format!("tracks/{sh}.json")); self.mark(format!("analysis/{sh}.json"));
    let lists: Vec<Value> = self.lists.values().cloned().collect();
    for l in lists {
      let items = get(&l, "items").and_then(|i| i.as_array()).cloned().unwrap_or_default();
      if items.iter().any(|x| x.as_str() == Some(id)) {
        let mut n = l.as_object().cloned().unwrap_or_default();
        n.insert("items".into(), Value::Array(items.into_iter().filter(|x| x.as_str() != Some(id)).collect()));
        self.put_list(Value::Object(n));
      }
    }
  }

  pub fn put_analysis(&mut self, id: &str, a: Value) { self.analysis.insert(id.to_string(), a); self.mark(format!("analysis/{}.json", shard_of(id))); }
  pub fn put_list(&mut self, l: Value) { let id = id_of(&l); self.lists.insert(id.clone(), l); self.mark(format!("lists/{id}.json")); }

  pub fn delete_list(&mut self, id: &str) {
    let mut doomed = vec![id.to_string()];
    let mut i = 0;
    while i < doomed.len() {
      let d = doomed[i].clone();
      for l in self.lists.values() { if get(l, "parentId").and_then(|p| p.as_str()) == Some(d.as_str()) { doomed.push(id_of(l)); } }
      i += 1;
    }
    // Into the bin first (ADR 0090).
    let kept: Vec<Value> = doomed.iter().filter_map(|d| self.lists.get(d).cloned()).collect();
    if !kept.is_empty() {
      let (ms, iso) = (self.clock)();
      self.binned.push(BinEntry { name: format!("{ms}-{}.json", id_of(&kept[0])), deleted_at: iso, lists: kept });
    }
    for d in &doomed { self.lists.shift_remove(d); let p = format!("lists/{d}.json"); self.dirty.shift_remove(&p); self.deleted.insert(p); }
  }

  pub fn put_event(&mut self, e: Value) { let id = id_of(&e); self.events.insert(id, e); self.mark("events.json".into()); }
  pub fn delete_event(&mut self, id: &str) { self.events.shift_remove(id); self.mark("events.json".into()); }
  pub fn put_source(&mut self, s: Value) {
    // A library read here, in a shared collection: this computer's (ADR 0099).
    let s = match &self.shared {
      Some(m) if !truthy(get(&s, "computer")) => { let mut n = s.as_object().cloned().unwrap_or_default(); n.insert("computer".into(), json!(m.here.me)); Value::Object(n) }
      _ => s,
    };
    let id = id_of(&s);
    self.sources.insert(id.clone(), s);
    self.mark(format!("sources/{id}.json"));
  }
  pub fn delete_source(&mut self, id: &str) { self.sources.shift_remove(id); let p = format!("sources/{id}.json"); self.dirty.shift_remove(&p); self.deleted.insert(p); }

  pub fn has_pending(&self) -> bool { !self.dirty.is_empty() || !self.deleted.is_empty() || !self.binned.is_empty() }

  /// `foldComputer`: GLUE Home knows its computer (ADR 0108); parts written under another id fold into it. The twins
  /// come back for the caller to fold (`absorbTracks`). None: nothing to put right.
  pub fn fold_computer(&mut self, into: &str, name: Option<&str>) -> Option<(Counts, Vec<(String, String)>)> {
    let m = self.shared.as_mut()?;
    if unknown_computer(Some(into)) { return None; }
    let folder = get(&m.member, "profile").and_then(|p| p.as_str()).unwrap_or("").to_string();
    let sources: Vec<Value> = self.sources.values().cloned().collect();
    let input = FoldInput { meta: &m.meta, tracks: &m.tracks, analysis: &m.analysis, sources: &sources };
    if !needs_fold(&input, into, &folder) { if m.here.me == into && !m.shown_only { m.own = true; } return None; }
    let r = fold_computer(&input, into, &folder, name);
    m.meta = r.meta.clone(); m.own = true; m.shown_only = false;
    m.here = Here { me: into.to_string(), collection: m.here.collection.clone(), members: get(&r.meta, "members").and_then(|x| x.as_object()).cloned().unwrap_or_default(), roots_by: get(&r.meta, "rootsBy").and_then(|x| x.as_object()).cloned() };
    m.member = json!({ "profile": folder, "name": get(&r.meta, "members").and_then(|x| get(x, into)).and_then(|x| get(x, "name")).cloned().unwrap_or(Value::Null) });
    for (id, st) in &r.tracks { m.tracks.insert(id.clone(), st.clone()); }
    for (id, by) in &r.analysis { m.analysis.insert(id.clone(), by.clone()); }
    let (here, mtracks, manalysis) = (m.here.clone(), m.tracks.clone(), m.analysis.clone());
    self.meta = migrate(collection_here(&r.meta, into)).unwrap_or(Value::Null);
    // Every song seen again as this computer.
    for (id, st) in &mtracks { self.tracks.insert(id.clone(), to_local(st, &here)); }
    for (id, by) in &manalysis { match analysis_here(Some(by), into) { Some(a) => { self.analysis.insert(id.clone(), a); } None => { self.analysis.shift_remove(id); } } }
    for s in &r.sources { let id = id_of(s); self.sources.insert(id.clone(), s.clone()); self.mark(format!("sources/{id}.json")); }
    let mut shards: IndexSet<String> = IndexSet::new();
    for id in r.tracks.keys().chain(r.analysis.keys()) { shards.insert(shard_of(id)); }
    for sh in shards { self.mark(format!("tracks/{sh}.json")); self.mark(format!("analysis/{sh}.json")); }
    self.mark("collection.json".into());
    Some((r.counts, r.twins))
  }

  /// `absorbTracks` (src/store/merge.ts): each song in `into` (id → the song it folds into) goes into that one: its
  /// playlists' entries (once each), the DJ libraries' records, and what the other lacks (rating, notes, tags, cues,
  /// import path); then it's removed.
  pub fn absorb_tracks(&mut self, into: &IndexMap<String, Value>) {
    if into.is_empty() { return; }
    let lists: Vec<Value> = self.lists.values().cloned().collect();
    for l in lists {
      let ids = get(&l, "items").and_then(|i| i.as_array()).cloned().unwrap_or_default();
      if !ids.iter().any(|id| id.as_str().is_some_and(|i| into.contains_key(i))) { continue; }
      let mut items: Vec<Value> = vec![];
      for id in ids {
        let to = id.as_str().and_then(|i| into.get(i)).and_then(|t| get(t, "id")).cloned().unwrap_or(id);
        if !items.contains(&to) { items.push(to); }
      }
      let mut n = l.as_object().cloned().unwrap_or_default();
      n.insert("items".into(), Value::Array(items));
      self.put_list(Value::Object(n));
    }
    let sources: Vec<Value> = self.sources.values().cloned().collect();
    for src in sources {
      let ts = get(&src, "tracks").and_then(|t| t.as_array()).cloned().unwrap_or_default();
      let hit = |st: &Value| get(st, "trackId").and_then(|t| t.as_str()).and_then(|t| into.get(t));
      if !ts.iter().any(|st| hit(st).is_some()) { continue; }
      let ts: Vec<Value> = ts.iter().map(|st| match hit(st) { Some(to) => { let mut n = st.as_object().cloned().unwrap_or_default(); n.insert("trackId".into(), get(to, "id").cloned().unwrap_or(Value::Null)); Value::Object(n) } None => st.clone() }).collect();
      let mut n = src.as_object().cloned().unwrap_or_default();
      n.insert("tracks".into(), Value::Array(ts));
      self.put_source(Value::Object(n));
    }
    for (from_id, to) in into {
      let (Some(from), Some(cur)) = (self.tracks.get(from_id).cloned(), self.tracks.get(&id_of(to)).cloned()) else { continue };
      let mut t = cur.as_object().cloned().unwrap_or_default();
      let mut srcs: Vec<Value> = vec![];
      for x in get(&cur, "sources").and_then(|v| v.as_array()).into_iter().flatten().chain(get(&from, "sources").and_then(|v| v.as_array()).into_iter().flatten()) { if !srcs.contains(x) { srcs.push(x.clone()); } }
      t.insert("sources".into(), Value::Array(srcs));
      let nullish = |v: Option<&Value>| v.is_none_or(|v| v.is_null());
      if nullish(t.get("rating")) && !nullish(get(&from, "rating")) { t.insert("rating".into(), get(&from, "rating").cloned().unwrap()); }
      for k in ["notes", "tags", "prep", "importPath"] {
        if !truthy(t.get(k)) && truthy(get(&from, k)) { t.insert(k.into(), get(&from, k).cloned().unwrap()); }
      }
      self.put_track(Value::Object(t));
      self.remove_track(from_id);
    }
  }

  /// `countsOf` (src/core/shared/counts.ts): the collection's songs, and the ones this computer has a file of.
  pub fn counts(&self) -> (u64, u64) {
    let (mut tracks, mut songs) = (0, 0);
    for t in self.tracks.values() { tracks += 1; if !truthy(get(t, "remote")) && get(t, "status").and_then(|s| s.as_str()) != Some("unlinked") { songs += 1; } }
    (tracks, songs)
  }
  /// `holdsMusic`: a computer of the collection (songs here, or music folders).
  pub fn holds_music(&self) -> bool { let (_, songs) = self.counts(); songs > 0 || get(&self.meta, "roots").and_then(|r| r.as_array()).is_some_and(|r| !r.is_empty()) }

  /// `writeUnwritten` (src/store/writeInfo.ts): edited song info into the songs' files, each song once. `write`
  /// writes a song's tags (its new size and date); `reachable` says whether a music folder can be reached now
  /// (asked once each); `restamp` follows a file's new size and date in GLUE Home's cache.
  pub fn write_unwritten(&mut self, write: &mut WriteTags, reachable: &mut dyn FnMut(&Value) -> bool, restamp: &mut Restamp) -> Unwritten {
    let (mut tried, mut reach) = (IndexSet::<String>::new(), std::collections::HashMap::<String, bool>::new());
    let mut out = Unwritten::default();
    loop {
      let Some(t) = self.tracks.values().find(|x| get(x, "unwritten").and_then(|u| u.as_array()).is_some_and(|u| !u.is_empty()) && !tried.contains(&id_of(x))).cloned() else { break };
      let id = id_of(&t);
      tried.insert(id.clone());
      let root = get(&t, "rootId").filter(|v| truthy(Some(v))).map(project::str_of);
      if root.is_none() || !truthy(get(&t, "relPath")) || get(&t, "status").and_then(|s| s.as_str()) != Some("linked") { continue; }
      let root = root.unwrap();
      let ok = *reach.entry(root.clone()).or_insert_with(|| reachable(&t));
      if !ok { if !out.away.contains(&root) { out.away.push(root); } continue; }
      let empty = json!("");
      let mut tags = Obj::new();
      for k in get(&t, "unwritten").and_then(|u| u.as_array()).cloned().unwrap_or_default() {
        let k = project::str_of(&k);
        tags.insert(k.clone(), project::or(get(&t, &k), &empty).clone());
      }
      match write(&t, &tags) {
        Ok((size, mtime)) => {
          let Some(now) = self.tracks.get(&id).cloned() else { break };
          // Edited again meanwhile: still to write.
          let left: Vec<Value> = get(&now, "unwritten").and_then(|u| u.as_array()).cloned().unwrap_or_default().into_iter()
            .filter(|k| { let k = project::str_of(k); !tags.contains_key(&k) || project::or(get(&now, &k), &empty) != &tags[&k] }).collect();
          let mut n = now.as_object().cloned().unwrap_or_default();
          n.insert("size".into(), num(size)); n.insert("mtime".into(), num(mtime));
          if left.is_empty() { n.shift_remove("unwritten"); } else { n.insert("unwritten".into(), Value::Array(left)); }
          self.put_track(Value::Object(n));
          let was = (get(&t, "size").cloned().unwrap_or(Value::Null), get(&t, "mtime").cloned().unwrap_or(Value::Null));
          if let Some(a) = self.analysis.get(&id).cloned() {
            if same_num(get(&a, "fileSize"), &was.0) && same_num(get(&a, "fileMtime"), &was.1) {
              let mut b = a.as_object().cloned().unwrap_or_default();
              b.insert("fileSize".into(), num(size)); b.insert("fileMtime".into(), num(mtime));
              self.put_analysis(&id, Value::Object(b));
            }
          }
          restamp(&t, was, (size, mtime));
          out.written += 1;
        }
        Err(e) => { out.failed += 1; out.why = e; }
      }
    }
    out
  }

  fn bin_dir(&self) -> String { let p: Vec<&str> = self.base.split('/').collect(); format!("bin/{}/{}", p[1], p[3]) }

  /// `flush`: the bin first, then what's removed, then what's changed (each file on its own: one failure doesn't
  /// hold back the rest; failures stay to be written next time). The files written or removed.
  pub fn flush(&mut self) -> Result<Vec<String>, String> {
    if !self.has_pending() { return Ok(vec![]); }
    // Nothing from a store opened as this computer's own into a shared collection's files (another device would get
    // songs without `copies`, ADR 0161): the files became shared since. Nothing is written; the caller opens it again.
    if self.shared.is_none()
      && read_json(&self.root, &format!("{}/collection.json", self.base)).ok().flatten().is_some_and(|m| truthy(get(&m, "shared"))) {
      self.dirty.clear(); self.deleted.clear(); self.binned.clear();
      return Err(OUTDATED.into());
    }
    let paths: Vec<String> = self.dirty.drain(..).collect();
    let gone: Vec<String> = self.deleted.drain(..).collect();
    let bin: Vec<BinEntry> = std::mem::take(&mut self.binned);
    let mut first: Option<String> = None;
    for e in bin {
      let v = json!({ "deletedAt": e.deleted_at, "lists": e.lists });
      if let Err(err) = write_json(&self.root, &format!("{}/{}", self.bin_dir(), e.name), &v) { first.get_or_insert(err); self.binned.push(e); }
    }
    for p in &gone {
      if let Err(err) = self.root.remove(&format!("{}/{p}", self.base)) { self.deleted.insert(p.clone()); first.get_or_insert(err); }
    }
    for p in &paths {
      let value = self.serialize(p);
      let r = match value { None => self.root.remove(&format!("{}/{p}", self.base)), Some(v) => write_json(&self.root, &format!("{}/{p}", self.base), &v) };
      if let Err(err) = r { if !self.deleted.contains(p) { self.dirty.insert(p.clone()); } first.get_or_insert(err); }
    }
    match first { Some(e) => Err(e), None => Ok(paths.into_iter().chain(gone).collect()) }
  }

  fn serialize(&mut self, p: &str) -> Option<Value> {
    if p == "collection.json" {
      let Some(m) = &mut self.shared else { return Some(self.meta.clone()) };
      let holds = m.own && m.tracks.values().any(|t| truthy(get(t, "copies").and_then(|c| get(c, &m.here.me))));
      let me = if m.own { m.here.me.clone() } else { String::new() };
      m.meta = collection_shared(&self.meta, &me, Some(&m.meta), &m.member, holds);
      m.here.members = get(&m.meta, "members").and_then(|x| x.as_object()).cloned().unwrap_or_default();
      m.here.roots_by = get(&m.meta, "rootsBy").and_then(|x| x.as_object()).cloned();
      return Some(m.meta.clone());
    }
    if p == "events.json" {
      let items: Obj = self.events.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
      return Some(json!({ "schemaVersion": SCHEMA, "items": items }));
    }
    let (dir, file) = p.split_once('/')?;
    let key = file.strip_suffix(".json").unwrap_or(file);
    if dir == "tracks" || dir == "analysis" {
      let mut items = Obj::new();
      if let Some(m) = &mut self.shared {
        // Not this folder's to write (ADR 0108): the songs' common parts only, every copy kept as read.
        let w = if m.own { m.here.clone() } else { Here { me: String::new(), ..m.here.clone() } };
        if dir == "tracks" {
          for (id, t) in &self.tracks { if shard_of(id) != key { continue; } let st = to_shared(t, &w, m.tracks.get(id)); m.tracks.insert(id.clone(), st.clone()); items.insert(id.clone(), st); }
        } else {
          for (id, t) in &self.tracks {
            if shard_of(id) != key { continue; }
            let prev = m.analysis.get(id).cloned();
            let by = match self.analysis.get(id) { Some(a) if !truthy(get(t, "remote")) => Some(analysis_shared(a, &w.me, prev.as_ref())), _ => prev };
            if let Some(by) = by.filter(|b| truthy(Some(b))) { m.analysis.insert(id.clone(), by.clone()); items.insert(id.clone(), by); }
          }
        }
        return Some(json!({ "schemaVersion": SCHEMA, "items": items }));
      }
      let src = if dir == "tracks" { &self.tracks } else { &self.analysis };
      for (id, v) in src {
        if shard_of(id) != key { continue; }
        // What only a merged view knows (which devices have it) isn't saved.
        if dir == "tracks" && (truthy(get(v, "onDevices")) || truthy(get(v, "remote"))) {
          let mut rest = v.as_object().cloned().unwrap_or_default();
          rest.shift_remove("onDevices"); rest.shift_remove("remote");
          items.insert(id.clone(), Value::Object(rest));
        } else { items.insert(id.clone(), v.clone()); }
      }
      return Some(json!({ "schemaVersion": SCHEMA, "items": items }));
    }
    if dir == "lists" { return self.lists.get(key).cloned(); }
    if dir == "sources" { return self.sources.get(key).cloned(); }
    None
  }
}
