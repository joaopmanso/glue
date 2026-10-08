//! Syncing a shared collection (ADR 0094, 0106; src/store/shared/engine.ts in Rust, ADR 0155): the collection's folder
//! in the GLUE folder against its one copy in GLUE Cloud, a snapshot and a log. Held to the website's by
//! tests/golden/sync (the same calls to GLUE Cloud, the same files).
//! - What both sides last agreed on: the cursor and the clashes waiting, in `cloud/shared/<cid>.json`; each file's
//!   agreed text in its own file under `cloud/shared/<cid>/` (ADR 0107).
//! - pull: the log's entries since the cursor (behind the snapshot's floor: the snapshot's files first). A file changed
//!   only there is taken; one changed on both sides is merged three ways (glue_store::merge3), clashes kept.
//! - push: what differs from the agreed copy, as one entry: of a shard only the songs that changed, of any other file
//!   its text. On a stale revision: pulled, merged and pushed again.
//! - checkpoint: when GLUE Cloud asks, the files the log changed, as agreed here, into the snapshot.
use base64::Engine as _;
use glue_store::dir::Dir;
use glue_store::json::{js_keys, parse as parse_json, stringify, Obj};
use glue_store::merge3::merge3;
use indexmap::{IndexMap, IndexSet};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};

/// GLUE Cloud's answer to a call that failed: its HTTP status (0: no answer), and why.
#[derive(Debug, Clone, PartialEq)]
pub struct CloudError { pub status: u16, pub message: String }
impl CloudError { pub fn new(message: impl Into<String>) -> Self { CloudError { status: 0, message: message.into() } } }
impl std::fmt::Display for CloudError { fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(&self.message) } }
type R<T> = Result<T, CloudError>;

/// A collection's copy in GLUE Cloud (its `/v1/shared/:cid/*` routes).
pub trait SharedCloud {
  /// The snapshot's files changed after `since` (metadata only).
  fn changes(&self, since: i64) -> R<Value>;
  /// Lines of path \t rev \t hash \t base64(gzip(text)).
  fn bundle(&self, paths: &[String]) -> R<String>;
  /// The log since `since`; `reset`: behind the snapshot's floor.
  fn log(&self, since: i64) -> R<Value>;
  /// One entry, on revision `base`: its revision, or stale; `compact`: fold the log into the snapshot.
  fn append(&self, base: i64, paths: &[String], data: &str) -> R<Value>;
  /// The files the log changed up to `to`.
  fn touched(&self, to: i64) -> R<Value>;
  /// Lines of path \t hash \t size \t base64(gzip(text)) or '-' deleted, into the snapshot at `at`.
  fn checkpoint(&self, at: i64, body: &str, done: bool) -> R<Value>;
}

/// `own`: this computer's other devices (its GLUE Home): their changes are this computer's own, one writer at a time
/// (ADR 0162), so they never clash with it; one recorded before is dropped.
pub struct Place<'a> { pub root: &'a dyn Dir, pub pid: String, pub cid: String, pub me: String, pub cloud: &'a dyn SharedCloud, pub own: Vec<String> }
/// A change by this computer itself (`by`: the device whose push it came in).
fn own_by(p: &Place, by: Option<&Value>) -> bool { by.and_then(|b| b.as_str()).is_some_and(|b| b == p.me || p.own.iter().any(|o| o == b)) }
#[derive(Debug, Default)]
pub struct SyncResult { pub changed: Vec<String>, pub clashes: Vec<Value>, pub pushed: usize }

const DIRS: [&str; 5] = ["tracks", "analysis", "lists", "sources", "dupes"];
/// One entry: at most this much JSON before it's packed (packed, under GLUE Cloud's 1.8 MB), and the snapshot's files
/// per checkpoint call.
const MAX_ENTRY_JSON: usize = 6_000_000;
const MAX_PACKED: usize = 1_700_000;
const MAX_BODY: usize = 1_500_000;
const MAX_FILES: usize = 150;

