//! This computer's GLUE library as GLUE Home sees it (ADR 0045; home/ui/library.ts in Rust, ADR 0154): the profiles
//! and collections in the GLUE folder, a shared collection seen as this computer, and where each music folder and
//! song is on this computer's disks, found by itself (the settings, the song's DJ app, the usual folders, a search).
use crate::{get, text, Engine, Host};
use glue_store::dir::read_json;
use glue_store::project::{collection_here, me_for, to_local, truthy, unknown_computer, Here};
use glue_store::store::shard_of;
use serde_json::{json, Value};
use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};

/// The id of a collection's incoming folder (src/store/types.ts `INCOMING_ROOT`).
pub const INCOMING_ROOT: &str = "incoming";

/// A collection as this computer has it (library.ts `here`): a shared one (ADR 0094) as this computer (its music
/// folders, its copy of each song); any other as it is. `computer` not known yet: the member this folder's entry names
/// (for reading only).
pub struct Seen { pub meta: Option<Value>, shared: Option<Here> }
impl Seen {
  pub fn new(meta: Option<Value>, pid: &str, cid: &str, computer: Option<&str>) -> Seen {
    let Some(m) = meta else { return Seen { meta: None, shared: None } };
    if !truthy(get(&m, "shared")) { return Seen { meta: Some(m), shared: None } }
    let members = get(&m, "members").and_then(|x| x.as_object()).cloned().unwrap_or_default();
    let me = if !unknown_computer(computer) { computer.unwrap_or("").to_string() } else { me_for(Some(&members), pid, None).unwrap_or_default() };
    Seen { meta: Some(collection_here(&m, &me)), shared: Some(Here { me, collection: cid.to_string(), members, roots_by: None }) }
  }
  pub fn is_shared(&self) -> bool { self.shared.is_some() }
  /// The member this computer is in a shared collection.
  pub fn me(&self) -> Option<&str> { self.shared.as_ref().map(|h| h.me.as_str()) }
  pub fn track(&self, t: &Value) -> Value { match &self.shared { Some(h) => to_local(t, h), None => t.clone() } }
  pub fn roots(&self) -> Vec<Value> { self.meta.as_ref().and_then(|m| get(m, "roots")).and_then(|r| r.as_array()).cloned().unwrap_or_default() }
}

/// Shared with the account's other computers (on unless turned off in the settings).
pub fn shared(cfg: &Value, p: &str, c: &str) -> bool { cfg["serve"][format!("{p}/{c}")] != Value::Bool(false) }

/// A music folder set in the settings that isn't reachable now: its songs wait for it, they aren't failures.
pub fn away(name: &str, at: &str) -> String { format!("“{name}” isn’t reachable right now ({at}): a network folder not connected, or a drive not plugged in") }
pub fn is_away(e: &str) -> bool { e.contains("isn’t reachable") }

/// Where a song is on this computer (library.ts `trackPath`): its path, name, the size and date the collection knows,
/// and the music folder it was found in when that isn't where the settings say.
#[derive(Debug, Clone)]
pub struct SongFile { pub path: String, pub name: String, pub mtime: f64, pub size: Option<f64>, pub folder: Option<(String, String)> }
impl SongFile {
  pub fn to_json(&self) -> Value { json!({ "path": self.path, "name": self.name, "mtime": self.mtime, "size": self.size, "folder": self.folder.as_ref().map(|(id, path)| json!({ "id": id, "path": path })) }) }
}

/// The usual folders of this computer (to find music folders by name).
#[derive(Debug, Clone, Default)]
pub struct Known { pub home: Option<String>, pub music: Option<String>, pub documents: Option<String>, pub desktop: Option<String>, pub downloads: Option<String>, pub sep: char }
impl Known {
  pub fn from_json(v: &Value) -> Known {
    let s = |k: &str| v[k].as_str().map(String::from);
    Known { home: s("home"), music: s("music"), documents: s("documents"), desktop: s("desktop"), downloads: s("downloads"), sep: v["sep"].as_str().and_then(|x| x.chars().next()).unwrap_or(std::path::MAIN_SEPARATOR) }
  }
  pub fn to_json(&self) -> Value { json!({ "home": self.home, "music": self.music, "documents": self.documents, "desktop": self.desktop, "downloads": self.downloads, "sep": self.sep.to_string() }) }
  /// Where a search for a folder or a dropped file starts: these, in this order.
  pub fn starts(&self) -> Vec<PathBuf> { [&self.music, &self.documents, &self.desktop, &self.downloads, &self.home].into_iter().flatten().map(PathBuf::from).collect() }
}

