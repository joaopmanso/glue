//! src/core/shared/project.ts: a shared collection's records as this computer sees them (ADR 0094), and back.
//! Records are kept as JSON objects; every step is the TypeScript's, key for key.
use crate::json::{js_keys, utf16_cmp, Obj};
use serde_json::{json, Value};

/// A computer's copy of a song (`COPY_FIELDS`).
pub const COPY_FIELDS: [&str; 11] = ["status", "rootId", "relPath", "fileKey", "filePath", "importPath", "aka", "size", "mtime", "unwritten", "sources"];
/// Song info written into files (src/core/library/tags.ts `INFO_FIELDS`).
pub const INFO_FIELDS: [&str; 8] = ["title", "artist", "album", "genre", "label", "comment", "year", "grouping"];
/// The old stand-in id, never written into a shared collection (ADR 0108).
pub const OLD_STAND_IN: &str = "this-computer";

/// `Here`: this computer, the collection, its members, each computer's music folders.
#[derive(Debug, Clone, PartialEq)]
pub struct Here { pub me: String, pub collection: String, pub members: Obj, pub roots_by: Option<Obj> }

pub fn unknown_computer(me: Option<&str>) -> bool { me.is_none_or(|m| m.is_empty() || m == OLD_STAND_IN) }

/// JavaScript truthiness of a value that may be absent.
pub fn truthy(v: Option<&Value>) -> bool {
  match v { None | Some(Value::Null) => false, Some(Value::Bool(b)) => *b, Some(Value::Number(n)) => n.as_f64().is_some_and(|x| x != 0.0 && !x.is_nan()), Some(Value::String(s)) => !s.is_empty(), _ => true }
}
/// `a ?? b`: a unless it's absent or null.
pub fn or<'a>(a: Option<&'a Value>, b: &'a Value) -> &'a Value { match a { None | Some(Value::Null) => b, Some(v) => v } }
fn get<'a>(o: &'a Value, k: &str) -> Option<&'a Value> { o.as_object().and_then(|o| o.get(k)) }
fn obj(v: Option<&Value>) -> Obj { v.and_then(|v| v.as_object()).cloned().unwrap_or_default() }

/// `writesFor`: may this GLUE folder write computer `me`'s parts?
pub fn writes_for(members: Option<&Obj>, me: Option<&str>, folder: &str) -> bool {
  if unknown_computer(me) { return false; }
  match members.and_then(|m| m.get(me.unwrap())).and_then(|m| get(m, "profile")) {
    None | Some(Value::Null) => true,
    Some(Value::String(s)) if s.is_empty() => true,
    Some(h) => h == folder,
  }
}

fn pick(o: &Obj, ks: &[&str]) -> Obj { let mut out = Obj::new(); for k in ks { if let Some(v) = o.get(*k) { out.insert(k.to_string(), v.clone()); } } out }

/// Sorted as JavaScript's default `sort()`.
fn sorted(mut v: Vec<String>) -> Vec<String> { v.sort_by(|a, b| utf16_cmp(a, b)); v }

/// `toLocal`: the song as this computer shows it.
pub fn to_local(s: &Value, here: &Here) -> Value {
  let so = s.as_object().cloned().unwrap_or_default();
  let copies = obj(so.get("copies"));
  let mut common = so.clone();
  common.shift_remove("copies");
  let who: Vec<String> = js_keys(&copies).into_iter().cloned().collect();
  let names: Vec<Value> = who.iter().map(|c| or(here.members.get(c).and_then(|m| get(m, "name")), &json!(c)).clone()).collect();
  if let Some(mine) = copies.get(&here.me).and_then(|m| m.as_object()) {
    let mut t = common;
    for (k, v) in mine { t.insert(k.clone(), v.clone()); }
    t.insert("sources".into(), or(mine.get("sources"), &json!([])).clone());
    if who.len() > 1 { t.insert("onDevices".into(), Value::Array(names)); }
    return Value::Object(t);
  }
  // Another computer's: shown as it is there, played from there.
  let c = sorted(who.clone()).into_iter().next();
  let theirs = c.as_ref().and_then(|c| copies.get(c)).and_then(|v| v.as_object()).cloned();
  let th = |k: &str| theirs.as_ref().and_then(|t| t.get(k));
  let mut t = common;
  t.insert("status".into(), or(th("status"), &json!("unlinked")).clone());
  t.insert("rootId".into(), Value::Null);
  t.insert("relPath".into(), Value::Null);
  t.insert("importPath".into(), or(th("importPath"), &Value::Null).clone());
  t.insert("size".into(), or(th("size"), &Value::Null).clone());
  t.insert("mtime".into(), or(th("mtime"), &Value::Null).clone());
  t.insert("sources".into(), json!([]));
  t.insert("onDevices".into(), Value::Array(names));
  if let Some(c) = c {
    let folder = here.roots_by.as_ref().and_then(|r| r.get(&c)).and_then(|a| a.as_array())
      // `r.id === theirs?.rootId` (absent equals absent).
      .and_then(|a| a.iter().find(|r| get(r, "id") == th("rootId")))
      .and_then(|r| get(r, "name")).cloned();
    let rel = th("relPath").filter(|v| truthy(Some(v))).cloned();
    let mut remote = Obj::new();
    remote.insert("device".into(), json!(c));
    remote.insert("name".into(), or(here.members.get(&c).and_then(|m| get(m, "name")), &json!(c)).clone());
    if let Some(p) = here.members.get(&c).and_then(|m| get(m, "profile")) { remote.insert("profile".into(), p.clone()); }
    remote.insert("collection".into(), json!(here.collection));
    if let Some(id) = so.get("id") { remote.insert("id".into(), id.clone()); }
    if let Some(rel) = rel {
      let f = folder.filter(|f| truthy(Some(f))).map(|f| format!("{}/", str_of(&f))).unwrap_or_default();
      remote.insert("where".into(), json!(f + &str_of(&rel)));
    }
    t.insert("remote".into(), Value::Object(remote));
  }
  Value::Object(t)
}