/// The files synced: collection.json, events.json, and the JSON files of tracks/, analysis/, lists/, sources/, dupes/.
pub fn synced(path: &str) -> bool {
  if path == "collection.json" || path == "events.json" { return true; }
  let Some((d, n)) = path.split_once('/') else { return false };
  DIRS.contains(&d) && n.len() > 5 && n.ends_with(".json") && n.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.' || b == b'-')
}

/// gzip, then base64 (packText).
pub fn pack_text(text: &str) -> String {
  let mut e = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
  let _ = e.write_all(text.as_bytes());
  base64::engine::general_purpose::STANDARD.encode(e.finish().unwrap_or_default())
}
/// base64, then gunzip (unpackText).
pub fn unpack_text(b64: &str) -> R<String> {
  let b = base64::engine::general_purpose::STANDARD.decode(b64.trim()).map_err(|e| CloudError::new(e.to_string()))?;
  let mut s = String::new();
  flate2::read::GzDecoder::new(&b[..]).read_to_string(&mut s).map_err(|e| CloudError::new(e.to_string()))?;
  Ok(s)
}
fn sha256(text: &str) -> String { use sha2::Digest; sha2::Sha256::digest(text.as_bytes()).iter().map(|b| format!("{b:02x}")).collect() }
/// A string's `length` in JavaScript (UTF-16 units).
fn js_len(s: &str) -> usize { s.encode_utf16().count() }
fn parse(t: Option<&str>) -> Option<Value> { t.and_then(|t| parse_json(t).ok()) }
fn obj(v: Option<&Value>) -> Option<&Obj> { v.and_then(|v| v.as_object()) }

/// The same value, whatever the order of its keys (two stores may write a song's fields in another order).
pub fn same(a: Option<&Value>, b: Option<&Value>) -> bool {
  match (a, b) {
    (None, None) => true,
    (Some(Value::Array(x)), Some(Value::Array(y))) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(Some(p), Some(q))),
    (Some(Value::Object(x)), Some(Value::Object(y))) => x.len() == y.len() && x.iter().all(|(k, v)| same(Some(v), y.get(k))),
    (Some(Value::Number(x)), Some(Value::Number(y))) => x.as_f64() == y.as_f64(),
    (Some(x), Some(y)) => x == y,
    _ => false,
  }
}

fn base(p: &Place) -> String { format!("profiles/{}/collections/{}", p.pid, p.cid) }
fn state_path(p: &Place) -> String { format!("cloud/shared/{}.json", p.cid) }
fn agreed_dir(p: &Place) -> String { format!("cloud/shared/{}", p.cid) }

/// The synced files under a folder (the collection's, or the agreed copies').
fn synced_paths(root: &dyn Dir, dir: &str) -> Vec<String> {
  let mut out: Vec<String> = root.list(dir, false).unwrap_or_default().into_iter().filter(|n| synced(n)).collect();
  for d in DIRS { for n in root.list(&format!("{dir}/{d}"), false).unwrap_or_default() { let x = format!("{d}/{n}"); if synced(&x) { out.push(x); } } }
  out
}

