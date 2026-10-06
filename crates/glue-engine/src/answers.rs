//! What the account's other devices ask GLUE Home (ADR 0045, 0150), answered here (ADR 0156); home/ui/service.ts's
//! `onRequest` and home/ui/cache.ts's helpers before. GLUE Home's connections (crates/glue-rtc) hand each request
//! they don't answer themselves (`ping`, `put`, `cache`) to `Engine::answer`, and send what it says: data and bytes,
//! or a song's file from disk.
//! - `get`, `range`: a song of a collection (or of the incoming folder) to play or download.
//! - `thumbs`: mini spectrograms or waveforms (`wave`), kept or made now from the kept analysis; a song without is
//!   analysed next, for the next ask.
//! - `details`: a song's full analysis; made now, first in line, when there's none ("pending" after 12 s: the page asks
//!   again).
//! - `have`: which songs have each kept, and the covers kept.
//! - `art`: covers, kept or read from the songs' tags now; `find-art`: covers looked up on public services (covers.rs).
//! - `incoming`, `get-incoming`, `move-incoming`: the incoming folder (TO BE SORTED, ADR 0048).
//! - `analysis`: the analysis queue asked about by the tab on this computer (ADR 0103, 0154).
//! - `local`: how a GLUE page on this computer reaches GLUE Home without GLUE Cloud (ADR 0048).
//! - `folders`: the music folders GLUE Home knows, to move a song into.
use crate::analyse::key;
use crate::covers::Query;
use crate::{text, truthy, Engine, Host};
use glue_store::dir::Dir;
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

/// src/core/transfer.ts `PENDING`: made now, ask again.
pub const PENDING: &str = "pending";
const HEX: &[u8] = b"0123456789abcdef";

/// What to send back.
#[derive(Debug)]
pub enum Answer {
  /// Data (JSON) and bytes; `tell`: said to every session afterwards (the incoming folder changed).
  Data { data: Value, bytes: Vec<u8>, tell: Option<Value> },
  /// A song's file (or part of it: start, length), sent from disk by the connection.
  File { path: String, range: Option<(u64, u64)>, name: String, typ: String },
}
fn data(v: Value) -> Answer { Answer::Data { data: v, bytes: vec![], tell: None } }

type Urgent = (String, String, String, Vec<mpsc::Sender<bool>>);
/// What the answers keep between requests.
#[derive(Default)]
pub struct Devices {
  pub(crate) lookups: crate::covers::Lookups,
  /// Songs analysed now for another device, first come first (a song page's ask goes first), and whether one runs.
  urgent: Mutex<(VecDeque<Urgent>, bool)>,
  /// Where a song being streamed is (looked up once a minute, not for each part).
  located: Mutex<HashMap<String, (String, String, Instant)>>,
  /// The background's mini spectrograms and waveforms (`background`).
  background: Mutex<Background>,
}

/// home/ui/service.ts `TYPES`.
pub fn type_of(name: &str) -> &'static str {
  match name.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
    "mp3" => "audio/mpeg", "flac" => "audio/flac", "wav" => "audio/wav", "aif" | "aiff" => "audio/aiff", "m4a" | "mp4" | "alac" => "audio/mp4",
    "aac" => "audio/aac", "ogg" | "opus" => "audio/ogg", _ => "",
  }
}
fn safe_hash(h: &str) -> bool { (8..=64).contains(&h.len()) && h.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn ids(v: &Value, max: usize) -> Vec<String> { v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).take(max).collect()).unwrap_or_default() }
fn joined(parts: Vec<Vec<u8>>) -> Vec<u8> { parts.concat() }

