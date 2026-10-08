//! Apple Music / iTunes library XML (`core/interop/apple.ts`): a property list, its Tracks dict and Playlists array.
use crate::types::*;
use crate::xml::{parse_xml, XNode};
use indexmap::IndexMap;
use regex::Regex;
use std::sync::LazyLock;

static HEAD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<plist[\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}>]").unwrap());
pub fn is_apple_library(head: &str) -> bool { HEAD.is_match(head) }

/// A property list's value, as the website holds it (a dict is a JavaScript object: a key given twice keeps its first
/// place with its last value).
#[derive(Debug, Clone)]
enum Pv { Str(String), Num(f64), Bool(bool), Arr(Vec<Pv>), Dict(IndexMap<String, Pv>), Null }

fn value(n: &XNode) -> Pv {
  match n.name.as_str() {
    "dict" => {
      let mut o = IndexMap::new();
      let mut i = 0;
      while i + 1 < n.children.len() {
        if n.children[i].name == "key" { o.insert(n.children[i].text.clone(), value(&n.children[i + 1])); }
        i += 2;
      }
      Pv::Dict(o)
    }
    "array" => Pv::Arr(n.children.iter().map(value).collect()),
    "integer" | "real" => Pv::Num(js_number(&n.text)),
    "true" => Pv::Bool(true),
    "false" => Pv::Bool(false),
    "string" | "date" | "data" => Pv::Str(n.text.clone()),
    _ => Pv::Null,
  }
}
impl Pv {
  fn get(&self, k: &str) -> Option<&Pv> { match self { Pv::Dict(o) => o.get(k), _ => None } }
  fn truthy(&self) -> bool { match self { Pv::Str(s) => !s.is_empty(), Pv::Num(x) => *x != 0.0 && !x.is_nan(), Pv::Bool(b) => *b, Pv::Null => false, _ => true } }
  /// `String(v)`.
  fn string(&self) -> String {
    match self {
      Pv::Str(s) => s.clone(), Pv::Num(x) => num_str(*x), Pv::Bool(b) => b.to_string(), Pv::Null => "null".into(),
      Pv::Arr(a) => a.iter().map(|x| if matches!(x, Pv::Null) { String::new() } else { x.string() }).collect::<Vec<_>>().join(","),
      Pv::Dict(_) => "[object Object]".into(),
    }
  }
  fn num(&self) -> Option<f64> { if let Pv::Num(x) = self { Some(*x) } else { None } }
}
/// `String(v ?? or)`.
fn string_or(v: Option<&Pv>, or: &str) -> String { match v { None | Some(Pv::Null) => or.into(), Some(x) => x.string() } }
fn truthy(v: Option<&Pv>) -> bool { v.is_some_and(Pv::truthy) }

pub fn parse_apple_library(xml: &str, file_name: &str) -> Result<ImportedLibrary, String> {
  let doc = parse_xml(xml)?;
  let top = doc.child("plist").and_then(|p| p.children.iter().find(|c| c.name == "dict")).ok_or("This isn’t an Apple Music / iTunes library file.")?;
  let lib = value(top);
  let mut tracks = vec![];
  if let Some(Pv::Dict(all)) = lib.get("Tracks").filter(|t| t.truthy()) {
    for id in js_key_order(all.keys()) {
      let t = &all[id];
      if !truthy(t.get("Location")) || t.get("Track Type").is_some_and(|x| matches!(x, Pv::Str(s) if s == "URL")) || truthy(t.get("Podcast")) || truthy(t.get("Movie")) || truthy(t.get("TV Show")) { continue; }
      let mut tr = blank_track(id.clone(), file_url_to_path(&t.get("Location").unwrap().string()));
      tr.title = string_or(t.get("Name"), ""); tr.artist = string_or(t.get("Artist"), ""); tr.album = string_or(t.get("Album"), "");
      tr.genre = string_or(t.get("Genre"), ""); tr.comment = string_or(t.get("Comments"), ""); tr.grouping = string_or(t.get("Grouping"), "");
      tr.year = if truthy(t.get("Year")) { t.get("Year").unwrap().string() } else { String::new() };
      tr.duration = t.get("Total Time").and_then(Pv::num).map(|x| x / 1000.0);
      tr.bpm = t.get("BPM").and_then(Pv::num).filter(|&b| b > 0.0);
      tr.rating = t.get("Rating").and_then(Pv::num).filter(|_| !truthy(t.get("Rating Computed"))).map(|r| round(r / 20.0));
      tr.play_count = t.get("Play Count").and_then(Pv::num);
      tr.date_added = truthy(t.get("Date Added")).then(|| t.get("Date Added").unwrap().string().encode_utf16().take(10).collect::<Vec<_>>()).map(|u| String::from_utf16_lossy(&u));
      tr.size = t.get("Size").and_then(Pv::num);
      tracks.push(tr);
    }
  }
  let known: std::collections::HashSet<String> = tracks.iter().map(|t| t.external_id.clone()).collect();
  let mut lists = vec![];
  let none = Pv::Arr(vec![]);
  let pls = lib.get("Playlists").filter(|p| p.truthy()).unwrap_or(&none);
  for p in if let Pv::Arr(a) = pls { a.as_slice() } else { &[] } {
    if truthy(p.get("Master")) || truthy(p.get("Distinguished Kind")) || matches!(p.get("Visible"), Some(Pv::Bool(false))) { continue; }
    let pid = p.get("Playlist Persistent ID").filter(|x| !matches!(x, Pv::Null)).or(p.get("Playlist ID"));
    let id = pid.map_or("undefined".into(), Pv::string);
    let parent = truthy(p.get("Parent Persistent ID")).then(|| p.get("Parent Persistent ID").unwrap().string());
    let items = match p.get("Playlist Items").filter(|x| x.truthy()) {
      Some(Pv::Arr(a)) => a.iter().map(|i| i.get("Track ID").map_or("undefined".into(), Pv::string)).filter(|x| known.contains(x)).collect(),
      _ => vec![],
    };
    lists.push(ImportedList { external_id: id, kind: if truthy(p.get("Folder")) { "folder" } else { "playlist" }, name: string_or(p.get("Name"), "Playlist"), parent, items });
  }
  let ids: std::collections::HashSet<String> = lists.iter().map(|l| l.external_id.clone()).collect();
  for l in &mut lists { if l.parent.as_ref().is_some_and(|p| !ids.contains(p)) { l.parent = None; } }
  Ok(ImportedLibrary { app: "apple", name: format!("Apple Music ({file_name})"), tracks, lists, stats: None, engine: None })
}