/// What this device and GLUE Cloud last agreed on.
pub struct State { pub cursor: i64, pub clashes: Vec<Value>, merged: IndexSet<String>, texts: HashMap<String, Option<String>>, dirty: IndexSet<String> }
impl State {
  pub fn load(p: &Place) -> State {
    let meta = parse(p.root.read(&state_path(p)).ok().flatten().as_deref());
    let clashes = meta.as_ref().and_then(|m| m["clashes"].as_array().cloned()).unwrap_or_default().into_iter().filter(|c| !own_by(p, c.get("by"))).collect();
    let mut s = State { cursor: meta.as_ref().and_then(|m| m["cursor"].as_i64()).unwrap_or(0), clashes, merged: IndexSet::new(), texts: HashMap::new(), dirty: IndexSet::new() };
    // From before (every agreed text in this one file): each into its own, once.
    if let Some(files) = meta.as_ref().and_then(|m| m["files"].as_object()) {
      for (k, v) in files { if let Some(t) = v["text"].as_str() { if synced(k) { s.set(k, Some(t.to_string())); } } }
      s.save(p);
    }
    s
  }
  fn get(&mut self, p: &Place, path: &str, keep: bool) -> Option<String> {
    if let Some(t) = self.texts.get(path) { return t.clone(); }
    let t = p.root.read(&format!("{}/{path}", agreed_dir(p))).ok().flatten();
    if keep { self.texts.insert(path.into(), t.clone()); }
    t
  }
  fn set(&mut self, path: &str, text: Option<String>) { self.texts.insert(path.into(), text); self.dirty.insert(path.into()); }
  fn paths(&self, p: &Place) -> Vec<String> { synced_paths(p.root, &agreed_dir(p)) }
  fn save(&mut self, p: &Place) {
    for path in std::mem::take(&mut self.dirty) {
      let at = format!("{}/{path}", agreed_dir(p));
      match self.texts.get(&path).cloned().flatten() { None => { let _ = p.root.remove(&at); } Some(t) => { let _ = p.root.write(&at, &t); } }
    }
    let mut m = Obj::new();
    m.insert("v".into(), json!(2));
    m.insert("cursor".into(), json!(self.cursor));
    if !self.clashes.is_empty() { m.insert("clashes".into(), Value::Array(self.clashes.clone())); }
    let _ = p.root.write(&state_path(p), &stringify(&Value::Object(m)));
  }
}

fn read_local(p: &Place, path: &str) -> Option<String> { p.root.read(&format!("{}/{path}", base(p))).ok().flatten() }
fn write_local(p: &Place, path: &str, text: Option<&str>) {
  let at = format!("{}/{path}", base(p));
  match text { None => { let _ = p.root.remove(&at); } Some(t) => { let _ = p.root.write(&at, t); } }
}

// ---- changes of a file -------------------------------------------------------------------------------------------

/// How `now` differs from `was` (None: the same). A file of songs on both sides: only the songs (`{o, i}`); else its
/// text (`{t}`), or deleted (`{d: 1}`).
pub fn diff_file(was: Option<&str>, now: Option<&str>) -> Option<Value> {
  if was == now { return None; }
  let Some(now) = now else { return Some(json!({ "d": 1 })) };
  let (a, b) = (parse(was), parse(Some(now)));
  if let (Some(ao), Some(bo)) = (obj(a.as_ref()), obj(b.as_ref())) {
    if let (Some(ai), Some(bi)) = (obj(ao.get("items")), obj(bo.get("items"))) {
      let mut o = Obj::new();
      for k in js_keys(bo) { if k != "items" { o.insert(k.clone(), bo[k].clone()); } }
      let mut i = Obj::new();
      for id in js_keys(bi) { if !same(ai.get(id), bi.get(id)) { i.insert(id.clone(), bi[id].clone()); } }
      for id in js_keys(ai) { if !bi.contains_key(id) { i.insert(id.clone(), Value::Null); } }
      let others: Vec<&String> = js_keys(ao).into_iter().filter(|k| *k != "items").collect();
      if i.is_empty() && others.len() == o.len() && others.iter().all(|k| same(ao.get(*k), o.get(*k))) { return None; }
      return Some(json!({ "o": o, "i": i }));
    }
  }
  if a.is_some() && same(a.as_ref(), b.as_ref()) { return None; }
  Some(json!({ "t": now }))
}
/// The file after a change (None: deleted).
pub fn apply_change(was: Option<&str>, c: &Value) -> Option<String> {
  if c.get("d").is_some() { return None; }
  if let Some(t) = c.get("t") { return Some(t.as_str().unwrap_or("").to_string()); }
  let a = parse(was);
  let mut items = obj(a.as_ref().and_then(|a| a.get("items"))).cloned().unwrap_or_default();
  for (id, v) in c["i"].as_object().into_iter().flatten() { if v.is_null() { items.shift_remove(id); } else { items.insert(id.clone(), v.clone()); } }
  let mut out = c["o"].as_object().cloned().unwrap_or_default();
  out.insert("items".into(), Value::Object(items));
  Some(stringify(&Value::Object(out)))
}