/// `base` + a path in it with '/' (the folder's own separator).
pub fn join(base: &str, rel: &str, sep: char) -> String {
  let b = base.trim_end_matches(['\\', '/']);
  format!("{b}{sep}{}", rel.split('/').collect::<Vec<_>>().join(&sep.to_string()))
}
fn exists(p: &str) -> bool { Path::new(p).exists() }

/// A folder called `name` (any case) with `sample` (a song's path in it) inside: the usual folders, then `more` (every
/// drive or volume), a few levels deep, system folders skipped; at most `secs` seconds (main.rs's `search`).
pub fn search_folder(starts: Vec<PathBuf>, name: &str, sample: &str, secs: u64) -> Option<String> {
  let rel: PathBuf = sample.split('/').collect();
  let want = name.to_lowercase();
  let started = std::time::Instant::now();
  let (mut seen, mut visited) = (HashSet::new(), 0usize);
  let mut queue: VecDeque<(PathBuf, u32)> = starts.into_iter().map(|s| (s, 0)).collect();
  while let Some((dir, depth)) = queue.pop_front() {
    if visited > 300_000 || started.elapsed().as_secs() >= secs { break; }
    if !seen.insert(dir.clone()) { continue; }
    if dir.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase() == want) && dir.join(&rel).is_file() { return Some(dir.to_string_lossy().into_owned()); }
    if depth >= 6 { continue; }
    let Ok(entries) = std::fs::read_dir(&dir) else { continue };
    for e in entries.flatten() {
      visited += 1;
      let Ok(t) = e.file_type() else { continue };
      if !t.is_dir() || t.is_symlink() { continue; }
      let n = e.file_name().to_string_lossy().to_lowercase();
      if n.starts_with('.') || SKIP.contains(&n.as_str()) { continue; }
      queue.push_back((e.path(), depth + 1));
    }
  }
  None
}
/// A file called `name` (any case) of `size` bytes: `first` (the collection's music folders) whole, then `later` a few
/// levels deep; gives up after 25 s (main.rs's `search_file`).
pub fn search_file(first: &[PathBuf], later: &[PathBuf], name: &str, size: u64) -> Option<String> {
  let walk = |starts: &[PathBuf], depth_max: u32| -> Option<String> {
    let want = name.to_lowercase();
    let started = std::time::Instant::now();
    let (mut seen, mut visited) = (HashSet::new(), 0usize);
    let mut queue: VecDeque<(PathBuf, u32)> = starts.iter().map(|s| (s.clone(), 0)).collect();
    while let Some((dir, depth)) = queue.pop_front() {
      if visited > 600_000 || started.elapsed().as_secs() > 25 { break; }
      if !seen.insert(dir.clone()) { continue; }
      let Ok(entries) = std::fs::read_dir(&dir) else { continue };
      for e in entries.flatten() {
        visited += 1;
        let Ok(t) = e.file_type() else { continue };
        let n = e.file_name().to_string_lossy().to_lowercase();
        if t.is_file() {
          if n == want && e.metadata().map(|m| m.len() == size).unwrap_or(false) { return Some(e.path().to_string_lossy().into_owned()); }
          continue;
        }
        if !t.is_dir() || t.is_symlink() || depth >= depth_max || n.starts_with('.') || SKIP.contains(&n.as_str()) { continue; }
        queue.push_back((e.path(), depth + 1));
      }
    }
    None
  };
  walk(first, 64).or_else(|| walk(later, 8))
}
const SKIP: [&str; 15] = ["windows", "program files", "program files (x86)", "programdata", "appdata", "$recycle.bin", "system volume information", "library", "node_modules", "applications", "system", "private", "usr", "bin", "opt"];

/// The folders a search found that the settings should take (library.ts `newlyFound`): only new places, and only for
/// folders the settings didn't change since the search began (`before`). None: nothing to save.
pub fn newly_found(before: &Value, found: &Value, cur: &Value) -> Option<Value> {
  let mut out = cur.as_object().cloned().unwrap_or_default();
  let mut any = false;
  for (id, at) in found.as_object().into_iter().flatten() {
    if Some(at) != before.get(id) && cur.get(id) == before.get(id) { out.insert(id.clone(), at.clone()); any = true; }
  }
  any.then_some(Value::Object(out))
}

impl<H: Host> Engine<H> {
  fn read(&self, rel: &str) -> Option<Value> { read_json(&self.dir(), rel).ok().flatten() }

