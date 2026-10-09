//! A DJ library's playlists in GLUE (`store/linked.ts`, ADR 0063): the library's tree is kept with its source; the
//! playlists the user brings in are copies linked to it (`origin`), under the library's own folder, and follow it when
//! it changes: in place, and only the ones it changed. A list gone from the library goes from GLUE a minute later if
//! still gone, and never after a read that lost most of the library (ADR 0090).
use glue_store::dir::Dir;
use glue_store::json::stringify;
use glue_store::project::truthy;
use glue_store::store::Store;
use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use serde_json::{json, Map, Value};
use std::sync::LazyLock;

pub const GONE_AFTER: i64 = 60_000;

pub(crate) fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> { v.as_object().and_then(|o| o.get(k)) }
pub(crate) fn st<'a>(v: &'a Value, k: &str) -> &'a str { get(v, k).and_then(Value::as_str).unwrap_or("") }
fn origin_str<'a>(l: &'a Value, k: &str) -> Option<&'a str> { get(l, "origin").and_then(|o| get(o, k)).and_then(Value::as_str) }
/// `{ ...v, k: x }`: the key stays where it was, or comes last.
pub(crate) fn with(v: &Value, k: &str, x: Value) -> Value { let mut o = v.as_object().cloned().unwrap_or_default(); o.insert(k.into(), x); Value::Object(o) }
fn arr(v: &Value, k: &str) -> Vec<Value> { get(v, k).and_then(Value::as_array).cloned().unwrap_or_default() }
fn strs(v: &Value, k: &str) -> Vec<String> { arr(v, k).iter().map(|x| x.as_str().map_or_else(|| glue_store::project::str_of(x), String::from)).collect() }
/// `a === b` for two optional strings (a parent; absent and null are one).
fn same_parent(a: Option<&Value>, b: Option<&Value>) -> bool { a.and_then(Value::as_str) == b.and_then(Value::as_str) && a.is_some_and(|x| x.is_string()) == b.is_some_and(|x| x.is_string()) }

