//! Serato's "database V2" and .crate files (`core/interop/serato.ts`): nested records of a 4-byte tag, a 4-byte
//! big-endian length and the data. The tag's first letter is the type: o nested, t/p UTF-16BE text, u uint32,
//! s uint16, b byte.
use crate::types::*;
use indexmap::IndexMap;

#[derive(Debug)]
pub enum SValue { Text(String), Num(f64), Fields(Vec<SField>), Bytes(Vec<u8>) }
#[derive(Debug)]
pub struct SField { pub tag: String, pub value: SValue }

pub fn parse_serato(b: &[u8]) -> Vec<SField> {
  let mut out = vec![];
  let mut p = 0;
  while p + 8 <= b.len() {
    let tag: String = b[p..p + 4].iter().map(|&c| c as char).collect();
    let len = u32::from_be_bytes([b[p + 4], b[p + 5], b[p + 6], b[p + 7]]) as usize;
    let d = p + 8;
    if d + len > b.len() { break; }
    let data = &b[d..d + len];
    let k = tag.as_bytes()[0];
    let value = if k == b'o' || k == b'r' { SValue::Fields(parse_serato(data)) }
      else if k == b't' || k == b'p' || tag == "vrsn" { SValue::Text(utf16be(data).trim_end_matches('\0').to_string()) }
      else if k == b'u' && len == 4 { SValue::Num(u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as f64) }
      else if k == b's' && len == 2 { SValue::Num(u16::from_be_bytes([data[0], data[1]]) as f64) }
      else if k == b'b' && len == 1 { SValue::Num(data[0] as f64) }
      else { SValue::Bytes(data.to_vec()) };
    out.push(SField { tag, value });
    p = d + len;
  }
  out
}

fn get<'a>(fs: &'a [SField], tag: &str) -> Option<&'a SValue> { fs.iter().find(|f| f.tag == tag).map(|f| &f.value) }
fn text<'a>(fs: &'a [SField], tag: &str) -> &'a str { match get(fs, tag) { Some(SValue::Text(s)) => s, _ => "" } }
/// Serato's paths are relative to the drive's root, without a leading slash.
pub fn serato_path(p: &str) -> String { format!("/{}", p.replace('\\', "/").trim_start_matches('/')) }

pub fn is_serato_database(b: &[u8]) -> bool { b.len() > 8 && &b[..4] == b"vrsn" }

pub fn parse_serato_database(b: &[u8]) -> Result<Vec<ImportedTrack>, String> {
  let mut tracks = vec![];
  for f in parse_serato(b) {
    let SValue::Fields(fs) = &f.value else { continue };
    if f.tag != "otrk" { continue; }
    let path = text(fs, "pfil");
    if path.is_empty() { continue; }
    let mut t = blank_track(lower(&serato_path(path)), serato_path(path));
    t.title = text(fs, "tsng").into(); t.artist = text(fs, "tart").into(); t.album = text(fs, "talb").into(); t.genre = text(fs, "tgen").into();
    t.label = text(fs, "tlbl").into(); t.comment = text(fs, "tcom").into(); t.year = text(fs, "ttyr").into();
    t.bpm = num(Some(text(fs, "tbpm"))).filter(|&b| b != 0.0);
    t.key = Some(text(fs, "tkey")).filter(|k| !k.is_empty()).map(String::from);
    // "03:45.12", or seconds.
    let len = text(fs, "tlen");
    if !len.is_empty() { t.duration = minutes(len).or_else(|| num(Some(len))); }
    if let Some(SValue::Num(added)) = get(fs, "uadd") { if *added > 0.0 { t.date_added = Some(iso_day(*added)?); } }
    let size = text(fs, "tsiz");
    t.size = if size.is_empty() { None } else { num(Some(&size.chars().filter(|c| c.is_ascii_digit() || *c == '.').collect::<String>())) };
    tracks.push(t);
  }
  Ok(tracks)
}
/// `/^(\d+):(\d+(?:\.\d+)?)$/` → minutes × 60 + seconds.
fn minutes(s: &str) -> Option<f64> {
  let (m, sec) = s.split_once(':')?;
  let digits = |x: &str| !x.is_empty() && x.bytes().all(|c| c.is_ascii_digit());
  let sec_ok = match sec.split_once('.') { Some((a, b)) => digits(a) && digits(b), None => digits(sec) };
  (digits(m) && sec_ok).then(|| js_number(m) * 60.0 + js_number(sec))
}

/// A crate's songs. Its name comes from its file's; "%%" separates nested crates.
pub fn parse_serato_crate(b: &[u8]) -> Vec<String> {
  parse_serato(b).iter().filter_map(|f| match &f.value { SValue::Fields(fs) if f.tag == "otrk" => Some(text(fs, "ptrk")), _ => None })
    .filter(|p| !p.is_empty()).map(|p| lower(&serato_path(p))).collect()
}

pub fn build_serato_library(database: &[u8], crates: &[(String, Vec<u8>)]) -> Result<ImportedLibrary, String> {
  let tracks = parse_serato_database(database)?;
  let known: std::collections::HashSet<&str> = tracks.iter().map(|t| t.external_id.as_str()).collect();
  let mut lists = vec![];
  let mut folders: IndexMap<String, String> = IndexMap::new();
  let mut sorted: Vec<&(String, Vec<u8>)> = crates.iter().collect();
  sorted.sort_by(|a, b| collate(&a.0, &b.0));
  for (name, bytes) in sorted {
    let stem = if name.to_ascii_lowercase().ends_with(".crate") { &name[..name.len() - 6] } else { name.as_str() };
    let parts: Vec<&str> = stem.split("%%").collect();
    let mut parent: Option<String> = None;
    for i in 0..parts.len() - 1 {
      let key = parts[..=i].join("%%");
      if !folders.contains_key(&key) {
        let id = format!("f:{key}");
        folders.insert(key.clone(), id.clone());
        lists.push(ImportedList { external_id: id, kind: "folder", name: parts[i].into(), parent: parent.clone(), items: vec![] });
      }
      parent = Some(folders[&key].clone());
    }
    let items = parse_serato_crate(bytes).into_iter().filter(|x| known.contains(x.as_str())).collect();
    lists.push(ImportedList { external_id: format!("c:{name}"), kind: "playlist", name: parts[parts.len() - 1].into(), parent, items });
  }
  Ok(ImportedLibrary { app: "serato", name: "Serato".into(), tracks, lists, stats: None, engine: None })
}