// ---- pull ----------------------------------------------------------------------------------------------------------

/// The clashes waiting for an answer (kept with the sync state; `waitingClashes`).
pub fn waiting_clashes(p: &Place) -> Vec<Value> { State::load(p).clashes }
/// Settle a clash (`resolveClash`): `value` goes into this device's file at the clash's place (the cloud's value is
/// already there when that's the answer: `keep_remote`), and the clash is forgotten. The next push sends it.
pub fn resolve_clash(p: &Place, file: &str, at: &str, value: Option<&Value>, keep_remote: bool) {
  let mut s = State::load(p);
  if !keep_remote {
    let v = set_at(parse(read_local(p, file).as_deref()), at, value);
    write_local(p, file, v.as_ref().map(stringify).as_deref());
  }
  s.clashes.retain(|c| !(c["file"].as_str() == Some(file) && c["at"].as_str() == Some(at)));
  s.save(p);
}
/// The value at a clash's place (`items.t1.title`) in a file's JSON, set (None: removed; `setAt`).
pub fn set_at(doc: Option<Value>, at: &str, value: Option<&Value>) -> Option<Value> {
  if at.is_empty() { return value.cloned(); }
  let mut root = match doc { Some(v @ Value::Object(_)) => v, _ => json!({}) };
  let keys: Vec<&str> = at.split('.').collect();
  let mut o = &mut root;
  for k in &keys[..keys.len() - 1] {
    let m = o.as_object_mut()?;
    if !m.get(*k).is_some_and(|v| v.is_object()) { m.insert(k.to_string(), json!({})); }
    o = m.get_mut(*k)?;
  }
  let m = o.as_object_mut()?;
  let last = keys[keys.len() - 1];
  match value { None => { m.shift_remove(last); } Some(v) => { m.insert(last.to_string(), v.clone()); } }
  Some(root)
}

/// The cloud's copy of a file came in: taken, or merged with this device's own changes.
#[allow(clippy::too_many_arguments)]
fn take(p: &Place, s: &mut State, path: &str, remote: Option<String>, by: Option<&Value>, at: Option<&Value>, changed: &mut Vec<String>, clashes: &mut Vec<Value>) {
  let mine = read_local(p, path);
  let agreed = s.get(p, path, true);
  if mine == remote { /* the same already */ }
  else if mine == agreed { write_local(p, path, remote.as_deref()); changed.push(path.into()); }
  else {
    let (v, cs) = merge3(path, parse(agreed.as_deref()).as_ref(), parse(mine.as_deref()).as_ref(), parse(remote.as_deref()).as_ref(), &p.me);
    if !own_by(p, by) {
      let by = by.filter(|b| !b.is_null()).cloned().unwrap_or(Value::Null);
      clashes.extend(cs.iter().map(|c| c.to_json(Some(&by), at)));
    }
    write_local(p, path, v.as_ref().map(stringify).as_deref());
    changed.push(path.into());
    s.merged.insert(path.into());
  }
  s.set(path, remote);
}