/// What changed in GLUE's copies: `held`, copies kept because their list was missing for the first time;
/// `incomplete`, the read had less than half the lists of the one before, so nothing was removed.
#[derive(Clone, Debug, Default)]
pub struct LinkReport { pub updated: usize, pub added: usize, pub removed: usize, pub held: usize, pub incomplete: bool, extra: Vec<&'static str> }
impl LinkReport {
  pub fn incomplete_read() -> Self { Self { incomplete: true, extra: vec!["incomplete"], ..Default::default() } }
  fn hold(&mut self) { if self.held == 0 { self.extra.push("held"); } self.held += 1; }
  fn mark_incomplete(&mut self) { if !self.incomplete { self.extra.push("incomplete"); } self.incomplete = true; }
  pub fn to_json(&self) -> Value {
    let mut o = Map::new();
    o.insert("updated".into(), json!(self.updated)); o.insert("added".into(), json!(self.added)); o.insert("removed".into(), json!(self.removed));
    for k in &self.extra { o.insert((*k).into(), if *k == "held" { json!(self.held) } else { json!(true) }); }
    Value::Object(o)
  }
}

/// GLUE's copies of a library's lists, by the library's ids ('' is the library's own folder).
fn copies<D: Dir>(store: &Store<D>, source_id: &str) -> IndexMap<String, Value> {
  let mut m = IndexMap::new();
  for l in store.lists.values() { if origin_str(l, "sourceId") == Some(source_id) { m.insert(origin_str(l, "externalId").unwrap_or("").to_string(), l.clone()); } }
  m
}
/// A list's songs as GLUE tracks.
fn items_of(src: &Value, l: &Value) -> Vec<Value> {
  let track_of: IndexMap<&str, &str> = get(src, "tracks").and_then(Value::as_array).into_iter().flatten().map(|t| (st(t, "externalId"), st(t, "trackId"))).collect();
  get(l, "items").and_then(Value::as_array).into_iter().flatten().filter_map(|x| x.as_str().and_then(|x| track_of.get(x)).filter(|x| !x.is_empty()).map(|x| json!(x))).collect()
}
/// The path of names from the library's folder down ("2022/140/Heavy").
fn tree_path(by_ext: &IndexMap<String, Value>, l: &Value) -> String {
  let mut names = vec![st(l, "name").to_string()];
  let mut p = get(l, "parent").and_then(Value::as_str).filter(|p| !p.is_empty()).map(String::from);
  let mut guard = 0;
  while let Some(id) = p { if guard > by_ext.len() { break; } guard += 1; names.insert(0, by_ext.get(&id).map_or("", |x| st(x, "name")).to_string()); p = by_ext.get(&id).and_then(|x| get(x, "parent")).and_then(Value::as_str).filter(|p| !p.is_empty()).map(String::from); }
  names.join("/")
}
fn glue_path<D: Dir>(store: &Store<D>, l: &Value, top: Option<&str>) -> String {
  let mut names = vec![st(l, "name").to_string()];
  let mut p = get(l, "parentId").and_then(Value::as_str).filter(|p| !p.is_empty()).map(String::from);
  let mut guard = 0;
  while let Some(id) = p.filter(|id| Some(id.as_str()) != top) { if guard > store.lists.len() { break; } guard += 1; names.insert(0, store.lists.get(&id).map_or("", |x| st(x, "name")).to_string()); p = store.lists.get(&id).and_then(|x| get(x, "parentId")).and_then(Value::as_str).filter(|p| !p.is_empty()).map(String::from); }
  names.join("/")
}
fn songs(l: &Value) -> String { strs(l, "items").join("\n") }

/// Bring GLUE's copies in step with the library's tree (`src.tree`), after it changed from `prev`
/// (`syncLinkedLists`). `pending`: lists missing at the last read, since when.
pub fn sync_linked_lists<D: Dir>(store: &mut Store<D>, src: &Value, prev: Option<&[Value]>, pending: &Map<String, Value>, at: i64) -> LinkReport {
  let src_id = st(src, "id").to_string();
  let tree = arr(src, "tree");
  let by_ext: IndexMap<String, Value> = tree.iter().map(|l| (st(l, "externalId").to_string(), l.clone())).collect();
  let mut was: IndexMap<String, Value> = prev.unwrap_or(&[]).iter().map(|l| (st(l, "externalId").to_string(), l.clone())).collect();
  let mut r = LinkReport::default();
  let mut have = copies(store, &src_id);
  let top = have.get("").cloned();
  let top_id = top.as_ref().map(|t| st(t, "id").to_string());

  // Copies made when ids came from reading order (before ADR 0063) are found again by their path.
  let mut by_path: IndexMap<String, Vec<String>> = IndexMap::new();
  for l in &tree { by_path.entry(tree_path(&by_ext, l)).or_default().push(st(l, "externalId").into()); }
  for (ext, l) in have.clone() {
    if ext.is_empty() || by_ext.contains_key(&ext) { continue; }
    let cands: Vec<String> = by_path.get(&glue_path(store, &l, top_id.as_deref())).into_iter().flatten().filter(|x| !have.contains_key(*x)).cloned().collect();
    if let Some(c) = cands.first() {
      let origin = with(get(&l, "origin").unwrap_or(&Value::Null), "externalId", json!(c));
      store.put_list(with(&l, "origin", origin));
      have.shift_remove(&ext);
      let now = store.lists.get(st(&l, "id")).cloned().unwrap_or(Value::Null);
      have.insert(c.clone(), now);
    }
  }

  // Renamed where the id comes from the name (rekordbox XML, Traktor folders, Serato crates): a list gone since the
  // last read and a new one in the same place with the same songs (or at the same spot among its siblings) are the same
  // list. Parents first, so a renamed folder takes its lists along.
  if let Some(prev) = prev {
    let (mut renamed, mut taken): (IndexMap<String, String>, IndexSet<String>) = (IndexMap::new(), IndexSet::new());
    let spot = |list: &[Value], i: usize| list[..i].iter().filter(|x| same_parent(get(x, "parent"), get(&list[i], "parent"))).count();
    static FROM_FILE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[cf]:").unwrap());
    // Only ids made from names: where ids are the app's own (Engine DJ, Traktor's UUIDs), a list gone and another new
    // are just that.
    let from_name = |l: &Value| { let b = format!("{}/{}", st(l, "parent"), st(l, "name")); let e = st(l, "externalId"); e == b || e.starts_with(&format!("{b}#")) || FROM_FILE.is_match(e) };
    for (oi, old) in prev.iter().enumerate() {
      let oext = st(old, "externalId").to_string();
      let copy = have.get(&oext).cloned();
      if by_ext.contains_key(&oext) || !from_name(old) { continue; }
      let parent: Option<String> = get(old, "parent").and_then(Value::as_str).filter(|p| !p.is_empty()).map(|p| renamed.get(p).cloned().unwrap_or_else(|| p.to_string()));
      let parent_v = parent.as_ref().map(|p| json!(p));
      let cands: Vec<usize> = (0..tree.len()).filter(|&i| { let s = &tree[i]; let e = st(s, "externalId"); !was.contains_key(e) && !taken.contains(e) && st(s, "kind") == st(old, "kind") && same_parent(get(s, "parent"), parent_v.as_ref()) }).collect();
      let same: Vec<usize> = cands.iter().copied().filter(|&i| songs(&tree[i]) == songs(old)).collect();
      let there: Vec<usize> = cands.iter().copied().filter(|&i| spot(&tree, i) == spot(prev, oi)).collect();
      let pick = if same.len() == 1 { same[0] } else if there.len() == 1 { there[0] } else { continue };
      let pext = st(&tree[pick], "externalId").to_string();
      taken.insert(pext.clone());
      renamed.insert(oext.clone(), pext.clone());
      was.insert(pext.clone(), old.clone());   // compared with what it was: a rename is a change
      if let Some(copy) = copy {
        let u = with(&copy, "origin", with(get(&copy, "origin").unwrap_or(&Value::Null), "externalId", json!(pext)));
        store.put_list(u.clone());
        have.shift_remove(&oext);
        have.insert(pext, u);
      }
    }
  }

  // Gone from the library: the copy goes (the user's own lists inside it move up first), but only when a read a minute
  // later still lacks it, and never after a read that lost most of the library. One GLUE can't find in the library as
  // it was last read isn't deleted: it becomes the user's own list.
  let incomplete = prev.is_some_and(|p| p.len() >= 4 && (tree.len() as f64) < p.len() as f64 / 2.0);
  let mut next_pending = Map::new();
  for (ext, l) in have.clone() {
    let id = st(&l, "id").to_string();
    if ext.is_empty() || by_ext.contains_key(&ext) || !store.lists.contains_key(&id) { continue; }
    // Kept in step both ways (ADR 0171): GLUE Home asks the user whether it goes from GLUE too.
    if truthy(get(src, "sync")) { continue; }
    let waiting = pending.get(&ext);
    if !was.contains_key(&ext) && waiting.is_none() { store.put_list(with(&l, "origin", Value::Null)); r.removed += 1; continue; }
    if incomplete { r.mark_incomplete(); if let Some(w) = waiting { next_pending.insert(ext.clone(), w.clone()); } continue; }
    if waiting.is_none_or(|w| (at as f64) - w.as_f64().unwrap_or(f64::NAN) < GONE_AFTER as f64) { next_pending.insert(ext.clone(), waiting.cloned().unwrap_or(json!(at))); r.hold(); continue; }
    let kids: Vec<Value> = store.lists.values().filter(|c| st(c, "parentId") == id && get(c, "parentId").is_some_and(Value::is_string) && origin_str(c, "sourceId") != Some(&src_id)).cloned().collect();
    for c in kids { store.put_list(with(&c, "parentId", get(&l, "parentId").cloned().unwrap_or(Value::Null))); }
    store.delete_list(&id);
    r.removed += 1;
  }
  let mut have = copies(store, &src_id);

  // Changed in the library: name, kind and songs follow; so does the place, while GLUE's copy is still among the
  // library's copies (a copy the user moved elsewhere stays there).
  for (ext, l) in have.clone() {
    let (Some(s), p) = (by_ext.get(&ext), was.get(&ext)) else { continue };
    if ext.is_empty() { continue; }
    let items = items_of(src, s);
    let moved = p.is_none_or(|p| !same_parent(get(p, "parent"), get(s, "parent")));
    let old_parent = get(&l, "parentId").cloned().unwrap_or(Value::Null);
    let mut parent_id = old_parent.clone();
    let pid = parent_id.as_str().filter(|x| !x.is_empty()).map(String::from);
    let in_library = pid.is_none() || pid == top_id || pid.as_ref().and_then(|x| store.lists.get(x)).and_then(|x| origin_str(x, "sourceId")) == Some(&src_id);
    if moved && in_library {
      let to = match get(s, "parent").and_then(Value::as_str).filter(|x| !x.is_empty()) { Some(sp) => have.get(sp).map(|x| st(x, "id").to_string()), None => top_id.clone() };
      if let Some(to) = to { parent_id = json!(to); }
    }
    let changed = p.is_none_or(|p| st(p, "name") != st(s, "name") || st(p, "kind") != st(s, "kind") || songs(p) != songs(s));
    if !changed && parent_id == old_parent { continue; }
    let mut u = with(&l, "name", get(s, "name").cloned().unwrap_or(Value::Null));
    u = with(&u, "kind", get(s, "kind").cloned().unwrap_or(Value::Null));
    u = with(&u, "items", if changed { Value::Array(items) } else { get(&l, "items").cloned().unwrap_or(Value::Null) });
    u = with(&u, "parentId", parent_id);
    store.put_list(u);
    r.updated += 1;
  }

  // New in the library, inside a folder GLUE has whole: it comes in too (parents before children).
  for s in &tree {
    let e = st(s, "externalId");
    if have.contains_key(e) { continue; }
    let parent = match get(s, "parent").and_then(Value::as_str).filter(|x| !x.is_empty()) { Some(p) => have.get(p).cloned(), None => top.clone() };
    let Some(parent) = parent else { continue };
    if get(&parent, "origin").and_then(|o| get(o, "chain")).is_some_and(|c| truthy(Some(c))) { continue; }
    let l = make_copy(store, src, s, st(&parent, "id"), false);
    have.insert(e.to_string(), l);
    r.added += 1;
  }
  order(store, src, &have);
  // What's waiting to go, kept with the library for its next read.
  if let Some(cur) = store.sources.get(&src_id).cloned() {
    let was_pending = get(&cur, "pendingGone").cloned().unwrap_or(json!({}));
    let next = Value::Object(next_pending);
    if stringify(&was_pending) != stringify(&next) {
      let mut rest = cur.as_object().cloned().unwrap_or_default();
      rest.shift_remove("pendingGone");
      if next.as_object().is_some_and(|o| !o.is_empty()) { rest.insert("pendingGone".into(), next); }
      store.put_source(Value::Object(rest));
    }
  }
  r
}

pub(crate) fn make_copy<D: Dir>(store: &mut Store<D>, src: &Value, s: &Value, parent_id: &str, chain: bool) -> Value {
  let mut origin = Map::new();
  origin.insert("sourceId".into(), get(src, "id").cloned().unwrap_or(Value::Null));
  origin.insert("externalId".into(), get(s, "externalId").cloned().unwrap_or(Value::Null));
  if chain { origin.insert("chain".into(), json!(true)); }
  let id = store.new_id();
  let l = json!({
    "schemaVersion": 1, "id": id, "kind": get(s, "kind").cloned().unwrap_or(Value::Null), "name": get(s, "name").cloned().unwrap_or(Value::Null),
    "parentId": parent_id, "position": 1_000_000, "notes": "", "items": if chain { vec![] } else { items_of(src, s) }, "origin": origin, "createdAt": store.now().1,
  });
  store.put_list(l.clone());
  l
}

/// Inside the library's copies, its lists keep the library's order; the user's own come after.
fn order<D: Dir>(store: &mut Store<D>, src: &Value, have: &IndexMap<String, Value>) {
  let src_id = st(src, "id");
  let rank: IndexMap<String, usize> = arr(src, "tree").iter().enumerate().map(|(i, l)| (st(l, "externalId").to_string(), i)).collect();
  let parents: IndexSet<String> = have.values().map(|l| st(l, "id").to_string()).collect();
  for pid in parents {
    let mut kids: Vec<Value> = store.lists.values().filter(|c| get(c, "parentId").and_then(Value::as_str) == Some(pid.as_str())).cloned().collect();
    let key = |c: &Value| -> f64 {
      match origin_str(c, "externalId").filter(|_| origin_str(c, "sourceId") == Some(src_id)).and_then(|e| rank.get(e)) { Some(&i) => i as f64, None => 1e7 + get(c, "position").and_then(Value::as_f64).unwrap_or(f64::NAN) }
    };
    kids.sort_by(|a, b| (key(a) - key(b)).partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal));
    for (i, c) in kids.iter().enumerate() { if get(c, "position").and_then(Value::as_f64) != Some(i as f64) { store.put_list(with(c, "position", json!(i))); } }
  }
}

