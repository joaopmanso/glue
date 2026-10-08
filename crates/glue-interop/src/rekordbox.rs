//! rekordbox XML (`core/interop/rekordbox.ts`).
use crate::types::*;
use crate::xml::{parse_xml, XNode};
use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use std::sync::LazyLock;

static HEAD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<DJ_PLAYLISTS[\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}>]").unwrap());
pub fn is_rekordbox_xml(head: &str) -> bool { HEAD.is_match(head) }

/// A colour channel as the website writes it: clamped to 0–255, two hex digits.
fn channel(v: &str) -> String {
  let x = js_number(v);
  let x = if x.is_nan() || x == 0.0 { 0.0 } else { x.clamp(0.0, 255.0) };
  // (A fraction would print as JavaScript's base-16 fraction; rekordbox writes whole numbers.)
  format!("{:02x}", x as u32)
}

pub fn parse_rekordbox_xml(xml: &str, file_name: &str) -> Result<ImportedLibrary, String> {
  let doc = parse_xml(xml)?;
  let root = doc.child("DJ_PLAYLISTS").ok_or("This isn’t a rekordbox XML file (no DJ_PLAYLISTS element).")?;
  let mut tracks = vec![];
  let mut by_location: IndexMap<String, String> = IndexMap::new();
  for t in root.child("COLLECTION").into_iter().flat_map(|c| c.children_named("TRACK")) {
    let a = |k: &str| t.attr(k);
    let or = |k: &str| a(k).filter(|v| !v.is_empty());
    let Some(id) = or("TrackID").or(or("Location")) else { continue };
    let Some(location) = or("Location") else { continue };
    let mut tr = blank_track(id.to_string(), file_url_to_path(location));
    let text = |k: &str| a(k).unwrap_or("").to_string();
    tr.title = text("Name"); tr.artist = text("Artist"); tr.album = text("Album"); tr.genre = text("Genre");
    tr.label = text("Label"); tr.comment = text("Comments"); tr.grouping = text("Grouping");
    tr.year = or("Year").filter(|y| *y != "0").unwrap_or("").to_string();
    tr.duration = num(a("TotalTime")); tr.bpm = num(a("AverageBpm")).filter(|&b| b != 0.0); tr.key = or("Tonality").map(String::from);
    tr.rating = num(a("Rating")).map(|r| round(r / 51.0));
    tr.play_count = num(a("PlayCount")); tr.date_added = or("DateAdded").map(String::from); tr.size = num(a("Size"));
    // POSITION_MARK: Type 0 cue · 1 fade-in · 2 fade-out · 3 load · 4 loop; Num −1 memory cue, 0–7 hot cue A–H.
    tr.cue_list = t.children_named("POSITION_MARK").map(|m| {
      let p = |k: &str| m.attr(k);
      let ty = p("Type").unwrap_or("0");
      let (slot, end) = (num(p("Num")), num(p("End")));
      let color = match (p("Red"), p("Green"), p("Blue")) { (Some(r), Some(g), Some(b)) => Some(format!("#{}{}{}", channel(r), channel(g), channel(b))), _ => None };
      CuePoint {
        t: num(p("Start")).unwrap_or(0.0),
        kind: match ty { "4" => "loop", "3" => "load", "1" | "2" => "fade", _ => "cue" }.into(),
        num: slot.filter(|&s| s >= 0.0), name: p("Name").unwrap_or("").to_string(), color, end: if ty == "4" { end } else { None },
      }
    }).collect();
    tr.cue_list.sort_by(|x, y| x.t.partial_cmp(&y.t).unwrap_or(std::cmp::Ordering::Equal));
    tr.cues = tr.cue_list.len();
    by_location.insert(location.to_string(), id.to_string());
    tracks.push(tr);
  }
  let mut lists = vec![];
  let mut taken = IndexSet::new();
  fn walk(node: &XNode, parent: Option<&str>, lists: &mut Vec<ImportedList>, taken: &mut IndexSet<String>, by_location: &IndexMap<String, String>) {
    for n in node.children_named("NODE") {
      let name = n.attr("Name").unwrap_or("");
      let id = path_id(parent, name, taken);
      if n.attr("Type") == Some("0") {
        lists.push(ImportedList { external_id: id.clone(), kind: "folder", name: if name.is_empty() { "Folder".into() } else { name.into() }, parent: parent.map(String::from), items: vec![] });
        walk(n, Some(&id), lists, taken, by_location);
      } else {
        let by_loc = n.attr("KeyType") == Some("1");
        let items = n.children_named("TRACK").filter_map(|t| {
          let k = t.attr("Key");
          let v = if by_loc { k.and_then(|k| by_location.get(k)).map(String::as_str).unwrap_or("") } else { k.unwrap_or("") };
          (!v.is_empty()).then(|| v.to_string())
        }).collect();
        lists.push(ImportedList { external_id: id, kind: "playlist", name: if name.is_empty() { "Playlist".into() } else { name.into() }, parent: parent.map(String::from), items });
      }
    }
  }
  // The ROOT node itself is skipped.
  if let Some(top) = root.child("PLAYLISTS").and_then(|p| p.child("NODE")) { walk(top, None, &mut lists, &mut taken, &by_location); }
  Ok(ImportedLibrary { app: "rekordbox", name: format!("Rekordbox ({file_name})"), tracks, lists, stats: None, engine: None })
}
