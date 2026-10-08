//! A DJ library brought into a collection without duplicating songs (`store/merge.ts` `applyImport`, ADR 0020): a
//! record is the song whose imported path it has, or whose file the matcher finds; one GLUE knew without a file folds
//! into the song with the file once found; the library's playlists kept as its tree, GLUE's copies following it.
use crate::engine::resolve_engine;
use crate::linked::{get, st, sync_linked_lists, with, LinkReport};
use crate::types::*;
use glue_store::dir::Dir;
use glue_store::project::truthy;
use glue_store::store::Store;
use glue_store::tidy::{match_tracks, Linkable};
use indexmap::{IndexMap, IndexSet};
use serde_json::{json, Map, Value};

/// lists: the playlists and folders the library has; linked_lists: what changed in GLUE's copies of them; dropped:
/// songs that were only this library's records and it no longer has.
#[derive(Clone, Debug)]
pub struct ImportReport { pub source_id: String, pub tracks: usize, pub matched: usize, pub linked: usize, pub lists: usize, pub linked_lists: LinkReport, pub dropped: usize, pub entries: Option<Stats> }
impl ImportReport {
  pub fn to_json(&self) -> Value {
    let mut o = Map::new();
    o.insert("sourceId".into(), json!(self.source_id)); o.insert("tracks".into(), json!(self.tracks)); o.insert("matched".into(), json!(self.matched));
    o.insert("linked".into(), json!(self.linked)); o.insert("lists".into(), json!(self.lists)); o.insert("linkedLists".into(), self.linked_lists.to_json());
    o.insert("dropped".into(), json!(self.dropped));
    if let Some(s) = &self.entries { o.insert("entries".into(), stats_json(s)); }
    Value::Object(o)
  }
}
pub(crate) fn stats_json(st: &Stats) -> Value { json!({ "entries": st.entries, "matched": st.matched, "otherLibraries": st.other_libraries, "missingLibraries": st.missing_libraries, "gone": st.gone, "libraries": st.libraries }) }

fn text(v: &Value, k: &str) -> String { match get(v, k) { Some(Value::String(s)) => s.clone(), Some(Value::Null) | None => String::new(), Some(x) => glue_store::project::str_of(x) } }
fn number(v: &Value, k: &str) -> Option<f64> { get(v, k).and_then(Value::as_f64) }
fn opt_text(v: &Value, k: &str) -> Option<String> { match get(v, k) { Some(Value::String(s)) => Some(s.clone()), Some(Value::Null) | None => None, Some(x) => Some(glue_store::project::str_of(x)) } }
impl CuePoint {
  pub fn from_json(v: &Value) -> CuePoint { CuePoint { t: number(v, "t").unwrap_or(0.0), kind: text(v, "kind"), num: number(v, "num"), name: text(v, "name"), color: opt_text(v, "color"), end: number(v, "end") } }
}
impl ImportedTrack {
  pub fn from_json(v: &Value) -> ImportedTrack {
    let mut t = blank_track(text(v, "externalId"), text(v, "path"));
    t.title = text(v, "title"); t.artist = text(v, "artist"); t.album = text(v, "album"); t.genre = text(v, "genre"); t.label = text(v, "label");
    t.comment = text(v, "comment"); t.year = text(v, "year"); t.grouping = text(v, "grouping");
    t.duration = number(v, "duration"); t.bpm = number(v, "bpm"); t.key = opt_text(v, "key"); t.rating = number(v, "rating");
    t.play_count = number(v, "playCount"); t.date_added = opt_text(v, "dateAdded"); t.cues = number(v, "cues").unwrap_or(0.0) as usize;
    t.cue_list = get(v, "cueList").and_then(Value::as_array).into_iter().flatten().map(CuePoint::from_json).collect(); t.size = number(v, "size");
    t.grid = get(v, "grid").and_then(Grid::from_json);
    t
  }
}
impl ImportedLibrary {
  /// As the website sends it (an Engine set's entries as an object).
  pub fn from_json(v: &Value) -> ImportedLibrary {
    let app: &'static str = match st(v, "app") { "rekordbox" => "rekordbox", "engine" => "engine", "serato" => "serato", "traktor" => "traktor", "apple" => "apple", "m3u" => "m3u", _ => "other" };
    let list = |l: &Value| ImportedList { external_id: text(l, "externalId"), kind: if st(l, "kind") == "folder" { "folder" } else { "playlist" }, name: text(l, "name"), parent: opt_text(l, "parent"), items: get(l, "items").and_then(Value::as_array).into_iter().flatten().map(|x| x.as_str().unwrap_or("").to_string()).collect() };
    let engine = get(v, "engine").filter(|e| e.is_object()).map(|e| EngineSet {
      uuids: get(e, "uuids").and_then(Value::as_array).into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect(),
      entries: get(e, "entries").and_then(Value::as_object).into_iter().flatten().map(|(k, x)| (k.clone(), x.as_array().into_iter().flatten().filter_map(|y| y.as_str().map(String::from)).collect())).collect(),
    });
    let stats = get(v, "stats").filter(|s| s.is_object()).map(|s| { let n = |k: &str| number(s, k).unwrap_or(0.0) as usize; Stats { entries: n("entries"), matched: n("matched"), other_libraries: n("otherLibraries"), missing_libraries: n("missingLibraries"), gone: n("gone"), libraries: n("libraries") } });
    ImportedLibrary {
      app, name: text(v, "name"),
      tracks: get(v, "tracks").and_then(Value::as_array).into_iter().flatten().map(ImportedTrack::from_json).collect(),
      lists: get(v, "lists").and_then(Value::as_array).into_iter().flatten().map(list).collect(), stats, engine,
    }
  }
}

