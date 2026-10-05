//! src/store/backup.ts + src/core/zip.ts: a profile's backup as a zip (ADR 0026), as the website makes it:
//!   mco-backup.json   what's inside (format, version, the profile's name and colour, its collections)
//!   profile/…         everything under GLUE/profiles/<pid>/
//!   files/…           songs GLUE keeps its own copy of (left out with `songs: false`, as GLUE Home's backups are)
//! The website's restore (`readBackup`) reads it: stored or deflate entries, CRC-32, UTF-8 names.
use crate::dir::Dir;
use crate::json::{parse, stringify_pretty};
use crate::store::SCHEMA;
use serde_json::{json, Value};
use std::io::Write;

pub const BACKUP_FORMAT: &str = "mco-backup";
pub const BACKUP_VERSION: u32 = 1;

pub struct ZipEntry { pub path: String, pub data: Vec<u8>, pub mtime: Option<i64> }

/// Every file under `path`, with '/'-separated paths relative to it (folders and files in name order).
fn walk(d: &dyn Dir, path: &str, prefix: &str, out: &mut Vec<(String, String)>) -> Result<(), String> {
  let mut names: Vec<(String, bool)> = d.list(path, false)?.into_iter().map(|n| (n, false)).collect();
  names.extend(d.list(path, true)?.into_iter().map(|n| (n, true)));
  names.sort_by(|a, b| crate::json::utf16_cmp(&a.0, &b.0));
  for (n, is_dir) in names {
    let (full, rel) = (format!("{path}/{n}"), if prefix.is_empty() { n.clone() } else { format!("{prefix}/{n}") });
    if is_dir { walk(d, &full, &rel, out)?; } else { out.push((full, rel)); }
  }
  Ok(())
}

/// `buildBackup(home, profile, { songs })`: the zip's bytes. `created`: the time it's made (ISO).
pub fn build_backup(home: &dyn Dir, profile: &Value, songs: bool, created: &str) -> Result<Vec<u8>, String> {
  let pid = profile["id"].as_str().ok_or("no profile id")?;
  let mut files = vec![];
  walk(home, &format!("profiles/{pid}"), "", &mut files)?;
  if files.is_empty() { return Err("This profile has no files in the GLUE folder.".into()); }
  let mut entries = vec![];
  let mut collections: Vec<Value> = vec![];
  let mut copies: Vec<String> = vec![];
  for (full, rel) in files {
    let data = home.read_bytes(&full)?.unwrap_or_default();
    let parts: Vec<&str> = rel.split('/').collect();
    if parts.len() == 3 && parts[0] == "collections" && parts[2] == "collection.json" {
      if let Ok(c) = parse(&String::from_utf8_lossy(&data)) { collections.push(json!({ "id": c["id"], "name": c["name"], "tracks": 0 })); }
    }
    if parts.len() == 4 && parts[0] == "collections" && parts[2] == "tracks" && parts[3].ends_with(".json") {
      if let Ok(shard) = parse(&String::from_utf8_lossy(&data)) {
        let cid = parts[1];
        let n = shard["items"].as_object().map(|o| o.len()).unwrap_or(0);
        if let Some(c) = collections.iter_mut().find(|c| c["id"] == cid) { c["tracks"] = json!(c["tracks"].as_u64().unwrap_or(0) + n as u64); }
        for t in shard["items"].as_object().into_iter().flat_map(|o| o.values()) {
          if let Some(k) = t["fileKey"].as_str().and_then(|k| k.strip_prefix("copy:")) { if !copies.iter().any(|x| x == k) { copies.push(k.to_string()); } }
        }
      }
    }
    entries.push(ZipEntry { path: format!("profile/{rel}"), data, mtime: home.mtime(&full) });
  }
  if songs {
    for rel in copies { if let Ok(Some(b)) = home.read_bytes(&rel) { entries.push(ZipEntry { path: rel.clone(), data: b, mtime: home.mtime(&rel) }); } }
  }
  let manifest = json!({ "format": BACKUP_FORMAT, "version": BACKUP_VERSION, "createdAt": created, "schemaVersion": SCHEMA,
    "profile": { "id": profile["id"], "name": profile["name"], "color": profile["color"] }, "collections": collections });
  let mut all = vec![ZipEntry { path: "mco-backup.json".into(), data: stringify_pretty(&manifest, 1).into_bytes(), mtime: None }];
  all.extend(entries);
  create_zip(&all, created_ms(created))
}