  /// The profiles and collections in the GLUE folder, each collection's music folders (library.ts `describe`).
  pub fn describe(&self) -> Option<Value> {
    let index = self.read("mco.json")?;
    let mut profiles = vec![];
    for r in get(&index, "profiles").and_then(|x| x.as_array()).into_iter().flatten() {
      let Some(p) = self.read(&format!("profiles/{}/profile.json", text(r, "id"))) else { continue };
      let pid = text(&p, "id");
      let mut cols = vec![];
      for c in get(&p, "collections").and_then(|x| x.as_array()).into_iter().flatten() {
        let cid = text(c, "id");
        let seen = Seen::new(self.read(&format!("profiles/{pid}/collections/{cid}/collection.json")), &pid, &cid, None);
        if let Some(m) = &seen.meta { cols.push(json!({ "id": cid, "name": m["name"], "roots": seen.roots() })); }
      }
      profiles.push(json!({ "id": pid, "name": p["name"], "collections": cols }));
    }
    Some(json!({ "profiles": profiles }))
  }

  /// The profile folder a collection is in, asked for with another folder's id (ADR 0108): the one that has it.
  pub fn folder_of(&self, p: &str, c: &str) -> String {
    if self.read(&format!("profiles/{p}/collections/{c}/collection.json")).is_some() { return p.to_string(); }
    let index = self.read("mco.json").unwrap_or(Value::Null);
    for r in get(&index, "profiles").and_then(|x| x.as_array()).into_iter().flatten() {
      let Some(pf) = self.read(&format!("profiles/{}/profile.json", text(r, "id"))) else { continue };
      if get(&pf, "collections").and_then(|x| x.as_array()).is_some_and(|cs| cs.iter().any(|x| text(x, "id") == c)) { return text(&pf, "id"); }
    }
    p.to_string()
  }

  /// A collection seen as this computer.
  pub fn seen(&self, p: &str, c: &str, computer: Option<&str>) -> Seen { Seen::new(self.read(&format!("profiles/{p}/collections/{c}/collection.json")), p, c, computer) }

  /// One song of each music folder of a collection (to check where a folder is).
  fn samples(&self, p: &str, c: &str, roots: &[String]) -> std::collections::HashMap<String, (String, Option<String>)> {
    let mut out = std::collections::HashMap::new();
    let seen = self.seen(p, c, None);
    for a in HEX.chars() { for b in HEX.chars() {
      if out.len() >= roots.len() { return out; }
      let Some(shard) = self.read(&format!("profiles/{p}/collections/{c}/tracks/{a}{b}.json")) else { continue };
      for t in get(&shard, "items").and_then(|x| x.as_object()).into_iter().flatten().map(|(_, t)| seen.track(t)) {
        let (rid, rel) = (text(&t, "rootId"), text(&t, "relPath"));
        if !rid.is_empty() && !rel.is_empty() && roots.contains(&rid) && !out.contains_key(&rid) { out.insert(rid, (rel, t["importPath"].as_str().map(String::from))); }
      }
    } }
    out
  }

