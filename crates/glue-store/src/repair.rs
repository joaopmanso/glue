//! src/core/shared/repair.ts: a shared collection's parts written under the wrong computer, folded back into the
//! right one (ADR 0108).
use crate::json::{js_gt, js_keys, locale_cmp, Obj};
use crate::project::{or, str_of, OLD_STAND_IN};
use indexmap::{IndexMap, IndexSet};
use serde_json::{json, Value};

pub struct FoldInput<'a> { pub meta: &'a Value, pub tracks: &'a IndexMap<String, Value>, pub analysis: &'a IndexMap<String, Value>, pub sources: &'a [Value] }

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Counts { pub copies_moved: u32, pub copies_dropped: u32, pub analyses_moved: u32, pub twins: u32 }

pub struct FoldResult { pub meta: Value, pub tracks: IndexMap<String, Value>, pub analysis: IndexMap<String, Value>, pub sources: Vec<Value>, pub twins: Vec<(String, String)>, pub counts: Counts }

fn get<'a>(o: &'a Value, k: &str) -> Option<&'a Value> { o.as_object().and_then(|o| o.get(k)) }
fn obj(v: Option<&Value>) -> Obj { v.and_then(|v| v.as_object()).cloned().unwrap_or_default() }

/// `strayIds`: the ids a GLUE folder's parts were wrongly written under.
pub fn stray_ids(meta: &Value, into: &str, folder: &str) -> Vec<String> {
  let mut out: IndexSet<String> = IndexSet::new();
  let members = obj(get(meta, "members"));
  for id in js_keys(&members) {
    if id != into && (id == OLD_STAND_IN || get(&members[id], "profile").and_then(|p| p.as_str()) == Some(folder)) { out.insert(id.clone()); }
  }
  if crate::project::truthy(get(meta, "rootsBy").and_then(|r| get(r, OLD_STAND_IN))) { out.insert(OLD_STAND_IN.into()); }
  out.into_iter().collect()
}

fn has_stand_in(v: &Value, k: &str) -> bool { crate::project::truthy(get(v, k).and_then(|c| get(c, OLD_STAND_IN))) }

/// `needsFold`.
pub fn needs_fold(input: &FoldInput, into: &str, folder: &str) -> bool {
  if !stray_ids(input.meta, into, folder).is_empty() { return true; }
  if let Some(m) = get(input.meta, "members").and_then(|m| get(m, into)) {
    if get(m, "profile").and_then(|p| p.as_str()) != Some(folder) { return true; }
  }
  if input.tracks.values().any(|t| has_stand_in(t, "copies")) { return true; }
  if input.analysis.values().any(|by| crate::project::truthy(get(by, OLD_STAND_IN))) { return true; }
  input.sources.iter().any(|s| get(s, "computer").and_then(|c| c.as_str()) == Some(OLD_STAND_IN))
}

fn same_file(a: &Value, b: &Value) -> bool {
  let n = Value::Null;
  ["rootId", "relPath", "fileKey"].iter().all(|k| or(get(a, k), &n) == or(get(b, k), &n))
}