impl<H: Host> Engine<H> {
  /// The answer to another device's request (its `t` says what), or why there's none.
  pub fn answer(self: &Arc<Self>, c: &Value) -> Result<Answer, String> {
    let cfg = self.host.config();
    let need = || -> Result<(), String> { if cfg["glue"].as_str().is_none_or(|g| g.is_empty()) { Err("GLUE Home doesn’t know this computer’s GLUE folder: choose it in its settings.".into()) } else { Ok(()) } };
    // Asked with a folder that isn't this collection's (a computer's entry that named the wrong one, ADR 0108): the
    // folder that has it.
    let (mut p, col) = (text(c, "profile"), text(c, "collection"));
    if !p.is_empty() && !col.is_empty() { p = self.folder_of(&p, &col); }
    let t = text(c, "t");
    // A song streamed to another device: the analysis lets it go first (ADR 0138).
    if t == "get" || t == "range" { self.played(); }
    match t.as_str() {
      "get" => {
        need()?;
        let f = self.song_here(&p, &col, &text(c, "track"), &cfg)?;
        Ok(Answer::File { typ: type_of(&f.1).into(), path: f.0, name: f.1, range: None })
      }
      "range" => {
        // Part of a song (streaming, ADR 0076): a collection's song, or one in the incoming folder; at most 8 MB.
        let (path, name) = if !text(c, "incoming").is_empty() {
          let f = self.incoming_file(&text(c, "incoming"))?;
          (f["path"].as_str().unwrap_or("").to_string(), f["name"].as_str().unwrap_or("").to_string())
        } else {
          need()?;
          let k = format!("{p}/{col}/{}", text(c, "track"));
          let known = self.devices.located.lock().unwrap().get(&k).filter(|x| x.2.elapsed() < Duration::from_secs(60)).map(|x| (x.0.clone(), x.1.clone()));
          match known {
            Some(x) => x,
            None => {
              let f = self.song_here(&p, &col, &text(c, "track"), &cfg)?;
              let mut l = self.devices.located.lock().unwrap();
              if l.len() > 200 { l.clear(); }
              l.insert(k, (f.0.clone(), f.1.clone(), Instant::now()));
              f
            }
          }
        };
        let n = |k: &str| c[k].as_f64().unwrap_or(0.0).max(0.0) as u64;
        Ok(Answer::File { typ: type_of(&name).into(), path, name, range: Some((n("start"), n("len"))) })
      }
      "thumbs" => {
        need()?;
        let wave = truthy(c.get("wave"));
        let (mut found, mut parts) = (vec![], vec![]);
        for id in ids(&c["tracks"], 200) {
          // Waveforms (ADR 0085): kept, or made now from the kept full analysis.
          let b = if wave { self.kept_wave(&p, &col, &id).or_else(|| self.wave_from_details(&p, &col, &id)) } else { self.cache_bytes(&key("t", &p, &col, &id, "bin")) };
          found.push(json!([id, b.as_ref().map_or(0, |b| b.len())]));
          match b { Some(b) => parts.push(b), None => { let _ = self.soon(&p, &col, &id, false); } }   // made next, for the next ask
        }
        Ok(Answer::Data { data: Value::Array(found), bytes: joined(parts), tell: None })
      }
      "details" => {
        need()?;
        let id = text(c, "track");
        let d = match self.kept_details(&p, &col, &id) {
          Some(d) => Some(d),
          None => {
            // Made now, first in line; if it takes long, the page asks again (it shows the summary meanwhile).
            match self.soon(&p, &col, &id, true).recv_timeout(Duration::from_secs(12)) {
              Err(_) => return Err(PENDING.into()),
              Ok(true) => self.kept_details(&p, &col, &id),
              Ok(false) => None,
            }
          }
        };
        let (h, bin) = d.ok_or("GLUE Home couldn’t analyse that song.")?;
        Ok(Answer::Data { data: h, bytes: bin, tell: None })
      }
      "have" => { let mut k = self.kept(&p, &col); k["art"] = json!(self.art_kept()); Ok(data(k)) }
      "art" => {
        // Songs' covers (ADR 0082): kept, or read from the song's tags now (and kept for next time).
        let px = if c["px"].as_f64() == Some(320.0) { 320 } else { 64 };
        let (mut found, mut parts) = (vec![], vec![]);
        for it in c["items"].as_array().into_iter().flatten().take(60) {
          let track = text(it, "track");
          let mut hash = text(it, "hash");
          let mut b = if hash.is_empty() { None } else { self.art(&hash, px) };
          if b.is_none() { hash = self.cover_hash(&p, &col, &track, &cfg).unwrap_or_default(); b = if hash.is_empty() { None } else { self.art(&hash, px) }; }
          found.push(json!([track, hash, b.as_ref().map_or(0, |b| b.len())]));
          if let Some(b) = b { parts.push(b); }
        }
        Ok(Answer::Data { data: Value::Array(found), bytes: joined(parts), tell: None })
      }
      "find-art" => {
        // Covers from public services (ADR 0086): known, or looked up now (the device asks again).
        let px = if c["px"].as_f64() == Some(320.0) { 320 } else { 64 };
        let (mut found, mut parts) = (vec![], vec![]);
        for it in c["items"].as_array().into_iter().flatten().take(60) {
          let (id, q) = (text(it, "id"), Query::from_json(it));
          if truthy(c.get("refuse")) { self.cover_refuse(&q); found.push(json!([id, "", 0])); continue; }
          let Some(hash) = self.cover_known(&q) else { self.cover_want(q); found.push(json!([id, "?", 0])); continue };
          let b = if !hash.is_empty() && hash != "x" { self.art(&hash, px) } else { None };
          found.push(json!([id, if b.is_some() { hash.as_str() } else { "" }, b.as_ref().map_or(0, |b| b.len())]));
          if let Some(b) = b { parts.push(b); }
        }
        Ok(Answer::Data { data: Value::Array(found), bytes: joined(parts), tell: None })
      }
      "incoming" => {
        // With the analysis made when each song arrived.
        let list: Vec<Value> = self.incoming_list().into_iter().map(|f| {
          let summary = self.cache_bytes(&format!("i/{}.summary.json", text(&f, "name"))).and_then(|b| serde_json::from_slice::<Value>(&b).ok()).unwrap_or(Value::Null);
          json!({ "name": f["name"], "size": f["size"], "mtime": f["mtime"], "summary": summary })
        }).collect();
        Ok(data(Value::Array(list)))
      }
      "analysis" => {
        // The analysis of this computer's songs (ADR 0103, 0154): asked about, paused (kept in the settings), songs
        // asked for now; the tab on this computer takes the results in (and says which).
        let m = json!({ "p": p, "c": col, "take": c["take"], "pause": c["pause"], "now": c["now"], "names": c["names"], "taken": c["taken"] });
        Ok(data(self.analysis_ask(&m)))
      }
      // The website on this computer: how to reach GLUE Home without GLUE Cloud (ADR 0048); the read-only token too
      // (ADR 0104).
      "local" => Ok(data(self.host.local_link())),
      "get-incoming" => {
        let f = self.incoming_file(&text(c, "name"))?;
        let name = text(&f, "name");
        Ok(Answer::File { typ: type_of(&name).into(), path: text(&f, "path"), name, range: None })
      }
      "folders" => {
        let (mut out, lib): (Vec<Value>, Value) = (vec![], self.describe().unwrap_or(Value::Null));
        for pr in lib["profiles"].as_array().into_iter().flatten() { for co in pr["collections"].as_array().into_iter().flatten() { for r in co["roots"].as_array().into_iter().flatten() {
          let id = text(r, "id");
          if cfg["folders"][&id].as_str().is_some_and(|s| !s.is_empty()) && !out.iter().any(|x| x["id"] == json!(id)) {
            out.push(json!({ "id": id, "name": r["name"], "collection": format!("{} · {}", text(pr, "name"), text(co, "name")) }));
          }
        } } }
        Ok(data(Value::Array(out)))
      }
      "move-incoming" => {
        let to = cfg["folders"][text(c, "folder")].as_str().filter(|s| !s.is_empty()).ok_or("GLUE Home doesn’t know that music folder.")?;
        let path = crate::incoming::move_to(&self.host.incoming_dir(), &text(c, "name"), std::path::Path::new(to))?;
        Ok(Answer::Data { data: json!(path), bytes: vec![], tell: Some(json!({ "t": "event", "kind": "incoming" })) })
      }
      _ => Err("GLUE Home doesn’t know that request".into()),
    }
  }