/// The backup's time (`toISOString()`'s form, UTC) in ms: its files' dates in the zip, so the same backup is the same
/// bytes on any computer. Not that form: now.
fn created_ms(iso: &str) -> i64 {
  let n = |a: usize, b: usize| iso.get(a..b).and_then(|s| s.parse::<i64>().ok());
  let (Some(y), Some(mo), Some(d), Some(h), Some(mi), Some(s)) = (n(0, 4), n(5, 7), n(8, 10), n(11, 13), n(14, 16), n(17, 19)) else {
    return std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
  };
  // Days since 1970-01-01 (Howard Hinnant's days_from_civil).
  let y2 = if mo <= 2 { y - 1 } else { y };
  let era = y2.div_euclid(400);
  let yoe = y2 - era * 400;
  let doy = (153 * (if mo > 2 { mo - 3 } else { mo + 9 }) + 2) / 5 + d - 1;
  let days = era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468;
  ((days * 86_400 + h * 3600 + mi * 60 + s) * 1000) + n(20, 23).unwrap_or(0)
}

/// CRC-32 (zip's).
pub fn crc32(d: &[u8]) -> u32 {
  let mut c: u32 = 0xffff_ffff;
  for &b in d { c ^= b as u32; for _ in 0..8 { c = if c & 1 != 0 { 0xedb8_8320 ^ (c >> 1) } else { c >> 1 }; } }
  c ^ 0xffff_ffff
}

/// MS-DOS time and date (in UTC: the website writes local time; a restore doesn't read them).
fn dos_time(ms: i64) -> (u16, u16) {
  let secs = ms.div_euclid(1000);
  let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
  let (h, m, s) = (rem / 3600, rem % 3600 / 60, rem % 60);
  // Days since 1970 → year, month, day (civil calendar).
  let z = days + 719_468;
  let era = z.div_euclid(146_097);
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let day = doy - (153 * mp + 2) / 5 + 1;
  let month = if mp < 10 { mp + 3 } else { mp - 9 };
  let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
  (((h << 11) | (m << 5) | (s >> 1)) as u16, (((year.max(1980) - 1980) << 9) | (month << 5) | day) as u16)
}

/// `createZip`: deflate-raw entries when they shrink (over 64 bytes), stored otherwise.
pub fn create_zip(entries: &[ZipEntry], now_ms: i64) -> Result<Vec<u8>, String> {
  let (mut out, mut central) = (vec![], vec![]);
  for e in entries {
    let name = e.path.as_bytes();
    let crc = crc32(&e.data);
    let (mut body, mut method) = (e.data.clone(), 0u16);
    if e.data.len() > 64 {
      let mut z = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
      z.write_all(&e.data).map_err(|x| x.to_string())?;
      let z = z.finish().map_err(|x| x.to_string())?;
      if z.len() < e.data.len() { body = z; method = 8; }
    }
    let (time, date) = dos_time(e.mtime.unwrap_or(now_ms));
    let offset = out.len() as u32;
    let le16 = |v: &mut Vec<u8>, x: u16| v.extend_from_slice(&x.to_le_bytes());
    let le32 = |v: &mut Vec<u8>, x: u32| v.extend_from_slice(&x.to_le_bytes());
    le32(&mut out, 0x0403_4b50); le16(&mut out, 20); le16(&mut out, 0x0800); le16(&mut out, method); le16(&mut out, time); le16(&mut out, date);
    le32(&mut out, crc); le32(&mut out, body.len() as u32); le32(&mut out, e.data.len() as u32); le16(&mut out, name.len() as u16); le16(&mut out, 0);
    out.extend_from_slice(name); out.extend_from_slice(&body);
    le32(&mut central, 0x0201_4b50); le16(&mut central, 20); le16(&mut central, 20); le16(&mut central, 0x0800); le16(&mut central, method); le16(&mut central, time); le16(&mut central, date);
    le32(&mut central, crc); le32(&mut central, body.len() as u32); le32(&mut central, e.data.len() as u32); le16(&mut central, name.len() as u16);
    le16(&mut central, 0); le16(&mut central, 0); le16(&mut central, 0); le16(&mut central, 0); le32(&mut central, 0); le32(&mut central, offset);
    central.extend_from_slice(name);
    if out.len() > u32::MAX as usize { return Err("The backup is larger than 4 GB, which this zip format can’t hold.".into()); }
  }
  let (cen_off, cen_len) = (out.len() as u32, central.len() as u32);
  out.extend_from_slice(&central);
  out.extend_from_slice(&0x0605_4b50u32.to_le_bytes()); out.extend_from_slice(&[0, 0, 0, 0]);
  out.extend_from_slice(&(entries.len() as u16).to_le_bytes()); out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
  out.extend_from_slice(&cen_len.to_le_bytes()); out.extend_from_slice(&cen_off.to_le_bytes()); out.extend_from_slice(&[0, 0]);
  Ok(out)
}