fn path_key(p: &str) -> String { norm_path(p).to_lowercase() }
const INFO_FIELDS: [&str; 8] = ["title", "artist", "album", "genre", "label", "comment", "year", "grouping"];
/// `fillInfo`: a song's empty fields from the library's record, never those edited in GLUE.
fn fill_info(t: &mut Map<String, Value>, it: &ImportedTrack) {
  let edited: Vec<String> = t.get("edited").and_then(Value::as_array).into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect();
  for k in INFO_FIELDS {
    let from = match k { "title" => &it.title, "artist" => &it.artist, "album" => &it.album, "genre" => &it.genre, "label" => &it.label, "comment" => &it.comment, "year" => &it.year, _ => &it.grouping };
    if !truthy(t.get(k)) && !from.is_empty() && !edited.iter().any(|e| e == k) { t.insert(k.into(), json!(from)); }
  }
}
/// `blankLibTrack`: a new song without a file.
fn blank_lib_track<D: Dir>(store: &mut Store<D>, file_name: &str) -> Value {
  let id = store.new_id();
  json!({
    "id": id, "status": "unlinked", "rootId": null, "relPath": null, "importPath": null, "fileName": file_name, "size": null, "mtime": null,
    "title": "", "artist": "", "album": "", "genre": "", "label": "", "comment": "", "year": "", "duration": null, "format": null, "addedAt": store.now().1, "sources": [],
  })
}
fn opt(x: Option<f64>) -> Value { x.map_or(Value::Null, num_value) }
fn opt_s(x: &Option<String>) -> Value { x.as_ref().map_or(Value::Null, |s| json!(s)) }
fn has_file(t: &Value) -> bool { (truthy(get(t, "rootId")) && truthy(get(t, "relPath"))) || truthy(get(t, "fileKey")) }