/// A value as a string the way JavaScript concatenates it.
pub fn str_of(v: &Value) -> String { match v { Value::String(s) => s.clone(), Value::Number(n) => crate::json::num_str(n.as_f64().unwrap_or(f64::NAN)), Value::Null => "null".into(), Value::Bool(b) => b.to_string(), _ => crate::json::stringify(v) } }

/// `toShared`: the song as the shared collection holds it.
pub fn to_shared(t: &Value, here: &Here, prev: Option<&Value>) -> Value {
  let to = t.as_object().cloned().unwrap_or_default();
  let remote = to.get("remote").cloned();
  let mut common = to.clone();
  common.shift_remove("onDevices");
  common.shift_remove("remote");
  for k in COPY_FIELDS { common.shift_remove(k); }
  let mut copies = obj(prev.and_then(|p| get(p, "copies")));
  if !truthy(remote.as_ref()) && !unknown_computer(Some(&here.me)) { copies.insert(here.me.clone(), Value::Object(pick(&to, &COPY_FIELDS))); }
  // Song info changed here: every other computer writes it into its own file (ADR 0097).
  if let Some(was) = prev {
    let empty = json!("");
    let changed: Vec<&str> = INFO_FIELDS.iter().copied().filter(|f| or(common.get(*f), &empty) != or(get(was, f), &empty)).collect();
    if !changed.is_empty() {
      let keys: Vec<String> = js_keys(&copies).into_iter().cloned().collect();
      for c in keys {
        let cc = copies[&c].clone();
        if c == here.me || !truthy(get(&cc, "relPath")) || truthy(get(&cc, "fileKey")) { continue; }
        let mut list: Vec<Value> = get(&cc, "unwritten").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        for f in &changed { let f = json!(f); if !list.contains(&f) { list.push(f); } }
        let mut n = cc.as_object().cloned().unwrap_or_default();
        n.insert("unwritten".into(), Value::Array(dedup(list)));
        copies.insert(c, Value::Object(n));
      }
    }
  }
  common.insert("copies".into(), Value::Object(copies));
  Value::Object(common)
}

fn dedup(v: Vec<Value>) -> Vec<Value> { let mut out: Vec<Value> = vec![]; for x in v { if !out.contains(&x) { out.push(x); } } out }

/// `analysisHere`: this computer's analysis, else another's, else none.
pub fn analysis_here(by: Option<&Value>, me: &str) -> Option<Value> {
  let by = by?.as_object()?;
  match by.get(me) { Some(v) if !v.is_null() => Some(v.clone()), _ => sorted(by.keys().cloned().collect()).first().and_then(|k| by.get(k)).filter(|v| !v.is_null()).cloned() }
}
/// `analysisShared`: this computer's analysis into the shared record.
pub fn analysis_shared(a: &Value, me: &str, prev: Option<&Value>) -> Value {
  let mut out = obj(prev);
  if !unknown_computer(Some(me)) { out.insert(me.to_string(), a.clone()); }
  Value::Object(out)
}

/// `collectionHere`: the collection as this computer sees it.
pub fn collection_here(c: &Value, me: &str) -> Value {
  let mut rest = c.as_object().cloned().unwrap_or_default();
  let roots = rest.get("rootsBy").and_then(|r| get(r, me)).filter(|v| !v.is_null()).cloned().unwrap_or(json!([]));
  rest.shift_remove("rootsBy"); rest.shift_remove("members"); rest.shift_remove("shared");
  rest.insert("roots".into(), roots);
  Value::Object(rest)
}

/// `collectionShared`: this computer's view back into the shared file.
pub fn collection_shared(c: &Value, me: &str, prev: Option<&Value>, member: &Value, holds: bool) -> Value {
  let mut rest = c.as_object().cloned().unwrap_or_default();
  let roots = rest.shift_remove("roots").unwrap_or(json!([]));
  let prev_members = prev.and_then(|p| get(p, "members")).and_then(|m| m.as_object());
  let profile = get(member, "profile").and_then(|p| p.as_str()).unwrap_or("");
  let joins = writes_for(prev_members, Some(me), profile) && (holds || roots.as_array().is_some_and(|r| !r.is_empty()) || truthy(prev_members.and_then(|m| m.get(me))));
  rest.insert("shared".into(), json!(true));
  let mut roots_by = obj(prev.and_then(|p| get(p, "rootsBy")));
  if joins { roots_by.insert(me.to_string(), roots); }
  rest.insert("rootsBy".into(), Value::Object(roots_by));
  let mut members = obj(prev.and_then(|p| get(p, "members")));
  if joins { members.insert(me.to_string(), member.clone()); }
  rest.insert("members".into(), Value::Object(members));
  Value::Object(rest)
}

/// `meFor`: which member a GLUE folder's copy is, when nothing better says.
pub fn me_for(members: Option<&Obj>, pid: &str, device: Option<&str>) -> Option<String> {
  let empty = Obj::new();
  let members = members.unwrap_or(&empty);
  if let Some(d) = device { if members.contains_key(d) { return Some(d.to_string()); } }
  js_keys(members).into_iter().find(|m| members.get(*m).and_then(|x| get(x, "profile")).and_then(|p| p.as_str()) == Some(pid) && !unknown_computer(Some(m))).cloned()
    .or_else(|| device.map(String::from))
}