  /// Where a music folder is on this computer (library.ts `locate`), checked with one of its songs: where the settings
  /// put it; where the song's DJ app said it is; where the website knows it is; a folder of that name in Music,
  /// Documents, home, Desktop or Downloads, or inside a music folder GLUE Home knows; a search of this computer's drives
  /// (one at a time per folder; one not found isn't searched for again for a minute). Found by looking: remembered in
  /// the settings (unless they put it elsewhere meanwhile).
  pub fn locate(&self, root: &Value, sample: Option<(&str, Option<&str>)>, cfg: &Value, search: bool, secs: u64) -> Option<String> {
    let id = text(root, "id");
    if id == INCOMING_ROOT { return Some(self.host.incoming_dir().to_string_lossy().into_owned()); }
    let k = self.host.known_folders();
    let ok = |dir: &str| -> bool { !dir.is_empty() && exists(&match sample { Some((rel, _)) => join(dir, rel, k.sep), None => dir.to_string() }) };
    let chosen = cfg["folders"][&id].as_str().map(String::from);
    if let Some(ch) = &chosen { if ok(ch) { return Some(ch.clone()); } }
    // Where it was put, gone (not mounted): the usual places only, no drive search for each song meanwhile.
    let gone = chosen.as_deref().is_some_and(|ch| !exists(ch));
    let at = self.look(root, sample, cfg, &k, &ok, search && !gone, secs);
    if let Some(a) = &at {
      if !id.is_empty() && Some(a) != chosen.as_ref() {
        let (id2, a2) = (id.clone(), a.clone());
        self.host.patch_config(&move |cur| if cur["folders"].get(&id2).is_none() { let mut f = cur["folders"].as_object().cloned().unwrap_or_default(); f.insert(id2.clone(), json!(a2)); Some(json!({ "folders": f })) } else { None });
      }
    }
    at
  }
  #[allow(clippy::too_many_arguments)]
  fn look(&self, root: &Value, sample: Option<(&str, Option<&str>)>, cfg: &Value, k: &Known, ok: &dyn Fn(&str) -> bool, search: bool, secs: u64) -> Option<String> {
    if let Some((rel, Some(ip))) = sample {
      let s = ip.replace('\\', "/");
      let s = strip_file_url(&s);
      if s.to_lowercase().ends_with(&format!("/{}", rel.to_lowercase())) {
        let dir = &s[..s.len() - rel.len() - 1];
        let native = if k.sep == '\\' { dir.replace('/', "\\") } else { dir.to_string() };
        if ok(&native) { return Some(native); }
      }
    }
    if let Some(a) = root["absPath"].as_str() { if ok(a) { return Some(a.to_string()); } }
    let name = text(root, "name");
    let mut cands: Vec<String> = vec![];
    if let Some(m) = &k.music { if name.to_lowercase() == "music" { cands.push(m.clone()); } }
    let folders: Vec<String> = cfg["folders"].as_object().into_iter().flatten().filter_map(|(_, v)| v.as_str().map(String::from)).collect();
    for b in [&k.music, &k.documents, &k.home, &k.desktop, &k.downloads].into_iter().flatten().chain(folders.iter()) { cands.push(join(b, &name, k.sep)); }
    for c in cands { if ok(&c) { return Some(c); } }
    let (rel, _) = sample?;
    if !search { return None; }
    // One search per folder at a time (the songs waiting for it share it); one that found nothing isn't tried again
    // for a minute.
    let id = text(root, "id");
    let slot = self.searches.lock().unwrap().entry(id).or_default().clone();
    let mut last = slot.lock().unwrap();
    let at = match &*last {
      Some((at, when)) if when.elapsed().as_secs() < if at.is_some() { 5 } else { 60 } => at.clone(),
      _ => { let at = self.host.find_folder(&name, rel, secs); *last = Some((at.clone(), std::time::Instant::now())); at }
    };
    at.filter(|a| ok(a))
  }

  /// Every music folder of every shared collection, looked for: what was found, and what wasn't.
  pub fn locate_all(&self, cfg: &Value) -> Value {
    let (mut folders, mut missing) = (serde_json::Map::new(), vec![]);
    let lib = self.describe().unwrap_or(Value::Null);
    for p in lib["profiles"].as_array().into_iter().flatten() { for c in p["collections"].as_array().into_iter().flatten() {
      let (pid, cid) = (text(p, "id"), text(c, "id"));
      let roots = c["roots"].as_array().cloned().unwrap_or_default();
      if !shared(cfg, &pid, &cid) || roots.is_empty() { continue; }
      let s = self.samples(&pid, &cid, &roots.iter().map(|r| text(r, "id")).collect::<Vec<_>>());
      for r in &roots {
        let rid = text(r, "id");
        if folders.contains_key(&rid) || rid == INCOMING_ROOT { continue; }
        let Some((rel, ip)) = s.get(&rid) else { continue };   // no songs in it (yet)
        match self.locate(r, Some((rel, ip.as_deref())), cfg, true, 25) {
          Some(at) => { folders.insert(rid, json!(at)); }
          None => missing.push(json!({ "id": rid, "name": r["name"], "collection": format!("{} · {}", text(p, "name"), text(c, "name")) })),
        }
      }
    } }
    json!({ "folders": folders, "missing": missing })
  }