  /// A song of a collection on this computer: its path and name. A music folder found by name is remembered (GLUE
  /// Home may read it from now on).
  fn song_here(&self, p: &str, c: &str, id: &str, cfg: &Value) -> Result<(String, String), String> {
    let f = self.track_path(p, c, id, cfg)?;
    if let Some((fid, at)) = &f.folder {
      let seen = cfg["folders"].get(fid).cloned();
      let (fid, at) = (fid.clone(), at.clone());
      self.host.patch_config(&move |cur| {
        if cur["folders"].get(&fid).cloned() != seen { return None; }
        let mut folders = cur["folders"].as_object().cloned().unwrap_or_default();
        folders.insert(fid.clone(), json!(at));
        Some(json!({ "folders": folders }))
      });
    }
    Ok((f.path, f.name))
  }
  fn incoming_list(&self) -> Vec<Value> { crate::incoming::list(&self.host.incoming_dir()) }
  fn incoming_file(&self, name: &str) -> Result<Value, String> {
    self.incoming_list().into_iter().find(|f| f["name"].as_str() == Some(name)).ok_or_else(|| "That song isn’t in the incoming folder any more.".into())
  }

  fn cache_bytes(&self, rel: &str) -> Option<Vec<u8>> { self.cache_dir().read_bytes(rel).ok().flatten() }
  fn kept_wave(&self, p: &str, c: &str, id: &str) -> Option<Vec<u8>> {
    self.cache_bytes(&key("w", p, c, id, "bin")).filter(|b| b.len() == glue_audio::out::files::WAVE_BYTES)
  }
  /// A song's full analysis kept here (of this version): its header and block.
  fn kept_details(&self, p: &str, c: &str, id: &str) -> Option<(Value, Vec<u8>)> {
    let h: Value = serde_json::from_slice(&self.cache_bytes(&key("d", p, c, id, "json"))?).ok()?;
    let bin = self.cache_bytes(&key("d", p, c, id, "bin"))?;
    (h["v"].as_f64() == Some(glue_audio::out::files::DETAILS_VERSION)).then_some((h, bin))
  }
  /// A song's waveform made from its kept full analysis (no need to read the song again), kept; None when there's none
  /// of this version.
  pub fn wave_from_details(&self, p: &str, c: &str, id: &str) -> Option<Vec<u8>> {
    let (h, bin) = (self.cache_bytes(&key("d", p, c, id, "json"))?, self.cache_bytes(&key("d", p, c, id, "bin"))?);
    let w = crate::analyse::wave_of(&h, &bin);
    if w.is_empty() { return None; }
    let _ = self.cache_dir().write_bytes(&key("w", p, c, id, "bin"), &w);
    Some(w)
  }
  /// The ids with a mini spectrogram, a waveform, a full analysis kept, in one collection.
  pub fn kept(&self, p: &str, c: &str) -> Value {
    let (mut t, mut w, mut d) = (vec![], vec![], vec![]);
    let d0 = self.cache_dir();
    for a in HEX { for b in HEX {
      let sh = format!("{}{}", *a as char, *b as char);
      let list = |dir: &str| d0.list(&format!("{dir}/{p}/{c}/{sh}"), false).unwrap_or_default();
      t.extend(list("t").into_iter().filter_map(|f| f.strip_suffix(".bin").map(String::from)));
      w.extend(list("w").into_iter().filter_map(|f| f.strip_suffix(".bin").map(String::from)));
      d.extend(list("d").into_iter().filter_map(|f| f.strip_suffix(".json").map(String::from)));
    } }
    json!({ "thumbs": t, "waves": w, "details": d })
  }
  /// The hashes of the covers kept, both sizes.
  pub fn art_kept(&self) -> Vec<String> {
    let files: std::collections::HashSet<String> = self.cache_dir().list("a", false).unwrap_or_default().into_iter().collect();
    let mut out: Vec<String> = files.iter().filter_map(|f| f.strip_suffix("-64.jpg")).filter(|h| files.contains(&format!("{h}-320.jpg"))).map(String::from).collect();
    out.sort();
    out
  }
  fn art(&self, hash: &str, px: u32) -> Option<Vec<u8>> { if safe_hash(hash) { self.cache_bytes(&format!("a/{hash}-{px}.jpg")) } else { None } }
  /// A song's cover hash ('' none): known, or read from its tags now (only the tags; the cover and the hash kept).
  pub fn cover_hash(&self, p: &str, c: &str, id: &str, cfg: &Value) -> Result<String, String> {
    if let Some(b) = self.cache_bytes(&key("c", p, c, id, "txt")) { return Ok(String::from_utf8_lossy(&b).into_owned()); }
    let f = self.track_path(p, c, id, cfg)?;
    let file = std::fs::File::open(&f.path).map_err(|e| e.to_string())?;
    let cover = glue_audio::out::cover::picture_from(std::io::BufReader::new(file)).and_then(|pic| glue_audio::out::cover::from_image(&pic).ok());
    if let Some(cv) = &cover { self.keep_cover(cv)?; }
    let hash = cover.map(|c| c.hash).unwrap_or_default();
    self.cache_dir().write_bytes(&key("c", p, c, id, "txt"), hash.as_bytes())?;
    Ok(hash)
  }