static TOP_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]*\([^\n\r\x{2028}\x{2029}]*\)$").unwrap());
fn top_name(src: &Value) -> String { let n = st(src, "name"); let t = TOP_NAME.replace(n, ""); if t.is_empty() { n.to_string() } else { t.into_owned() } }

/// Bring lists of the library into GLUE (a folder with everything in it; '' the whole library), under the library's own
/// folder, their folders on the way made as holders (`importLists`). How many came in.
pub fn import_lists<D: Dir>(store: &mut Store<D>, src: &Value, ids: &[String]) -> usize {
  let tree = arr(src, "tree");
  let by_ext: IndexMap<String, Value> = tree.iter().map(|l| (st(l, "externalId").to_string(), l.clone())).collect();
  let mut have = copies(store, st(src, "id"));
  if !have.contains_key("") {
    let position = store.lists.values().filter(|l| !truthy(get(l, "parentId"))).count();
    let id = store.new_id();
    let top = json!({
      "schemaVersion": 1, "id": id, "kind": "folder", "name": top_name(src), "parentId": null, "position": position,
      "notes": format!("From {}", glue_store::project::str_of(get(src, "fileName").unwrap_or(&Value::Null))), "items": [],
      "origin": { "sourceId": get(src, "id").cloned().unwrap_or(Value::Null), "externalId": "", "chain": true }, "createdAt": store.now().1,
    });
    store.put_list(top.clone());
    have.insert(String::new(), top);
  }
  let mut im = Importer { store, src, by_ext: &by_ext, have, n: 0 };
  for ext in ids {
    if ext.is_empty() {
      let top = im.have[""].clone();
      im.whole(&top);
      for s in &tree { if !truthy(get(s, "parent")) { im.ensure(Some(st(s, "externalId")), false); } }
    } else if by_ext.contains_key(ext) { im.ensure(Some(ext), false); } else { continue; }
    // A folder comes with everything in it.
    if ext.is_empty() { for s in &tree { if !truthy(get(s, "parent")) { im.inside(st(s, "externalId"), &tree); } } } else { im.inside(ext, &tree); }
  }
  let (n, have) = (im.n, im.have);
  order(store, src, &have);
  n
}
struct Importer<'a, D: Dir> { store: &'a mut Store<D>, src: &'a Value, by_ext: &'a IndexMap<String, Value>, have: IndexMap<String, Value>, n: usize }
impl<D: Dir> Importer<'_, D> {
  /// A holder imported itself becomes whole: its own songs, and from now on the library's new lists in it.
  fn whole(&mut self, l: &Value) -> Value {
    let chained = get(l, "origin").and_then(|o| get(o, "chain")).is_some_and(|c| truthy(Some(c)));
    if !chained { return l.clone(); }
    let mut origin = get(l, "origin").and_then(Value::as_object).cloned().unwrap_or_default();
    origin.shift_remove("chain");
    let e = origin.get("externalId").and_then(Value::as_str).unwrap_or("").to_string();
    let items = match self.by_ext.get(&e) { Some(s) => Value::Array(items_of(self.src, s)), None => get(l, "items").cloned().unwrap_or(Value::Null) };
    let u = with(&with(l, "origin", Value::Object(origin)), "items", items);
    self.store.put_list(u.clone());
    self.have.insert(e, u.clone());
    u
  }
  fn ensure(&mut self, ext: Option<&str>, chain: bool) -> Value {
    let Some(ext) = ext.filter(|e| !e.is_empty()) else { return self.have[""].clone() };
    if let Some(got) = self.have.get(ext).cloned() { return if chain { got } else { self.whole(&got) }; }
    let s = self.by_ext[ext].clone();
    let parent = self.ensure(get(&s, "parent").and_then(Value::as_str), true);
    let l = make_copy(self.store, self.src, &s, st(&parent, "id"), chain);
    self.have.insert(ext.to_string(), l.clone());
    self.n += 1;
    l
  }
  fn inside(&mut self, id: &str, tree: &[Value]) {
    for s in tree { if get(s, "parent").and_then(Value::as_str) == Some(id) { let e = st(s, "externalId").to_string(); self.ensure(Some(&e), false); self.inside(&e, tree); } }
  }
}