/// `foldComputer`.
pub fn fold_computer(input: &FoldInput, into: &str, folder: &str, name: Option<&str>) -> FoldResult {
  let mut from: IndexSet<String> = stray_ids(input.meta, into, folder).into_iter().collect();
  if input.tracks.values().any(|t| has_stand_in(t, "copies")) { from.insert(OLD_STAND_IN.into()); }
  if input.analysis.values().any(|by| crate::project::truthy(get(by, OLD_STAND_IN))) { from.insert(OLD_STAND_IN.into()); }
  if input.sources.iter().any(|s| get(s, "computer").and_then(|c| c.as_str()) == Some(OLD_STAND_IN)) { from.insert(OLD_STAND_IN.into()); }
  from.shift_remove(into);
  let mut counts = Counts::default();

  // The collection's file: the computer's entry names this folder; its music folders take the strays'.
  let mut members = obj(get(input.meta, "members"));
  let mut roots_by = obj(get(input.meta, "rootsBy"));
  let mut roots: Vec<Value> = roots_by.get(into).and_then(|r| r.as_array()).cloned().unwrap_or_default();
  for f in &from {
    for r in roots_by.get(f).and_then(|r| r.as_array()).cloned().unwrap_or_default() {
      if !roots.iter().any(|x| get(x, "id") == get(&r, "id")) { roots.push(r); }
    }
    roots_by.shift_remove(f);
    members.shift_remove(f);
  }
  if !roots.is_empty() || crate::project::truthy(roots_by.get(into)) { roots_by.insert(into.to_string(), Value::Array(roots)); }
  let old_name = members.get(into).and_then(|m| get(m, "name")).filter(|v| !v.is_null()).cloned();
  members.insert(into.to_string(), json!({ "profile": folder, "name": old_name.unwrap_or_else(|| json!(name.unwrap_or("This computer"))) }));
  let mut meta = input.meta.as_object().cloned().unwrap_or_default();
  meta.insert("members".into(), Value::Object(members));
  meta.insert("rootsBy".into(), Value::Object(roots_by));

  // Each song's copies.
  let mut tracks: IndexMap<String, Value> = IndexMap::new();
  for (id, t) in input.tracks {
    let copies0 = obj(get(t, "copies"));
    if !copies0.keys().any(|c| from.contains(c)) { continue; }
    let mut copies = copies0;
    for f in &from {
      let Some(c) = copies.get(f).cloned() else { continue };
      if !crate::project::truthy(Some(&c)) { continue; }
      copies.shift_remove(f);
      if !crate::project::truthy(copies.get(into)) { copies.insert(into.to_string(), c); counts.copies_moved += 1; } else { counts.copies_dropped += 1; }
    }
    let mut n = t.as_object().cloned().unwrap_or_default();
    n.insert("copies".into(), Value::Object(copies));
    tracks.insert(id.clone(), Value::Object(n));
  }

  // Analyses: the newer one is the computer's.
  let mut analysis: IndexMap<String, Value> = IndexMap::new();
  for (id, by) in input.analysis {
    let Some(b) = by.as_object() else { continue };
    if !b.keys().any(|c| from.contains(c)) { continue; }
    let mut out = b.clone();
    for f in &from {
      let Some(a) = out.get(f).cloned() else { continue };
      if !crate::project::truthy(Some(&a)) { continue; }
      out.shift_remove(f);
      let cur = out.get(into).cloned();
      let zero = json!(0);
      if !crate::project::truthy(cur.as_ref()) || js_gt(Some(or(get(&a, "at"), &zero)), Some(or(cur.as_ref().and_then(|c| get(c, "at")), &zero))) {
        out.insert(into.to_string(), a); counts.analyses_moved += 1;
      }
    }
    analysis.insert(id.clone(), Value::Object(out));
  }

  // DJ libraries read under a stray id.
  let sources: Vec<Value> = input.sources.iter().filter(|s| get(s, "computer").and_then(|c| c.as_str()).is_some_and(|c| !c.is_empty() && from.contains(c)))
    .map(|s| { let mut n = s.as_object().cloned().unwrap_or_default(); n.insert("computer".into(), json!(into)); Value::Object(n) }).collect();

  // The same file twice on this computer: the newer row folds into the older one.
  let all = |id: &str| -> Value { tracks.get(id).or_else(|| input.tracks.get(id)).cloned().unwrap_or(Value::Null) };
  let added = |id: &str| -> String { get(&all(id), "addedAt").map(str_of_or_empty).unwrap_or_default() };
  let mut ids: Vec<String> = input.tracks.keys().cloned().collect();
  ids.sort_by(|a, b| locale_cmp(&added(a), &added(b)).then_with(|| locale_cmp(a, b)));
  let mut by_file: IndexMap<String, String> = IndexMap::new();
  let mut twins = vec![];
  let empty = json!("");
  for id in ids {
    let t = all(&id);
    let Some(c) = get(&t, "copies").and_then(|c| get(c, into)).filter(|c| crate::project::truthy(Some(c))) else { continue };
    if !crate::project::truthy(get(c, "relPath")) && !crate::project::truthy(get(c, "fileKey")) { continue; }
    let k = format!("{}|{}|{}", str_of(or(get(c, "rootId"), &empty)), str_of(or(get(c, "relPath"), &empty)), str_of(or(get(c, "fileKey"), &empty)));
    match by_file.get(&k) {
      Some(first) => {
        let fc = get(&all(first), "copies").and_then(|cc| get(cc, into)).cloned().unwrap_or(Value::Null);
        if same_file(&fc, c) && (tracks.contains_key(&id) || tracks.contains_key(first)) { twins.push((id.clone(), first.clone())); }
      }
      None => { by_file.insert(k, id.clone()); }
    }
  }
  counts.twins = twins.len() as u32;
  FoldResult { meta: Value::Object(meta), tracks, analysis, sources, twins, counts }
}

fn str_of_or_empty(v: &Value) -> String { if v.is_null() { String::new() } else { str_of(v) } }
