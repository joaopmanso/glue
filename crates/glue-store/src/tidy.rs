//! The repairs a collection gets when it opens (`store/merge.ts` `tidyTracks`, `copiesToJoin`, `joinCopies`, and
//! `core/library/match.ts` `matchTracks` for the links; ADR 0166: GLUE Home's too). Held to the website by the store
//! goldens `tidy` and `join`.
use crate::dir::Dir;
use crate::json::utf16_cmp;
use crate::project::{to_local, to_shared, truthy, unknown_computer};
use crate::store::Store;
use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> { v.as_object().and_then(|o| o.get(k)) }
fn s<'a>(v: &'a Value, k: &str) -> &'a str { get(v, k).and_then(|x| x.as_str()).unwrap_or("") }

/// A file a song may be (`FileEntry`): its path in its music folder, its size, where the folder is (`under`).
struct FileEntry { rel_path: String, size: Value, under: Option<String> }

fn segs(p: &str) -> Vec<String> { p.replace('\\', "/").split('/').filter(|x| !x.is_empty() && *x != "." && *x != "..").map(String::from).collect() }

/// Which file each song is (`matchTracks`'s links): the same file name, then the longest run of equal trailing path
/// segments (the folder's own place counting), the size breaking ties; anything still ambiguous stays unlinked.
/// `tracks`: (id, imported path, file name, size). Each file once.
fn match_tracks(tracks: &[(String, String, String, Value)], files: &[FileEntry]) -> IndexMap<String, usize> {
  let mut by_name: IndexMap<String, Vec<usize>> = IndexMap::new();
  for (i, f) in files.iter().enumerate() { by_name.entry(segs(&f.rel_path).pop().unwrap_or_default().to_lowercase()).or_default().push(i); }
  let (mut links, mut used): (IndexMap<String, usize>, IndexSet<usize>) = (IndexMap::new(), IndexSet::new());
  for (id, import, name, size) in tracks {
    let path = if import.is_empty() { name } else { import };
    let tl: Vec<String> = segs(path).iter().map(|x| x.to_lowercase()).collect();
    let cands: Vec<usize> = by_name.get(tl.last().map(String::as_str).unwrap_or("")).map(|v| v.iter().copied().filter(|i| !used.contains(i)).collect()).unwrap_or_default();
    if cands.is_empty() { continue; }
    let (mut best, mut best_score): (Vec<usize>, usize) = (vec![], 0);
    for f in cands {
      let fs: Vec<String> = segs(files[f].under.as_deref().unwrap_or("")).into_iter().chain(segs(&files[f].rel_path)).map(|x| x.to_lowercase()).collect();
      let mut k = 0;
      while k < fs.len() && k < tl.len() && fs[fs.len() - 1 - k] == tl[tl.len() - 1 - k] { k += 1; }
      if k > best_score { best_score = k; best = vec![f]; } else if k == best_score { best.push(f); }
    }
    if best.len() > 1 && truthy(Some(size)) { best.retain(|&f| files[f].size.as_f64() == size.as_f64()); }
    if best.len() != 1 { continue; }
    links.insert(id.clone(), best[0]);
    used.insert(best[0]);
  }
  links
}

static NUMBERED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r" \([0-9]+\)(\.[^.]*)$").unwrap());
/// A file as two computers name it (`fileKeyOf`): its name without " (2)", lowercase, and its size.
fn file_key(name: &str, size: &Value) -> String { NUMBERED.replace(name, "$1").to_lowercase() + "|" + &crate::json::stringify(size) }

impl<D: Dir> Store<D> {
  /// Tracks naming imports that are gone lose that name; one left without a file and without any import was only that
  /// import's record, and goes; tracks without a file are matched again by path and fold into the track that has it
  /// (`tidyTracks`). (unlinked, dropped, relinked).
  pub fn tidy_tracks(&mut self) -> (usize, usize, usize) {
    let (mut unlinked, mut dropped) = (0, 0);
    let (mut keep, mut drop) = (vec![], vec![]);
    for t in self.tracks.values() {
      if truthy(get(t, "remote")) { continue; }
      let all: Vec<Value> = get(t, "sources").and_then(|x| x.as_array()).cloned().unwrap_or_default();
      let sources: Vec<Value> = all.iter().filter(|x| x.as_str().is_some_and(|id| self.sources.contains_key(id))).cloned().collect();
      if sources.len() == all.len() { continue; }
      unlinked += all.len() - sources.len();
      if sources.is_empty() && s(t, "status") == "unlinked" && !truthy(get(t, "fileKey")) { drop.push(s(t, "id").to_string()); }
      else { let mut k = t.clone(); k["sources"] = Value::Array(sources); keep.push(k); }
    }
    if !keep.is_empty() { self.put_tracks(keep); }
    for id in drop { self.remove_track(&id); dropped += 1; }
    let strays: Vec<(String, String, String, Value)> = self.tracks.values()
      .filter(|t| s(t, "status") == "unlinked" && !truthy(get(t, "remote")) && !truthy(get(t, "fileKey")))
      .map(|t| (s(t, "id").into(), s(t, "importPath").into(), s(t, "fileName").into(), get(t, "size").cloned().unwrap_or(Value::Null))).collect();
    let mut relinked = 0;
    if !strays.is_empty() {
      // The songs with their file (`linkedFiles`): where each music folder is counts (its path, or its name).
      let place: IndexMap<String, String> = get(&self.meta, "roots").and_then(|r| r.as_array()).into_iter().flatten()
        .map(|r| (s(r, "id").to_string(), get(r, "absPath").and_then(|a| a.as_str()).map(String::from).unwrap_or_else(|| s(r, "name").to_string()))).collect();
      let (mut files, mut by_file) = (vec![], vec![]);
      for t in self.tracks.values() {
        let (root, rel) = (s(t, "rootId"), s(t, "relPath"));
        if truthy(get(t, "remote")) || !((!root.is_empty() && !rel.is_empty()) || truthy(get(t, "fileKey"))) { continue; }
        files.push(FileEntry {
          rel_path: if rel.is_empty() { s(t, "fileName").into() } else { rel.into() },
          size: match get(t, "size") { Some(v) if !v.is_null() => v.clone(), _ => Value::from(0) },
          under: if root.is_empty() { None } else { place.get(root).cloned() },
        });
        by_file.push(s(t, "id").to_string());
      }
      let mut into: IndexMap<String, Value> = IndexMap::new();
      for (id, f) in match_tracks(&strays, &files) {
        let to = &by_file[f];
        if *to != id { if let Some(t) = self.tracks.get(to) { into.insert(id, t.clone()); } }
      }
      relinked = into.len();
      self.absorb_tracks(&into);
    }
    (unlinked, dropped, relinked)
  }

