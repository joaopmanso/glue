//! Three-way merge of a shared collection's files (ADR 0094; src/core/shared/merge3.ts in Rust, ADR 0155): the last
//! copy both sides agreed on (base), this device's (local) and the cloud's (remote). Pure: JSON in, JSON out. `None`
//! is JavaScript's `undefined` (the file, or a key, isn't there), never `null`.
//! - Only one side changed something: that side's value, silently.
//! - Both changed it to the same: fine.
//! - Both changed it differently: a clash. The cloud's value is kept and the clash is reported.
//!
//! Special parts: per-computer parts (a song's `copies`, analyses by computer, `rootsBy`) belong to their computer; sets
//! of names (tags, genres…) merge as sets; a playlist's songs merge three ways.
use crate::json::{js_keys, stringify, Obj};
use crate::project::str_of;
use indexmap::IndexSet;
use serde_json::Value;

/// A clash: the file, the place in it (`items.t1.title`), both values (None: not there on that side).
#[derive(Debug, Clone, PartialEq)]
pub struct Clash { pub file: String, pub at: String, pub local: Option<Value>, pub remote: Option<Value> }
impl Clash {
  /// As JavaScript writes it (`undefined` sides left out), with who made the other change and when, if known.
  pub fn to_json(&self, by: Option<&Value>, when: Option<&Value>) -> Value {
    let mut o = Obj::new();
    o.insert("file".into(), Value::String(self.file.clone()));
    o.insert("at".into(), Value::String(self.at.clone()));
    if let Some(v) = &self.local { o.insert("local".into(), v.clone()); }
    if let Some(v) = &self.remote { o.insert("remote".into(), v.clone()); }
    if let Some(b) = by { o.insert("by".into(), b.clone()); }
    if let Some(w) = when { o.insert("when".into(), w.clone()); }
    Value::Object(o)
  }
}

/// `JSON.stringify(a) === JSON.stringify(b)` (undefined equals only undefined).
fn same(a: Option<&Value>, b: Option<&Value>) -> bool {
  match (a, b) { (None, None) => true, (Some(x), Some(y)) => stringify(x) == stringify(y), _ => false }
}
fn arr(v: Option<&Value>) -> Option<&Vec<Value>> { v.and_then(|v| v.as_array()) }
fn obj(v: Option<&Value>) -> Option<&Obj> { v.and_then(|v| v.as_object()) }

/// Keys whose value is a set of names: merged as sets, never a clash.
const SETS: [&str; 6] = ["tags", "genres", "ignoredDupes", "dupConfirmed", "edited", "sources"];

#[derive(PartialEq)]
enum Kind { Tracks, Analysis, Collection, Other }
fn kind(file: &str) -> Kind {
  if file.starts_with("tracks/") { Kind::Tracks } else if file.starts_with("analysis/") { Kind::Analysis } else if file == "collection.json" { Kind::Collection } else { Kind::Other }
}

/// Sets of names: what either side added, less what either removed; the cloud's first.
pub fn merge_sets(base: Option<&Vec<Value>>, local: Option<&Vec<Value>>, remote: Option<&Vec<Value>>) -> Option<Vec<Value>> {
  if local.is_none() && remote.is_none() { return None; }
  let key = |xs: Option<&Vec<Value>>| -> Vec<String> { xs.map(|a| a.iter().map(stringify).collect()).unwrap_or_default() };
  let (b, l, r) = (key(base), key(local), key(remote));
  let (ls, rs): (IndexSet<&String>, IndexSet<&String>) = (l.iter().collect(), r.iter().collect());
  let b: IndexSet<&String> = b.iter().collect();
  let gone: IndexSet<&&String> = b.iter().filter(|x| !ls.contains(**x) || !rs.contains(**x)).collect();
  let mut out: Vec<&String> = vec![];
  for x in r.iter().chain(l.iter()) { if !gone.contains(&x) && !out.contains(&x) { out.push(x); } }
  Some(out.into_iter().map(|x| crate::json::parse(x).unwrap_or(Value::Null)).collect())
}

/// A playlist's songs: the cloud's order, less what this side removed, plus what it added (after the song it followed
/// here). Both sides reordering the same songs differently is a clash.
pub fn merge_sequence(base: &[Value], local: &[Value], remote: &[Value]) -> (Vec<Value>, bool) {
  let has = |xs: &[Value], x: &Value| xs.contains(x);
  let mut out: Vec<Value> = remote.iter().filter(|x| !(has(base, x) && !has(local, x))).cloned().collect();
  for (i, x) in local.iter().enumerate() {
    if has(base, x) || has(remote, x) || out.contains(x) { continue; }
    // After the nearest song before it (here) that's in the result; else at the start.
    let mut at = 0;
    for j in (0..i).rev() { if let Some(k) = out.iter().position(|y| *y == local[j]) { at = k + 1; break; } }
    out.insert(at, x.clone());
  }
  let common = |xs: &[Value]| xs.iter().filter(|x| has(base, x) && has(local, x) && has(remote, x)).map(str_of).collect::<Vec<_>>().join("\n");
  let (cb, cl, cr) = (common(base), common(local), common(remote));
  (out, cl != cb && cr != cb && cl != cr)
}