  /// Analysed now for another device (`first`: its song page; else rows on its screen), one at a time, the results
  /// for the library too: told when done (true) or not (false).
  pub fn soon(self: &Arc<Self>, p: &str, c: &str, id: &str, first: bool) -> mpsc::Receiver<bool> {
    let (tx, rx) = mpsc::channel();
    {
      let mut g = self.devices.urgent.lock().unwrap();
      let j = match g.0.iter().position(|j| j.0 == p && j.1 == c && j.2 == id) { Some(i) => g.0.remove(i).unwrap(), None => (p.into(), c.into(), id.into(), vec![]) };
      let mut j = j;
      j.3.push(tx);
      if first { g.0.push_front(j) } else { g.0.push_back(j) }
      if std::mem::replace(&mut g.1, true) { return rx; }
    }
    let me = self.clone();
    std::thread::spawn(move || loop {
      let Some(j) = ({ let mut g = me.devices.urgent.lock().unwrap(); let j = g.0.pop_front(); if j.is_none() { g.1 = false; } j }) else { return };
      let ok = me.analyse_song(&j.0, &j.1, &j.2, &me.host.config(), true).is_ok();
      for d in j.3 { let _ = d.send(ok); }
    });
    rx
  }
  /// Songs being analysed for other devices (or waiting to be).
  pub fn devices_busy(&self) -> bool { let g = self.devices.urgent.lock().unwrap(); g.1 || !g.0.is_empty() }
}