/// `readZip` (for the tests, and to read a backup back): its entries' paths and bytes.
pub fn read_zip(zip: &[u8]) -> Result<Vec<(String, Vec<u8>)>, String> {
  let u16at = |i: usize| u16::from_le_bytes([zip[i], zip[i + 1]]) as usize;
  let u32at = |i: usize| u32::from_le_bytes(zip[i..i + 4].try_into().unwrap()) as usize;
  let eocd = (0..=zip.len().saturating_sub(22)).rev().find(|&i| u32at(i) == 0x0605_4b50).ok_or("This isn’t a zip file.")?;
  let (count, mut p) = (u16at(eocd + 10), u32at(eocd + 16));
  let mut out = vec![];
  for _ in 0..count {
    if u32at(p) != 0x0201_4b50 { return Err("The zip file is damaged.".into()); }
    let (method, crc, csize) = (u16at(p + 10), u32at(p + 16) as u32, u32at(p + 20));
    let (nlen, xlen, clen, lho) = (u16at(p + 28), u16at(p + 30), u16at(p + 32), u32at(p + 42));
    let path = String::from_utf8_lossy(&zip[p + 46..p + 46 + nlen]).into_owned();
    p += 46 + nlen + xlen + clen;
    let start = lho + 30 + u16at(lho + 26) + u16at(lho + 28);
    let body = &zip[start..start + csize];
    let data = match method {
      0 => body.to_vec(),
      8 => { let mut d = flate2::read::DeflateDecoder::new(body); let mut v = vec![]; std::io::Read::read_to_end(&mut d, &mut v).map_err(|e| e.to_string())?; v }
      _ => return Err(format!("The zip uses a compression GLUE can’t read ({path}).")),
    };
    if crc32(&data) != crc { return Err(format!("The zip file is damaged ({path}).")); }
    out.push((path, data));
  }
  Ok(out)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::dir::MemDir;

  #[test]
  fn a_backup_holds_the_profile_and_says_what_it_is() {
    let big = "x".repeat(500);
    let d = MemDir::with([
      ("profiles/p1/profile.json".to_string(), r##"{"id":"p1","name":"DJ","color":"#fff"}"##.to_string()),
      ("profiles/p1/collections/c1/collection.json".to_string(), r#"{"schemaVersion":1,"id":"c1","name":"Main","roots":[]}"#.to_string()),
      ("profiles/p1/collections/c1/tracks/ab.json".to_string(), format!(r#"{{"schemaVersion":1,"items":{{"ab1":{{"id":"ab1","fileKey":"copy:files/a.mp3","notes":"{big}"}},"ab2":{{"id":"ab2"}}}}}}"#)),
      ("files/a.mp3".to_string(), "song".to_string()),
      ("profiles/p2/profile.json".to_string(), "{}".to_string()),
    ]);
    let profile = parse(r##"{"id":"p1","name":"DJ","color":"#fff"}"##).unwrap();
    let zip = build_backup(&d, &profile, false, "2026-10-05T00:00:00.000Z").unwrap();
    let e = read_zip(&zip).unwrap();
    let paths: Vec<&str> = e.iter().map(|x| x.0.as_str()).collect();
    assert_eq!(paths, ["mco-backup.json", "profile/collections/c1/collection.json", "profile/collections/c1/tracks/ab.json", "profile/profile.json"]);
    assert_eq!(String::from_utf8_lossy(&e[0].1), "{\n \"format\": \"mco-backup\",\n \"version\": 1,\n \"createdAt\": \"2026-10-05T00:00:00.000Z\",\n \"schemaVersion\": 1,\n \"profile\": {\n  \"id\": \"p1\",\n  \"name\": \"DJ\",\n  \"color\": \"#fff\"\n },\n \"collections\": [\n  {\n   \"id\": \"c1\",\n   \"name\": \"Main\",\n   \"tracks\": 2\n  }\n ]\n}");
    assert!(String::from_utf8_lossy(&e[2].1).contains(&big));
    // With the songs GLUE keeps copies of.
    let zip = build_backup(&d, &profile, true, "2026-10-05T00:00:00.000Z").unwrap();
    assert!(read_zip(&zip).unwrap().iter().any(|x| x.0 == "files/a.mp3" && x.1 == b"song"));
    // The website reads it (tests/store.golden.test.ts reads this file with readBackup): kept, and the same bytes
    // every time. GOLDEN=1 writes it again.
    assert_eq!(created_ms("2026-10-05T00:00:00.000Z"), 1_791_158_400_000);
    assert_eq!(created_ms("2000-02-29T12:34:56.789Z"), 951_827_696_789);
    let at = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden/store/backup.zip");
    if std::env::var("GOLDEN").is_ok() { std::fs::write(&at, &zip).unwrap(); }
    assert_eq!(std::fs::read(&at).unwrap(), zip, "tests/golden/store/backup.zip: GOLDEN=1 cargo test writes it again");
  }
}
