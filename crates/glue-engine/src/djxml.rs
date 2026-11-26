//! GLUE's playlists for Engine DJ and rekordbox, as a rekordbox XML GLUE Home keeps (ADR 0195). GLUE writes none of the
//! DJ apps' files: the user points Engine DJ (Library › rekordbox) or rekordbox at this one.
//! - **Which:** the lists marked *Keep in Engine DJ* (`apps` has "engine"; a marked folder's lists too: `kept_lists`), of
//!   every collection, under "GLUE" (a folder per collection when more than one has some), in GLUE's order.
//! - **Their songs** whose file is on this computer (its music folder's place in the settings, or where a song added on
//!   its own is), with Prepare's grid and cues, the analysis' key, and BPM.
//! - **Where:** `djXml` in the settings (a path; `false`: none), else `<Music>/GLUE/GLUE.xml`. Never the GLUE folder: the
//!   paths are this computer's.
//! - **When:** the service's DJ timer builds it; written (a temporary file renamed over it) only when it changed.
use crate::djmirror::kept_lists;
use crate::{text, Engine, Host};
use glue_interop::rekordbox_out::{key_text, write_rekordbox_xml, XmlNode, XmlTrack};
use glue_interop::types::{CuePoint, Grid};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;

/// The last file written, and what the settings window and the page show of it.
#[derive(Default)]
pub struct XmlState { written: Option<(PathBuf, u64)>, pub status: Value }

fn hash(s: &str) -> u64 { use std::hash::{Hash, Hasher}; let mut h = std::collections::hash_map::DefaultHasher::new(); s.hash(&mut h); h.finish() }
fn num(v: &Value, k: &str) -> Option<f64> { v.get(k).and_then(Value::as_f64).filter(|x| x.is_finite()) }
fn parent_id(l: &Value) -> Option<&str> { l.get("parentId").and_then(Value::as_str).filter(|x| !x.is_empty()) }

/// A song's file on this computer: its music folder's place and its path in it, or where a song added on its own is.
pub(crate) fn file_here(cfg: &Value, t: &Value) -> Option<PathBuf> {
  if t.get("remote").is_some_and(|r| !r.is_null()) { return None; }
  let rel = text(t, "relPath");
  let file = if !rel.is_empty() {
    let root = cfg["folders"][text(t, "rootId")].as_str()?;
    let mut f = PathBuf::from(root);
    for part in rel.split('/') { f.push(part); }
    f
  } else {
    let p = text(t, "filePath");
    if p.is_empty() { return None; }
    PathBuf::from(p)
  };
  file.is_file().then_some(file)
}

/// GLUE's song as the file has it.
fn song(id: u64, file: &std::path::Path, t: &Value, analysis: Option<&Value>) -> XmlTrack {
  let prep = t.get("prep");
  let f = &t["format"];
  let grid = prep.and_then(|p| Some(Grid { bpm: num(p, "bpm")?, beat0: num(p, "beat0")?, bar: num(p, "bar").unwrap_or(0.0) }));
  let bpm = prep.and_then(|p| num(p, "bpm")).or_else(|| analysis.and_then(|a| num(a, "bpm")));
  let key = analysis.and_then(|a| a.get("key")).filter(|k| !k.is_null()).and_then(|k| key_text(k["tonic"].as_i64()?, k["mode"] == "minor"));
  let cues = prep.and_then(|p| p.get("cues")).and_then(Value::as_array).into_iter().flatten().map(|c| CuePoint {
    t: num(c, "t").unwrap_or(-1.0), kind: text(c, "kind"), num: num(c, "num"), name: text(c, "name"),
    color: c.get("color").and_then(Value::as_str).map(String::from), end: num(c, "end"),
  }).collect();
  XmlTrack {
    id, path: file.to_string_lossy().to_string(),
    name: { let n = text(t, "title"); if n.is_empty() { text(t, "fileName") } else { n } },
    artist: text(t, "artist"), album: text(t, "album"), genre: text(t, "genre"), label: text(t, "label"), comment: text(t, "comment"), year: text(t, "year"),
    duration: num(t, "duration"), size: num(t, "size"), bitrate: crate::djlists::kbps(f).map(|b| b as f64), sample_rate: num(f, "sampleRate"),
    rating: num(t, "rating"), bpm, key, date_added: Some(text(t, "addedAt")).filter(|d| d.len() >= 10).map(|d| d[..10].to_string()),
    grid, cues,
  }
}