/// Behind the floor: the snapshot's files changed since the cursor, then the cursor is the floor.
fn from_snapshot(p: &Place, s: &mut State, floor: i64, changed: &mut Vec<String>, clashes: &mut Vec<Value>) -> R<()> {
  let (mut more, mut since) = (true, s.cursor);
  while more {
    let c = p.cloud.changes(since)?;
    let (Some(files), Some(seq)) = (c["files"].as_array(), c["seq"].as_i64()) else { return Err(CloudError::new("GLUE Cloud answered strangely")) };
    more = c["more"].as_bool().unwrap_or(false); since = seq;
    let todo: Vec<&Value> = files.iter().filter(|f| synced(f["path"].as_str().unwrap_or(""))).collect();
    // In bundles of files, taken as each comes (a bundle answers as many as fit: the rest is asked again).
    let by_path: IndexMap<&str, &Value> = todo.iter().map(|f| (f["path"].as_str().unwrap_or(""), *f)).collect();
    for f in &todo { if f["deleted"].as_bool().unwrap_or(false) { take(p, s, f["path"].as_str().unwrap_or(""), None, f.get("by"), f.get("at"), changed, clashes); } }
    let mut want: Vec<String> = todo.iter().filter(|f| !f["deleted"].as_bool().unwrap_or(false)).map(|f| f["path"].as_str().unwrap_or("").to_string()).collect();
    while !want.is_empty() {
      let mut got = 0;
      let text = p.cloud.bundle(&want[..want.len().min(400)])?;
      for line in text.split('\n') {
        if line.is_empty() { continue; }
        let parts: Vec<&str> = line.split('\t').collect();
        let (path, data) = (parts[0], parts.get(3).copied().unwrap_or(""));
        let (Some(f), Some(i)) = (by_path.get(path), want.iter().position(|w| w == path)) else { continue };
        want.remove(i); got += 1;
        take(p, s, path, Some(unpack_text(data)?), f.get("by"), f.get("at"), changed, clashes);
      }
      if got == 0 { return Err(CloudError::new(format!("GLUE Cloud didn’t send {}", want[0]))); }
    }
  }
  s.cursor = floor;
  Ok(())
}

/// A file as the log's entries leave it: its text (None: deleted), who changed it last, and when.
type Incoming = (Option<String>, Option<Value>, Option<Value>);

/// Take in what changed in the cloud. `changed`: the local files that changed, told as each is written (ADR 0143).
pub fn pull(p: &Place, s: &mut State, changed: &mut Vec<String>) -> R<Vec<Value>> {
  let mut clashes = vec![];
  let (mut more, mut resets) = (true, 0);
  while more {
    let r = p.cloud.log(s.cursor)?;
    let (Some(seq), Some(entries)) = (r["seq"].as_i64(), r["entries"].as_array()) else { return Err(CloudError::new("GLUE Cloud answered strangely")) };
    let mut found = vec![];
    if r["reset"].as_bool().unwrap_or(false) {
      resets += 1;
      if resets > 3 { return Err(CloudError::new("GLUE Cloud’s copy keeps moving: try again")); }
      from_snapshot(p, s, r["floor"].as_i64().unwrap_or(0), changed, &mut found)?;
    } else {
      more = r["more"].as_bool().unwrap_or(false);
      // The cloud's copy of each file the entries touch, from the agreed one, entry after entry.
      let mut next: IndexMap<String, Incoming> = IndexMap::new();
      for e in entries {
        let body = unpack_text(e["data"].as_str().unwrap_or("")).ok().and_then(|t| parse(Some(&t)));
        let Some(f) = obj(body.as_ref().and_then(|b| b.get("f"))) else { continue };
        for path in js_keys(f) {
          if !synced(path) { continue; }
          let was = match next.get(path) { Some(n) => n.0.clone(), None => s.get(p, path, true) };
          next.insert(path.clone(), (apply_change(was.as_deref(), &f[path]), e.get("by").cloned(), e.get("at").cloned()));
        }
      }
      for (path, (text, by, at)) in next { take(p, s, &path, text, by.as_ref(), at.as_ref(), changed, &mut found); }
      s.cursor = seq;
    }
    if !found.is_empty() { s.clashes.extend(found.iter().cloned()); clashes.extend(found); }
    s.save(p);
  }
  Ok(clashes)
}

