//! Traktor's collection.nml (`core/interop/traktor.ts`). LOCATION = VOLUME + DIR ("/:"-separated) + FILE.
use crate::types::*;
use crate::xml::{parse_xml, XNode};
use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use std::sync::LazyLock;

static HEAD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<NML[\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}>]").unwrap());
pub fn is_traktor_nml(head: &str) -> bool { HEAD.is_match(head) }

const MAJOR: [&str; 12] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/// MUSICAL_KEY VALUE: 0–11 = C…B major, 12–23 = C…B minor (`traktorKey`; what isn't one reads "undefined", as there).
pub fn traktor_key(v: f64) -> String {
  let i = v % 12.0;
  let k = if i.fract() == 0.0 && (0.0..12.0).contains(&i) { MAJOR[i as usize] } else { "undefined" };
  format!("{k}{}", if v >= 12.0 { "m" } else { "" })
}

fn get<'a>(m: &'a IndexMap<String, String>, k: &str) -> &'a str { m.get(k).map_or("", String::as_str) }
pub fn nml_path(loc: &IndexMap<String, String>) -> String {
  let (dir, file, vol) = (get(loc, "DIR").split("/:").collect::<Vec<_>>().join("/"), get(loc, "FILE"), get(loc, "VOLUME"));
  let b = vol.as_bytes();
  if b.len() == 2 && b[0].is_ascii_alphabetic() && b[1] == b':' { return format!("{vol}{dir}{file}"); }   // Windows drive
  if vol.is_empty() || vol == "Macintosh HD" { return format!("{dir}{file}"); }                           // macOS boot volume
  format!("/Volumes/{vol}{dir}{file}")
}

pub fn parse_traktor_nml(xml: &str, file_name: &str) -> Result<ImportedLibrary, String> {
  let doc = parse_xml(xml)?;
  let nml = doc.child("NML").ok_or("This isn’t a Traktor NML file.")?;
  let empty = IndexMap::new();
  let mut tracks = vec![];
  for e in nml.child("COLLECTION").into_iter().flat_map(|c| c.children_named("ENTRY")) {
    let Some(loc) = e.child("LOCATION").map(|l| &l.attrs) else { continue };
    if get(loc, "FILE").is_empty() { continue; }
    // Traktor's own content (inside Native Instruments' folders) isn't the user's music.
    if get(loc, "DIR").to_ascii_lowercase().contains("/:native instruments/:") { continue; }
    let mut t = blank_track(format!("{}{}{}", get(loc, "VOLUME"), get(loc, "DIR"), get(loc, "FILE")), nml_path(loc));
    t.title = e.attr("TITLE").unwrap_or("").into(); t.artist = e.attr("ARTIST").unwrap_or("").into();
    t.album = e.child("ALBUM").and_then(|a| a.attr("TITLE")).unwrap_or("").into();
    let info = e.child("INFO").map_or(&empty, |i| &i.attrs);
    let i = |k: &str| info.get(k).map(String::as_str);
    t.genre = get(info, "GENRE").into(); t.comment = get(info, "COMMENT").into(); t.label = get(info, "LABEL").into();
    t.duration = num(i("PLAYTIME")); t.play_count = num(i("PLAYCOUNT"));
    t.rating = num(i("RANKING")).map(|r| round(r / 51.0));
    t.date_added = i("IMPORT_DATE").filter(|d| !d.is_empty()).map(|d| d.replace('/', "-"));
    t.bpm = num(e.child("TEMPO").and_then(|x| x.attr("BPM"))).filter(|&b| b != 0.0);
    let mk = num(e.child("MUSICAL_KEY").and_then(|x| x.attr("VALUE")));
    t.key = i("KEY").filter(|k| !k.is_empty()).map(String::from).or(mk.map(traktor_key));
    t.size = i("FILESIZE").filter(|s| !s.is_empty()).map(|s| num(Some(s)).filter(|&v| v != 0.0).unwrap_or(0.0) * 1024.0);   // in kB
    // CUE_V2: TYPE 0 cue · 1 fade-in · 2 fade-out · 3 load · 4 beat grid (skipped) · 5 loop; START / LEN in ms.
    t.cue_list = e.children_named("CUE_V2").filter(|c| c.attr("TYPE") != Some("4")).map(|c| {
      let ty = c.attr("TYPE").unwrap_or("0");
      let hc = num(c.attr("HOTCUE"));
      let (start, len) = (num(c.attr("START")).unwrap_or(0.0) / 1000.0, num(c.attr("LEN")).unwrap_or(0.0) / 1000.0);
      CuePoint {
        t: start, kind: match ty { "5" => "loop", "3" => "load", "1" | "2" => "fade", _ => "cue" }.into(),
        num: hc.filter(|&h| h >= 0.0), name: c.attr("NAME").filter(|n| !n.is_empty() && *n != "n.n.").unwrap_or("").into(), color: None,
        end: (ty == "5" && len > 0.0).then_some(start + len),
      }
    }).collect();
    t.cue_list.sort_by(|x, y| x.t.partial_cmp(&y.t).unwrap_or(std::cmp::Ordering::Equal));
    t.cues = t.cue_list.len();
    // The grid: the AutoGrid marker (TYPE 4) is a bar's first beat, at the TEMPO's BPM.
    if let (Some(auto), Some(bpm)) = (e.children_named("CUE_V2").find(|c| c.attr("TYPE") == Some("4")), t.bpm) {
      t.grid = grid_at(bpm, num(auto.attr("START")).unwrap_or(0.0) / 1000.0);
    }
    tracks.push(t);
  }
  let mut lists = vec![];
  let mut taken = IndexSet::new();
  fn walk(node: &XNode, parent: Option<&str>, lists: &mut Vec<ImportedList>, taken: &mut IndexSet<String>) {
    for n in node.child("SUBNODES").into_iter().flat_map(|s| s.children_named("NODE")) {
      let name = n.attr("NAME").unwrap_or("");
      let id = path_id(parent, name, taken);
      match n.attr("TYPE") {
        Some("FOLDER") => {
          lists.push(ImportedList { external_id: id.clone(), kind: "folder", name: if name.is_empty() { "Folder".into() } else { name.into() }, parent: parent.map(String::from), items: vec![] });
          walk(n, Some(&id), lists, taken);
        }
        Some("PLAYLIST") => {
          let pl = n.child("PLAYLIST");
          let items = pl.into_iter().flat_map(|p| p.children_named("ENTRY")).filter_map(|en| en.child("PRIMARYKEY").and_then(|k| k.attr("KEY")).filter(|k| !k.is_empty()).map(String::from)).collect();
          // Traktor's playlists carry a UUID: it stays through a rename (ADR 0063).
          let uuid = pl.and_then(|p| p.attr("UUID")).filter(|u| !u.is_empty());
          lists.push(ImportedList { external_id: uuid.map_or(id, |u| format!("u:{u}")), kind: "playlist", name: if name.is_empty() { "Playlist".into() } else { name.into() }, parent: parent.map(String::from), items });
        }
        _ => {}
      }
    }
  }
  if let Some(root) = nml.child("PLAYLISTS").and_then(|p| p.child("NODE")) { walk(root, None, &mut lists, &mut taken); }
  Ok(ImportedLibrary { app: "traktor", name: format!("Traktor ({file_name})"), tracks, lists, stats: None, engine: None })
}