/// The songs an earlier Engine DJ import holds of libraries this one doesn't have (another drive's), so a new read of
/// the set keeps them and resolves playlist entries across all of them (`carriedEngine`).
fn carried_engine<D: Dir>(store: &Store<D>, existing: Option<&Value>, lib: &ImportedLibrary) -> Vec<ImportedTrack> {
  let have: IndexSet<&str> = lib.engine.as_ref().map(|e| e.uuids.iter().map(String::as_str).collect()).unwrap_or_default();
  let mut out = vec![];
  for s in existing.and_then(|e| get(e, "tracks")).and_then(Value::as_array).into_iter().flatten() {
    let ext = st(s, "externalId");
    let uuid = match ext.find('/') { Some(i) if i > 0 => &ext[..i], _ => "" };
    if uuid.is_empty() || have.contains(uuid) { continue; }
    let mut it = blank_track(ext.into(), text(s, "path"));
    if let Some(t) = store.tracks.get(st(s, "trackId")) {
      it.title = text(t, "title"); it.artist = text(t, "artist"); it.album = text(t, "album"); it.genre = text(t, "genre"); it.label = text(t, "label");
      it.comment = text(t, "comment"); it.year = text(t, "year"); it.duration = number(t, "duration"); it.size = number(t, "size");
    }
    it.bpm = number(s, "bpm"); it.key = opt_text(s, "key"); it.rating = number(s, "rating"); it.play_count = number(s, "playCount");
    it.date_added = opt_text(s, "dateAdded"); it.cues = number(s, "cues").unwrap_or(0.0) as usize;
    it.cue_list = get(s, "cueList").and_then(Value::as_array).into_iter().flatten().map(CuePoint::from_json).collect();
    it.grid = get(s, "grid").and_then(Grid::from_json);
    out.push(it);
  }
  out
}