/// The background's progress (GLUE Home's window shows it): songs done of those to do, and whether it runs.
#[derive(Default, Clone, Copy)]
pub struct Background { pub done: usize, pub total: usize, pub running: bool }
impl Background { pub fn to_json(&self) -> Value { json!({ "done": self.done, "total": self.total, "running": self.running }) } }

impl<H: Host> Engine<H> {
  pub fn background_json(&self) -> Value { self.devices.background.lock().unwrap().to_json() }
  fn background_set(&self, f: impl FnOnce(&mut Background)) { let v = { let mut b = self.devices.background.lock().unwrap(); f(&mut b); b.to_json() }; self.host.background_changed(&v); }
  /// Every shared song of this computer without a mini spectrogram or a waveform, made one at a time and gently, so
  /// other devices find them ready (ADR 0046, 0085). It steps aside while GLUE Home sends or receives for a device,
  /// analyses for one, or analyses the library (which makes these too). One run at a time.
  pub fn background(self: &Arc<Self>) {
    if self.host.config()["glue"].as_str().is_none_or(|g| g.is_empty()) { return; }
    { let mut b = self.devices.background.lock().unwrap(); if b.running { return; } *b = Background { running: true, ..Default::default() }; }
    let me = self.clone();
    std::thread::spawn(move || {
      let todo = me.background_todo();
      me.background_set(|b| b.total = todo.len());
      for (p, c, id) in todo {
        while me.background_waits() { std::thread::sleep(Duration::from_secs(1)); }
        let cfg = me.host.config();
        if !crate::library::shared(&cfg, &p, &c) { continue; }
        // Made meanwhile, or only the waveform missing: from the kept analysis if it can be.
        let has_thumb = me.cache_bytes(&key("t", &p, &c, &id, "bin")).is_some();
        if !(has_thumb && (me.kept_wave(&p, &c, &id).is_some() || me.wave_from_details(&p, &c, &id).is_some())) {
          let _ = me.analyse_song(&p, &c, &id, &cfg, false);   // not found or not decodable: skipped
          std::thread::sleep(Duration::from_millis(1500));    // gently: this computer is in use too
        }
        let done = { let mut b = me.devices.background.lock().unwrap(); b.done += 1; b.done };
        if done % 10 == 0 { me.background_set(|_| {}); }
      }
      me.background_set(|b| b.running = false);
    });
  }
  fn background_waits(&self) -> bool { !self.host.running() || self.host.serving() || self.devices_busy() || self.analysis_busy() }
  /// The shared collections' songs on this computer still missing a mini spectrogram or a waveform.
  fn background_todo(&self) -> Vec<(String, String, String)> {
    let cfg = self.host.config();
    let mut todo = vec![];
    let lib = self.describe().unwrap_or(Value::Null);
    for pr in lib["profiles"].as_array().into_iter().flatten() { for co in pr["collections"].as_array().into_iter().flatten() {
      let (p, c) = (text(pr, "id"), text(co, "id"));
      if !crate::library::shared(&cfg, &p, &c) { continue; }
      let k = self.kept(&p, &c);
      let set = |n: &str| -> std::collections::HashSet<String> { k[n].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect() };
      let (thumbs, waves) = (set("thumbs"), set("waves"));
      let seen = self.seen(&p, &c, cfg["computer"].as_str());
      for f in self.dir().list(&format!("profiles/{p}/collections/{c}/tracks"), false).unwrap_or_default().into_iter().filter(|n| n.ends_with(".json")) {
        let Ok(Some(shard)) = glue_store::dir::read_json(&self.dir(), &format!("profiles/{p}/collections/{c}/tracks/{f}")) else { continue };
        for raw in shard["items"].as_object().into_iter().flatten().map(|x| x.1) {
          let t = seen.track(raw);
          let id = text(&t, "id");
          if text(&t, "status") == "linked" && !text(&t, "rootId").is_empty() && !text(&t, "relPath").is_empty() && (!thumbs.contains(&id) || !waves.contains(&id)) { todo.push((p.clone(), c.clone(), id)); }
        }
      }
    } }
    todo
  }
}