impl<H: Host> Engine<H> {
  /// Where the file goes; None: none wanted (or no Music folder to put it in).
  pub fn dj_xml_path(&self) -> Option<PathBuf> {
    let cfg = self.host.config();
    match &cfg["djXml"] {
      Value::Bool(false) => None,
      Value::String(p) if !p.trim().is_empty() => Some(PathBuf::from(p.trim())),
      _ => Some(PathBuf::from(self.host.known_folders().music?).join("GLUE").join("GLUE.xml")),
    }
  }

  /// The file's text, with how many lists and songs it has and the songs left out (not on this computer). None: no
  /// list is kept in Engine DJ.
  pub fn dj_xml_build(&self) -> Option<(String, Value)> {
    let cfg = self.host.config();
    let lib = self.describe()?;
    let mut groups: Vec<(String, Vec<XmlNode>)> = vec![];
    let mut tracks: Vec<XmlTrack> = vec![];
    let mut ids: HashMap<(String, String), Option<u64>> = HashMap::new();
    let (mut lists, mut left) = (0usize, 0usize);
    for p in lib["profiles"].as_array().into_iter().flatten() {
      for c in p["collections"].as_array().into_iter().flatten() {
        let (pid, cid) = (text(p, "id"), text(c, "id"));
        let Ok(s) = self.store(&pid, &cid) else { continue };
        let st = s.lock().unwrap();
        let (scope, all) = kept_lists(&st.lists, "engine");
        if all.is_empty() { continue; }
        // Siblings in GLUE's order.
        let mut kids: HashMap<Option<String>, Vec<&Value>> = HashMap::new();
        for id in &all { let l = &st.lists[id]; kids.entry(parent_id(l).filter(|x| all.contains(*x)).map(String::from)).or_default().push(l); }
        for v in kids.values_mut() { v.sort_by(|a, b| num(a, "position").unwrap_or(0.0).partial_cmp(&num(b, "position").unwrap_or(0.0)).unwrap_or(std::cmp::Ordering::Equal).then_with(|| text(a, "name").cmp(&text(b, "name")))); }
        #[allow(clippy::too_many_arguments)]
        fn build<H: Host>(e: &Engine<H>, at: Option<String>, kids: &HashMap<Option<String>, Vec<&Value>>, scope: &std::collections::HashSet<String>, st: &glue_store::store::Store<glue_store::dir::FsDir>, cfg: &Value, cid: &str, tracks: &mut Vec<XmlTrack>, ids: &mut HashMap<(String, String), Option<u64>>, lists: &mut usize, left: &mut usize, depth: usize) -> Vec<XmlNode> {
          let mut out = vec![];
          if depth > 64 { return out; }
          for l in kids.get(&at).into_iter().flatten() {
            let (id, name) = (text(l, "id"), text(l, "name"));
            if text(l, "kind") == "folder" {
              out.push(XmlNode::Folder { name, children: build(e, Some(id), kids, scope, st, cfg, cid, tracks, ids, lists, left, depth + 1) });
              continue;
            }
            *lists += 1;
            let mut items = vec![];
            if scope.contains(&id) {
              for tid in l["items"].as_array().into_iter().flatten().filter_map(Value::as_str) {
                let k = (cid.to_string(), tid.to_string());
                let x = match ids.get(&k) {
                  Some(x) => *x,
                  None => {
                    let x = st.tracks.get(tid).and_then(|t| { let f = file_here(cfg, t)?; let n = tracks.len() as u64 + 1; tracks.push(song(n, &f, t, st.analysis.get(tid))); Some(n) });
                    if x.is_none() && st.tracks.contains_key(tid) { *left += 1; }
                    ids.insert(k, x);
                    x
                  }
                };
                if let Some(x) = x { items.push(x); }
              }
            }
            out.push(XmlNode::Playlist { name, tracks: items });
          }
          let _ = e;
          out
        }
        let nodes = build(self, None, &kids, &scope, &st, &cfg, &cid, &mut tracks, &mut ids, &mut lists, &mut left, 0);
        let name = text(c, "name");
        groups.push((if name.is_empty() { "Collection".into() } else { name }, nodes));
      }
    }
    if groups.is_empty() { return None; }
    let top = if groups.len() == 1 { groups.pop().unwrap().1 } else { groups.into_iter().map(|(name, children)| XmlNode::Folder { name, children }).collect() };
    let tree = vec![XmlNode::Folder { name: crate::djmirror::GLUE_FOLDER.into(), children: top }];
    let xml = write_rekordbox_xml(&tracks, &tree, &self.host.version());
    Some((xml, json!({ "lists": lists, "songs": tracks.len(), "left": left })))
  }