  /// A song's file on this computer, from its ids (library.ts `trackPath`).
  pub fn track_path(&self, p: &str, c: &str, id: &str, cfg: &Value) -> Result<SongFile, String> {
    if !shared(cfg, p, c) { return Err("That collection isn’t shared by GLUE Home (see its settings).".into()); }
    let base = format!("profiles/{p}/collections/{c}");
    let shard = self.read(&format!("{base}/tracks/{}.json", shard_of(id)));
    let computer = cfg["computer"].as_str();
    let seen = self.seen(p, c, computer);
    let t = shard.as_ref().and_then(|s| s["items"].get(id)).map(|t| seen.track(t)).ok_or("That song isn’t in this computer’s GLUE library.")?;
    let (name, mtime, size) = (text(&t, "fileName"), t["mtime"].as_f64().unwrap_or(0.0), t["size"].as_f64());
    let k = self.host.known_folders();
    if let Some(copy) = t["fileKey"].as_str().and_then(|f| f.strip_prefix("copy:")) {
      return Ok(SongFile { path: join(cfg["glue"].as_str().unwrap_or(""), copy, k.sep), name, mtime, size, folder: None });
    }
    if truthy(get(&t, "remote")) { return Err("That song isn’t on this computer.".into()); }
    let (rid, rel) = (text(&t, "rootId"), text(&t, "relPath"));
    // Added on its own, where GLUE Home found it (ADR 0125).
    if rid.is_empty() || rel.is_empty() {
      if let Some(fp) = t["filePath"].as_str().filter(|s| !s.is_empty()) {
        if !exists(fp) { return Err(away(&name, fp)); }
        return Ok(SongFile { path: fp.to_string(), name, mtime, size, folder: None });
      }
      return Err("That song was added on its own in the browser; GLUE Home can’t find its file.".into());
    }
    let root = seen.roots().into_iter().find(|r| text(r, "id") == rid).ok_or("That song’s music folder isn’t in the collection any more.")?;
    let Some(dir) = self.locate(&root, Some((&rel, t["importPath"].as_str())), cfg, true, 25) else {
      if let Some(ch) = cfg["folders"][&rid].as_str() { if !exists(ch) { return Err(away(&text(&root, "name"), ch)); } }
      return Err(format!("GLUE Home couldn’t find the music folder “{}” on this computer (with {name} in it).", text(&root, "name")));
    };
    let folder = (cfg["folders"][&rid].as_str() != Some(dir.as_str())).then(|| (rid.clone(), dir.clone()));
    Ok(SongFile { path: join(&dir, &rel, k.sep), name, mtime, size, folder })
  }

  /// A song dropped onto a GLUE tab here (ADR 0125): where it is, and the collection's music folder it's in, if one.
  pub fn where_file(&self, name: &str, size: u64, roots: &[String], cfg: &Value) -> Value {
    let folders: Vec<(String, String)> = cfg["folders"].as_object().into_iter().flatten().filter(|(id, _)| roots.contains(id)).filter_map(|(id, v)| v.as_str().map(|p| (id.clone(), p.to_string()))).collect();
    let Some(at) = self.host.find_file(name, size, &folders.iter().map(|f| PathBuf::from(&f.1)).collect::<Vec<_>>()) else { return json!({ "path": null }) };
    let norm = |p: &str| p.replace('\\', "/").trim_end_matches('/').to_string();
    let low = |p: &str| if p.len() > 2 && p.as_bytes()[1] == b':' { p.to_lowercase() } else { p.to_string() };
    for (id, dir) in &folders {
      let (d, f) = (norm(dir), norm(&at));
      if low(&f).starts_with(&format!("{}/", low(&d))) { return json!({ "path": at, "folder": { "id": id, "relPath": &f[d.len() + 1..] } }); }
    }
    json!({ "path": at })
  }
}

/// A DJ app's `file://` address made a path.
fn strip_file_url(s: &str) -> String {
  let Some(rest) = s.strip_prefix("file://") else { return s.to_string() };
  let rest = rest.strip_prefix("localhost").unwrap_or(rest);
  // file:///C:/… → C:/…
  let b = rest.as_bytes();
  if b.len() > 3 && b[0] == b'/' && b[1].is_ascii_alphabetic() && b[2] == b':' { return rest[1..].to_string(); }
  rest.to_string()
}

const HEX: &str = "0123456789abcdef";

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn paths_and_found_folders() {
    assert_eq!(join("C:\\Music\\", "Sets/a.mp3", '\\'), "C:\\Music\\Sets\\a.mp3");
    assert_eq!(strip_file_url("file://localhost/C:/Music/a.mp3"), "C:/Music/a.mp3");
    assert_eq!(strip_file_url("file:///Users/dj/a.mp3"), "/Users/dj/a.mp3");
    let (before, found, cur) = (json!({ "a": "x" }), json!({ "a": "y", "b": "z" }), json!({ "a": "picked" }));
    assert_eq!(newly_found(&before, &found, &cur), Some(json!({ "a": "picked", "b": "z" })));
    assert_eq!(newly_found(&json!({}), &json!({}), &json!({})), None);
  }
}