// ---- push ----------------------------------------------------------------------------------------------------------

fn entry_of(batch: &[(String, Value, Option<String>)]) -> String {
  let mut f = Obj::new();
  for (path, c, _) in batch { f.insert(path.clone(), c.clone()); }
  pack_text(&stringify(&json!({ "v": 1, "f": f })))
}

/// Send what changed here as entries of the log (`only`: just these files may have; else all are looked at). On a
/// stale revision: pulled, merged and sent again (a few times at most). Then the log folded into the snapshot, if GLUE
/// Cloud asks. The files sent, and the clashes a pull found.
pub fn push(p: &Place, s: &mut State, only: Option<Vec<String>>, changed: &mut Vec<String>) -> R<(usize, Vec<Value>)> {
  let (mut pushed, mut compact, mut clashes) = (0, false, vec![]);
  let mut hinted: Option<IndexSet<String>> = only.map(|o| o.into_iter().filter(|x| synced(x)).collect());
  for _ in 0..5 {
    // One file at a time: read, compared, and only what changed kept.
    let paths: Vec<String> = match &hinted { Some(h) => h.iter().cloned().collect(), None => { let mut all: IndexSet<String> = synced_paths(p.root, &base(p)).into_iter().collect(); all.extend(s.paths(p)); all.into_iter().collect() } };
    let mut todo: Vec<(String, Value, Option<String>)> = vec![];
    for path in paths {
      let now = read_local(p, &path);
      if let Some(c) = diff_file(s.get(p, &path, false).as_deref(), now.as_deref()) { todo.push((path, c, now)); }
    }
    if todo.is_empty() { break; }
    let (mut stale, mut i) = (false, 0);
    while i < todo.len() {
      // As many files as fit one entry.
      let (mut batch, mut n) = (vec![], 0);
      while i < todo.len() {
        let len = js_len(&stringify(&todo[i].1));
        if !batch.is_empty() && n + len > MAX_ENTRY_JSON { break; }
        batch.push(todo[i].clone()); n += len; i += 1;
      }
      let mut data = entry_of(&batch);
      while data.len() > MAX_PACKED && batch.len() > 1 {
        let keep = batch.len().div_ceil(2);
        i -= batch.len() - keep;
        batch.truncate(keep);
        data = entry_of(&batch);
      }
      if data.len() > MAX_PACKED { return Err(CloudError::new(format!("too big for GLUE Cloud: {}", batch[0].0))); }
      let r = p.cloud.append(s.cursor, &batch.iter().map(|b| b.0.clone()).collect::<Vec<_>>(), &data)?;
      if r["stale"].as_bool().unwrap_or(false) { stale = true; break; }
      let Some(rev) = r["rev"].as_i64() else { return Err(CloudError::new("GLUE Cloud answered a push strangely")) };
      s.cursor = rev;
      for (path, _, now) in &batch { s.set(path, now.clone()); }
      pushed += batch.len();
      compact |= r["compact"].as_bool().unwrap_or(false);
      s.save(p);
    }
    if !stale { break; }
    clashes.extend(pull(p, s, changed)?);
    // What the merge wrote here goes up too.
    if let Some(h) = &mut hinted { for x in &s.merged { h.insert(x.clone()); } }
  }
  if compact { if let Err(e) = checkpoint(p, s) { eprintln!("GLUE Cloud: couldn’t fold the log into the snapshot: {e}"); } }
  Ok((pushed, clashes))
}