/// `applyImport`.
pub fn apply_import<D: Dir>(store: &mut Store<D>, mut lib: ImportedLibrary, file_name: &str) -> ImportReport {
  let existing = store.sources.values().find(|s| st(s, "app") == lib.app && st(s, "fileName") == file_name).cloned();
  // Engine DJ: one source for the whole set of libraries (they share one playlist tree).
  if lib.engine.is_some() { let carried = carried_engine(store, existing.as_ref(), &lib); lib = resolve_engine(lib, &carried); }
  // A re-read with less than half the playlists of the last one is ignored whole: the last good read stays (ADR 0090).
  let had = existing.as_ref().and_then(|e| get(e, "tree")).and_then(Value::as_array).map_or(0, Vec::len);
  if let Some(e) = existing.as_ref().filter(|_| had >= 4 && (lib.lists.len() as f64) < had as f64 / 2.0) {
    return ImportReport { source_id: st(e, "id").into(), tracks: lib.tracks.len(), matched: 0, linked: 0, lists: lib.lists.len(), linked_lists: LinkReport::incomplete_read(), dropped: 0, entries: lib.stats.clone() };
  }
  let source_id = match &existing { Some(e) => st(e, "id").to_string(), None => store.new_id() };
  // Records the user linked to a song (ADR 0124) first; a song's own import path wins over another's link.
  let mut by_import_path: IndexMap<String, Value> = IndexMap::new();
  for t in store.tracks.values() { if !truthy(get(t, "remote")) { for p in get(t, "aka").and_then(Value::as_array).into_iter().flatten() { by_import_path.insert(path_key(p.as_str().unwrap_or("")), t.clone()); } } }
  for t in store.tracks.values() { if truthy(get(t, "importPath")) && !truthy(get(t, "remote")) { by_import_path.insert(path_key(st(t, "importPath")), t.clone()); } }

  let mut ext2track: IndexMap<String, Value> = IndexMap::new();
  let mut fresh: Vec<Value> = vec![];
  // A record GLUE knows as a song without a file is matched again: once its file is found, that song folds into the
  // one with the file.
  let (mut stray, mut stray_into): (IndexMap<String, Value>, IndexMap<String, Value>) = (IndexMap::new(), IndexMap::new());
  let mut unmatched: Vec<&ImportedTrack> = vec![];
  for it in &lib.tracks {
    let Some(t) = by_import_path.get(&path_key(&it.path)) else { unmatched.push(it); continue };
    ext2track.insert(it.external_id.clone(), t.clone());
    if st(t, "status") == "linked" || truthy(get(t, "fileKey")) { continue; }
    stray.insert(it.external_id.clone(), t.clone());
    unmatched.push(it);
  }
  let matched = lib.tracks.len() - unmatched.len() + stray.len();
  let (files, by_file) = store.linked_files();
  let linkable: Vec<Linkable> = unmatched.iter().map(|it| Linkable {
    id: it.external_id.clone(), import_path: it.path.clone(), file_name: base_name(&it.path),
    size: it.size.map(num_value).or_else(|| stray.get(&it.external_id).and_then(|t| get(t, "size")).filter(|x| !x.is_null()).cloned()).unwrap_or(Value::Null),
  }).collect();
  let (links, root_paths) = match_tracks(&linkable, &files);
  for it in &unmatched {
    let f = links.get(&it.external_id);
    let to = f.and_then(|&f| store.tracks.get(&by_file[f])).cloned();
    if let Some(known) = stray.get(&it.external_id) {
      if let Some(to) = to.filter(|to| st(to, "id") != st(known, "id")) { ext2track.insert(it.external_id.clone(), to.clone()); stray_into.insert(st(known, "id").into(), to); }
      continue;
    }
    let t = match to { Some(t) => t, None => { let mut t = blank_lib_track(store, &base_name(&it.path)); t["size"] = opt(it.size); fresh.push(t.clone()); t } };
    ext2track.insert(it.external_id.clone(), t);
  }
  // Where the music folders are (`inferRoots`): from the absolute paths that matched.
  let mut changed = false;
  if let Some(roots) = store.meta.get_mut("roots").and_then(Value::as_array_mut) {
    for r in roots { if let Some(p) = root_paths.get(st(r, "id")) { if !truthy(get(r, "absPath")) { r["absPath"] = json!(p); changed = true; } } }
  }
  if changed { store.save_meta(); }

  // The same song elsewhere: a record whose own file isn't in a music folder, with the same file name and size (1 kB of
  // slack: Traktor's sizes are in kB) as a song that has its file, is that song. A song an earlier import left without
  // a file joins it.
  let mut with_file: IndexMap<String, Vec<Value>> = IndexMap::new();
  for t in store.tracks.values() {
    if !truthy(get(t, "remote")) && st(t, "status") == "linked" && truthy(get(t, "size")) && has_file(t) { with_file.entry(st(t, "fileName").to_lowercase()).or_default().push(t.clone()); }
  }
  let mut absorbed = stray_into.clone();
  let fresh_ids: IndexSet<String> = fresh.iter().map(|t| st(t, "id").to_string()).collect();
  for it in &lib.tracks {
    let t = ext2track[&it.external_id].clone();
    if st(&t, "status") == "linked" && has_file(&t) { continue; }
    let Some(size) = it.size.or_else(|| number(&t, "size")).filter(|&s| s != 0.0 && !s.is_nan()) else { continue };
    let same: Vec<&Value> = with_file.get(&base_name(&it.path).to_lowercase()).into_iter().flatten().filter(|x| st(x, "id") != st(&t, "id") && (number(x, "size").unwrap_or(0.0) - size).abs() <= 1024.0).collect();
    if same.len() != 1 { continue; }
    ext2track.insert(it.external_id.clone(), same[0].clone());
    if !fresh_ids.contains(st(&t, "id")) { absorbed.insert(st(&t, "id").into(), same[0].clone()); }
  }
  let used: IndexSet<String> = ext2track.values().map(|t| st(t, "id").to_string()).collect();
  fresh.retain(|t| used.contains(st(t, "id")));
  if !absorbed.is_empty() {
    store.absorb_tracks(&absorbed);
    // Carry on from what was just saved (and never from a song that's gone).
    for t in ext2track.values_mut() {
      let id = absorbed.get(st(t, "id")).map_or_else(|| st(t, "id").to_string(), |a| st(a, "id").to_string());
      *t = store.tracks.get(&id).cloned().or_else(|| absorbed.get(st(t, "id")).cloned()).unwrap_or_else(|| t.clone());
    }
  }

  let mut touched: IndexMap<String, Value> = IndexMap::new();
  let mut source_tracks = vec![];
  for it in &lib.tracks {
    let mut t = ext2track[&it.external_id].as_object().cloned().unwrap_or_default();
    if !truthy(t.get("importPath")) { t.insert("importPath".into(), json!(it.path)); }
    fill_info(&mut t, it);
    if t.get("duration").is_none_or(Value::is_null) && it.duration.is_some_and(|d| d != 0.0 && !d.is_nan()) { t.insert("duration".into(), opt(it.duration)); }
    let mut sources: Vec<Value> = t.get("sources").and_then(Value::as_array).cloned().unwrap_or_default();
    if !sources.iter().any(|s| s.as_str() == Some(&source_id)) { sources.push(json!(source_id)); t.insert("sources".into(), Value::Array(sources)); }
    // The DJ app's rating becomes the song's own when it hasn't been rated in GLUE.
    if t.get("rating").is_none_or(Value::is_null) && it.rating.is_some_and(|r| r != 0.0 && !r.is_nan()) { t.insert("rating".into(), num_value(it.rating.unwrap().clamp(0.0, 5.0))); }
    let t = Value::Object(t);
    touched.insert(st(&t, "id").into(), t.clone());
    ext2track.insert(it.external_id.clone(), t.clone());
    let mut s = json!({ "externalId": it.external_id, "trackId": st(&t, "id"), "bpm": opt(it.bpm), "key": opt_s(&it.key), "rating": opt(it.rating), "playCount": opt(it.play_count), "cues": it.cues, "dateAdded": opt_s(&it.date_added), "path": it.path });
    if !it.cue_list.is_empty() { s["cueList"] = Value::Array(it.cue_list.iter().map(CuePoint::to_json).collect()); }
    if let Some(g) = it.grid { s["grid"] = g.to_json(); }
    source_tracks.push(s);
  }
  store.put_tracks(touched.values().cloned().collect());
  // What the library no longer has: the song stops naming it; one without a file and without any other import was only
  // its record, and goes.
  let (mut stale, mut dropped) = (vec![], 0);
  let all: Vec<Value> = store.tracks.values().cloned().collect();
  for t in all {
    let srcs: Vec<Value> = get(&t, "sources").and_then(Value::as_array).cloned().unwrap_or_default();
    if touched.contains_key(st(&t, "id")) || truthy(get(&t, "remote")) || !srcs.iter().any(|s| s.as_str() == Some(&source_id)) { continue; }
    let rest: Vec<Value> = srcs.into_iter().filter(|s| s.as_str() != Some(&source_id)).collect();
    if rest.is_empty() && st(&t, "status") == "unlinked" && !truthy(get(&t, "fileKey")) { store.remove_track(st(&t, "id")); dropped += 1; } else { stale.push(with(&t, "sources", Value::Array(rest))); }
  }
  if !stale.is_empty() { store.put_tracks(stale); }

  // The library's playlists are kept as its tree, browsed in the sidebar and brought in on demand; the copies already in
  // GLUE follow it (ADR 0063).
  let tree: Vec<Value> = lib.lists.iter().map(ImportedList::to_json).collect();
  let mut src = json!({ "schemaVersion": 1, "id": source_id, "app": lib.app, "name": lib.name, "fileName": file_name, "importedAt": store.now().1, "tracks": source_tracks, "lists": lib.lists.len(), "tree": tree });
  if let Some(o) = existing.as_ref().and_then(|e| get(e, "origin")).filter(|o| truthy(Some(o))) { src["origin"] = o.clone(); }
  store.put_source(src.clone());
  let prev: Option<Vec<Value>> = existing.as_ref().and_then(|e| get(e, "tree")).and_then(Value::as_array).cloned();
  let pending = existing.as_ref().and_then(|e| get(e, "pendingGone")).and_then(Value::as_object).cloned().unwrap_or_default();
  let at = store.now().0;
  let linked_lists = sync_linked_lists(store, &src, prev.as_deref(), &pending, at);
  ImportReport { source_id, tracks: lib.tracks.len(), matched, linked: links.len(), lists: lib.lists.len(), linked_lists, dropped, entries: lib.stats.clone() }
}