  /// Writes the file when it changed (the DJ timer). Written too when nothing is kept any more but the file is there, so
  /// it doesn't keep lists GLUE took out.
  pub fn dj_xml(&self) {
    let Some(path) = self.dj_xml_path() else {
      let mut x = self.xml.lock().unwrap();
      let changed = x.status != json!({ "path": null });
      x.status = json!({ "path": null });
      drop(x);
      if changed { self.report_soon(); }
      return;
    };
    let built = self.dj_xml_build();
    let (xml, counts) = match built {
      Some(x) => x,
      None if path.is_file() => (write_rekordbox_xml(&[], &[], &self.host.version()), json!({ "lists": 0, "songs": 0, "left": 0 })),
      None => {
        let st = json!({ "path": path.to_string_lossy(), "lists": 0, "songs": 0, "left": 0 });
        let mut x = self.xml.lock().unwrap();
        let changed = x.status != st;
        x.status = st;
        drop(x);
        if changed { self.report_soon(); }
        return;
      }
    };
    let h = hash(&xml);
    let mut x = self.xml.lock().unwrap();
    let same = x.written.as_ref().is_some_and(|(p, k)| *p == path && *k == h)
      || (x.written.is_none() && std::fs::read_to_string(&path).is_ok_and(|old| hash(&old) == h));
    let mut status = counts;
    status["path"] = json!(path.to_string_lossy());
    if !same {
      let tmp = path.with_extension("xml.tmp");
      let r = path.parent().map_or(Ok(()), std::fs::create_dir_all).and_then(|_| std::fs::write(&tmp, &xml)).and_then(|_| std::fs::rename(&tmp, &path));
      match r {
        Ok(()) => {
          let first = x.written.is_none();
          x.written = Some((path.clone(), h));
          status["at"] = json!(self.host.now().1);
          if first || status["lists"] != x.status["lists"] || status["songs"] != x.status["songs"] {
            self.event(&format!("GLUE’s playlists for Engine DJ written: {} playlist{}, {} song{}", status["lists"], if status["lists"] == 1 { "" } else { "s" }, status["songs"], if status["songs"] == 1 { "" } else { "s" }));
          }
        }
        Err(e) => { let _ = std::fs::remove_file(&tmp); status["error"] = json!(format!("{}: {e}", path.display())); }
      }
    } else {
      x.written = Some((path.clone(), h));
      if let Some(at) = x.status.get("at") { status["at"] = at.clone(); }
    }
    let changed = x.status != status;
    x.status = status;
    drop(x);
    if changed { self.report_soon(); }
  }
}