fn merge_value(file: &str, at: &[String], base: Option<&Value>, local: Option<&Value>, remote: Option<&Value>, me: &str, clashes: &mut Vec<Clash>) -> Option<Value> {
  if same(local, remote) { return local.cloned(); }
  if same(base, local) { return remote.cloned(); }
  if same(base, remote) { return local.cloned(); }
  let key = at.last().map(String::as_str).unwrap_or("");
  let k = kind(file);
  let parent = if at.len() >= 2 { at[at.len() - 2].as_str() } else { "" };
  // Per-computer parts: this computer's own is this side's; the others' are the cloud's.
  let per_computer = (k == Kind::Tracks && parent == "copies") || (k == Kind::Analysis && at.len() == 3) || (k == Kind::Collection && parent == "rootsBy");
  if per_computer { return if key == me { local.cloned() } else { remote.cloned() }; }
  if SETS.contains(&key) && (arr(local).is_some() || arr(remote).is_some()) {
    return merge_sets(arr(base), arr(local), arr(remote)).map(Value::Array);
  }
  if key == "items" { if let (Some(l), Some(r)) = (arr(local), arr(remote)) {
    let (v, clash) = merge_sequence(arr(base).map(|b| b.as_slice()).unwrap_or(&[]), l, r);
    if clash { clashes.push(Clash { file: file.into(), at: at.join("."), local: local.cloned(), remote: remote.cloned() }); }
    return Some(Value::Array(v));
  } }
  if let (Some(l), Some(r)) = (obj(local), obj(remote)) {
    let empty = Obj::new();
    let b = obj(base).unwrap_or(&empty);
    let mut keys: IndexSet<&String> = IndexSet::new();
    for o in [r, l, b] { for x in js_keys(o) { keys.insert(x); } }
    let mut out = Obj::new();
    for x in keys {
      let mut path = at.to_vec();
      path.push(x.clone());
      if let Some(v) = merge_value(file, &path, b.get(x), l.get(x), r.get(x), me, clashes) { out.insert(x.clone(), v); }
    }
    return Some(Value::Object(out));
  }
  // Both changed it differently (or one side deleted what the other changed): the cloud's, reported.
  clashes.push(Clash { file: file.into(), at: at.join("."), local: local.cloned(), remote: remote.cloned() });
  remote.cloned()
}

/// Merge one file (None: it doesn't exist on that side): the result, and the clashes.
pub fn merge3(file: &str, base: Option<&Value>, local: Option<&Value>, remote: Option<&Value>, me: &str) -> (Option<Value>, Vec<Clash>) {
  let mut clashes = vec![];
  let v = merge_value(file, &[], base, local, remote, me, &mut clashes);
  (v, clashes)
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;
  #[test]
  fn merges_as_the_website_does() {
    let b = json!({ "items": { "t1": { "title": "A", "tags": ["x"], "copies": { "desk": { "size": 1 }, "lap": { "size": 1 } } } } });
    let l = json!({ "items": { "t1": { "title": "B", "tags": ["x", "y"], "copies": { "desk": { "size": 2 }, "lap": { "size": 1 } } } } });
    let r = json!({ "items": { "t1": { "title": "C", "tags": [], "copies": { "desk": { "size": 1 }, "lap": { "size": 3 } } } } });
    let (v, c) = merge3("tracks/t1.json", Some(&b), Some(&l), Some(&r), "desk");
    assert_eq!(stringify(&v.unwrap()), r#"{"items":{"t1":{"title":"C","tags":["y"],"copies":{"desk":{"size":2},"lap":{"size":3}}}}}"#);
    assert_eq!(c, vec![Clash { file: "tracks/t1.json".into(), at: "items.t1.title".into(), local: Some(json!("B")), remote: Some(json!("C")) }]);
    let (s, clash) = merge_sequence(&[json!("a"), json!("b")], &[json!("a"), json!("n"), json!("b")], &[json!("b"), json!("a"), json!("m")]);
    assert_eq!((s, clash), (vec![json!("b"), json!("a"), json!("n"), json!("m")], false));
  }
}