/// Fold the log into the snapshot at this device's cursor: the files the log changed, as agreed here.
fn checkpoint(p: &Place, s: &mut State) -> R<()> {
  let at = s.cursor;
  let t = p.cloud.touched(at)?;
  let paths: Vec<String> = t["paths"].as_array().into_iter().flatten().filter_map(|x| x.as_str()).filter(|x| synced(x)).map(String::from).collect();
  // A few files at a time, packed as they go.
  let mut i = 0;
  loop {
    let (mut part, mut n): (Vec<String>, usize) = (vec![], 0);
    while i < paths.len() && part.len() < MAX_FILES && n < MAX_BODY {
      let path = &paths[i];
      let line = match s.get(p, path, false) {
        None => format!("{path}\t\t0\t-"),
        Some(text) => format!("{path}\t{}\t{}\t{}", sha256(&text), text.len(), pack_text(&text)),
      };
      if !part.is_empty() && n + js_len(&line) > MAX_BODY { break; }
      n += js_len(&line); part.push(line); i += 1;
    }
    p.cloud.checkpoint(at, &part.join("\n"), i >= paths.len())?;
    if i >= paths.len() { break; }
  }
  Ok(())
}

/// Both ways: take in the cloud's changes, then send this side's. `changed_here`: the only files that may have changed
/// here since the last sync (the store says what it wrote); None: every file is looked at. `changed`: filled with the
/// local files that changed as they're written, so a caller reloads them even when the sync fails partway (ADR 0143).
pub fn sync_shared(p: &Place, changed_here: Option<&[String]>, changed: &mut Vec<String>) -> R<SyncResult> {
  let mut s = State::load(p);
  let mut clashes = pull(p, &mut s, changed)?;
  let only = changed_here.map(|h| h.iter().cloned().chain(s.merged.iter().cloned()).collect());
  let (pushed, more) = push(p, &mut s, only, changed)?;
  clashes.extend(more);
  let mut seen = IndexSet::new();
  let changed: Vec<String> = changed.iter().filter(|c| seen.insert((*c).clone())).cloned().collect();
  Ok(SyncResult { changed, clashes, pushed })
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn a_clash_answered_sets_its_place_as_the_website_does() {
    let doc = json!({ "schemaVersion": 1, "items": { "t1": { "title": "A", "rating": 3 } } });
    assert_eq!(stringify(&set_at(Some(doc.clone()), "items.t1.title", Some(&json!("B"))).unwrap()), r#"{"schemaVersion":1,"items":{"t1":{"title":"B","rating":3}}}"#);
    assert_eq!(stringify(&set_at(Some(doc.clone()), "items.t1.title", None).unwrap()), r#"{"schemaVersion":1,"items":{"t1":{"rating":3}}}"#);
    assert_eq!(stringify(&set_at(Some(doc), "items.t2.tags", Some(&json!(["x"]))).unwrap()), r#"{"schemaVersion":1,"items":{"t1":{"title":"A","rating":3},"t2":{"tags":["x"]}}}"#);
    assert_eq!(set_at(None, "", None), None);
  }
  #[test]
  fn files_and_changes() {
    assert!(synced("tracks/ab.json") && synced("collection.json") && !synced("tracks/a b.json") && !synced("other/x.json") && !synced("tracks/.json"));
    assert_eq!(unpack_text(&pack_text("é \"x\"")).unwrap(), "é \"x\"");
    let was = r#"{"schemaVersion":1,"items":{"a":{"x":1,"y":2},"b":{"x":1}}}"#;
    assert_eq!(diff_file(Some(was), Some(r#"{"schemaVersion":1,"items":{"a":{"y":2,"x":1},"b":{"x":1}}}"#)), None, "the same in another order");
    let c = diff_file(Some(was), Some(r#"{"schemaVersion":1,"items":{"a":{"x":2,"y":2},"c":{"x":1}}}"#)).unwrap();
    assert_eq!(stringify(&c), r#"{"o":{"schemaVersion":1},"i":{"a":{"x":2,"y":2},"c":{"x":1},"b":null}}"#);
    assert_eq!(apply_change(Some(was), &c).unwrap(), r#"{"schemaVersion":1,"items":{"a":{"x":2,"y":2},"c":{"x":1}}}"#);
    assert_eq!(diff_file(Some("x"), None), Some(json!({ "d": 1 })));
  }
}