  /// A shared collection: this computer's songs that are the same file as a song only other computers have
  /// (`copiesToJoin`), [this computer's, theirs]; the older song stays (then the lower id).
  pub fn copies_to_join(&self) -> Vec<(String, String)> {
    let mut theirs: IndexMap<String, Vec<&Value>> = IndexMap::new();
    if self.shared.is_some() {
      for t in self.tracks.values() {
        if truthy(get(t, "remote")) && get(t, "size").is_some_and(|x| !x.is_null()) { theirs.entry(file_key(s(t, "fileName"), &t["size"])).or_default().push(t); }
      }
    }
    let mut pairs = vec![];
    if theirs.is_empty() { return pairs; }
    let older = |a: &Value, b: &Value| { let o = utf16_cmp(s(a, "addedAt"), s(b, "addedAt")); o.is_lt() || (o.is_eq() && utf16_cmp(s(a, "id"), s(b, "id")).is_lt()) };
    for t in self.tracks.values() {
      if truthy(get(t, "remote")) || get(t, "onDevices").and_then(|d| d.as_array()).is_some_and(|d| !d.is_empty()) || s(t, "status") != "linked" || s(t, "rootId").is_empty() || s(t, "relPath").is_empty() { continue; }
      let Some(same) = theirs.get_mut(&file_key(s(t, "fileName"), get(t, "size").unwrap_or(&Value::Null))) else { continue };
      if let Some(i) = same.iter().position(|x| older(x, t)) { pairs.push((s(t, "id").to_string(), s(same.remove(i), "id").to_string())); }
    }
    pairs
  }

  /// Another computer's song gets this computer's copy (`addCopy`): where its file is here. False when it can't.
  pub fn add_copy(&mut self, id: &str, copy: &[(&str, Value)]) -> bool {
    let Some(m) = &self.shared else { return false };
    let (Some(t), Some(prev)) = (self.tracks.get(id), m.tracks.get(id)) else { return false };
    if !truthy(get(t, "remote")) || unknown_computer(Some(&m.here.me)) || !m.own { return false; }
    let mut mine = t.as_object().cloned().unwrap_or_default();
    for k in ["remote", "onDevices", "aka", "unwritten", "filePath"] { mine.shift_remove(k); }
    for (k, v) in copy { mine.insert(k.to_string(), v.clone()); }
    for (k, v) in [("status", Value::from("linked")), ("importPath", Value::Null), ("fileKey", Value::Null), ("sources", Value::Array(vec![]))] { mine.insert(k.into(), v); }
    let l = to_local(&to_shared(&Value::Object(mine), &m.here, Some(prev)), &m.here);
    self.put_track(l);
    true
  }

  /// Each pair one song, on both (`joinCopies`): this computer's copy joins theirs, with its analysis, playlist places,
  /// rating and notes, and its own row goes. How many joined.
  pub fn join_copies(&mut self, pairs: &[(String, String)]) -> usize {
    let mut into: IndexMap<String, Value> = IndexMap::new();
    for (mine, theirs) in pairs {
      let Some(t) = self.tracks.get(mine).cloned() else { continue };
      let (root, rel) = (s(&t, "rootId").to_string(), s(&t, "relPath").to_string());
      if root.is_empty() || rel.is_empty() { continue; }
      let copy = [("rootId", Value::from(root)), ("relPath", Value::from(rel)), ("size", t.get("size").cloned().unwrap_or(Value::Null)), ("mtime", t.get("mtime").cloned().unwrap_or(Value::Null))];
      if !self.add_copy(theirs, &copy) { continue; }
      if let Some(a) = self.analysis.get(mine).cloned() { self.put_analysis(theirs, a); }
      if let Some(t) = self.tracks.get(theirs) { into.insert(mine.clone(), t.clone()); }
    }
    self.absorb_tracks(&into);
    into.len()
  }
}
