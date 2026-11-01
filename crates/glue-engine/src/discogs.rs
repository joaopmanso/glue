//! Discogs, with the user's personal access token (ADR 0186): GLUE Home's settings keep it (`discogsToken`, this
//! computer's only). It goes to Discogs' API only (`API`, web.rs), at most a request every 1.1 s (Discogs allows 60 a
//! minute with a token), sharing the cover look-up's pace. Checked once set: `discogsUser` (the account's name) and
//! `discogsAt` (when) in the settings, or `discogsError`.
use crate::covers::Service;
use crate::{Engine, Host};
use glue_store::dir::{read_json, write_json};
use serde_json::{json, Value};
use std::collections::HashMap;

/// Discogs' API: the only address the token is sent to.
pub const API: &str = "https://api.discogs.com/";

/// The token in GLUE Home's settings, if any.
pub fn token(cfg: &Value) -> Option<String> {
  cfg["discogsToken"].as_str().map(str::trim).filter(|t| !t.is_empty()).map(String::from)
}

impl<H: Host> Engine<H> {
  /// A GET of Discogs' API with the token, at the shared pace: the answer as JSON.
  pub fn discogs_get(&self, path: &str) -> Result<Value, String> {
    let body = self.cover_ask(Service::Discogs, &format!("{API}{path}"))?;
    let v: Value = serde_json::from_slice(&body).map_err(|_| "Discogs' answer wasn't understood".to_string())?;
    if let Some(m) = v["message"].as_str().filter(|_| v.get("pagination").is_none() && v.get("username").is_none()) { return Err(m.to_string()); }
    Ok(v)
  }
  /// The token checked with Discogs (`/oauth/identity`): the account's name kept in the settings, or why not. Covers
  /// that found nothing before are looked up again (`discogsAt`, covers.rs `cover_known`).
  pub fn discogs_check(&self) {
    let cfg = self.host.config();
    let Some(t) = token(&cfg) else {
      self.host.patch_config(&|c| (c.get("discogsUser").is_some() || c.get("discogsError").is_some()).then(|| json!({ "discogsUser": null, "discogsError": null })));
      return;
    };
    let r = self.discogs_get("oauth/identity");
    self.host.patch_config(&|c| {
      if token(c).as_deref() != Some(t.as_str()) { return None; }   // changed meanwhile: that one gets its own check
      Some(match &r {
        Ok(v) if v["username"].as_str().is_some_and(|u| !u.is_empty()) => json!({ "discogsUser": v["username"], "discogsAt": crate::now().0, "discogsError": null }),
        Ok(_) => json!({ "discogsUser": null, "discogsError": "Discogs didn’t say whose token this is" }),
        Err(e) => json!({ "discogsUser": null, "discogsError": if e.contains("401") { "Discogs doesn’t accept this token".to_string() } else { e.clone() } }),
      })
    });
  }
}

// ---- the user's collection and wantlist (ADR 0187) -------------------------------------------------------------------

/// Records a page (Discogs' most for these lists).
const PAGE: u32 = 100;
/// Read again after this long (the service's daily look), or on Refresh.
const AGAIN_MS: i64 = 20 * 3600 * 1000;

/// A record's cover that couldn't be fetched (`art`): not a hash, so the page shows none.
const NO_ART: &str = "none";
/// Something to fetch still: a cover not tried, or a tracklist not read.
fn lacks(l: &Value) -> bool {
  ["records", "wants"].iter().flat_map(|k| l[*k].as_array().into_iter().flatten()).any(|r| r.get("tracks").is_none() || (r["art"].as_str() == Some("") && r["cover"].as_str().is_some_and(|c| !c.is_empty())))
}

/// Where it's kept: the GLUE folder (the profile's, ADR 0009) and GLUE Home's own copy (read while a tab holds the lease).
pub fn file_of(p: &str) -> String { format!("profiles/{p}/discogs.json") }
fn cached_of(p: &str) -> String { format!("discogs/{p}.json") }

/// A collection or wantlist item as GLUE keeps it: the release's id, the copy's (`instance`), its names, labels with
/// catalogue numbers, year, formats ("Vinyl", "12 inch", "LP"…), genres and styles, when it was added, its rating, its
/// cover's address on Discogs and (once fetched) the cover's hash in GLUE Home's cache (`art`).
pub fn record_of(item: &Value, had: Option<&Value>) -> Option<Value> {
  let b = item.get("basic_information")?;
  let id = b["id"].as_i64()?;
  let names = |k: &str| -> Vec<Value> { b[k].as_array().into_iter().flatten().filter_map(|x| x["name"].as_str().map(|s| json!(s))).collect() };
  let strs = |k: &str| -> Vec<Value> { b[k].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(|s| json!(s))).collect() };
  let labels: Vec<Value> = b["labels"].as_array().into_iter().flatten().map(|l| json!({ "name": l["name"].as_str().unwrap_or(""), "catno": l["catno"].as_str().unwrap_or("") })).collect();
  let mut formats: Vec<Value> = vec![];
  for f in b["formats"].as_array().into_iter().flatten() {
    for s in std::iter::once(&f["name"]).chain(f["descriptions"].as_array().into_iter().flatten()) {
      if let Some(s) = s.as_str().filter(|s| !s.is_empty()) { if !formats.iter().any(|x| x == s) { formats.push(json!(s)); } }
    }
  }
  let cover = b["cover_image"].as_str().filter(|c| !c.is_empty() && !c.ends_with("spacer.gif")).or(b["thumb"].as_str().filter(|c| !c.is_empty())).unwrap_or("");
  // The cover already fetched for the same picture stays.
  let art = had.filter(|h| h["cover"].as_str() == Some(cover)).and_then(|h| h["art"].as_str()).unwrap_or("");
  // Its tracklist, once read (a record's doesn't change): kept from the last read.
  let tracks = had.and_then(|h| h.get("tracks")).filter(|t| t.is_array()).cloned();
  Some(json!({
    "id": id, "instance": item["instance_id"], "title": b["title"].as_str().unwrap_or(""), "artists": names("artists"), "labels": labels,
    "year": b["year"].as_i64().filter(|y| *y > 0), "formats": formats, "genres": strs("genres"), "styles": strs("styles"),
    "added": item["date_added"].as_str().unwrap_or(""), "rating": item["rating"].as_i64().unwrap_or(0), "cover": cover, "art": art,
  })).map(|mut r: Value| { if let Some(t) = tracks { r["tracks"] = t; } r })
}

/// "4:05" (or "1:02:03") as seconds; None when Discogs doesn't say.
fn seconds(d: &str) -> Option<f64> {
  let parts: Vec<f64> = d.trim().split(':').map(|p| p.trim().parse::<f64>()).collect::<Result<_, _>>().ok()?;
  (!parts.is_empty() && parts.len() <= 3).then(|| parts.iter().fold(0.0, |a, p| a * 60.0 + p)).filter(|s| *s > 0.0)
}
/// A release's tracklist (`/releases/{id}`) as GLUE keeps it: each track's position, title, own artists (a
/// compilation's) and length; headings and index tracks left out.
pub fn tracks_of(release: &Value) -> Vec<Value> {
  release["tracklist"].as_array().into_iter().flatten().filter(|t| t["type_"].as_str().is_none_or(|k| k == "track")).filter_map(|t| {
    let title = t["title"].as_str().filter(|x| !x.trim().is_empty())?;
    let artists: Vec<&str> = t["artists"].as_array().into_iter().flatten().filter_map(|a| a["name"].as_str()).collect();
    Some(json!({ "p": t["position"].as_str().unwrap_or(""), "title": title, "artists": artists, "d": seconds(t["duration"].as_str().unwrap_or("")) }))
  }).collect()
}

impl<H: Host> Engine<H> {
  /// Every page of a list (`path`, to which `per_page` and `page` are added), as records; `had`: the last read's, by
  /// release id (their covers).
  fn discogs_pages(&self, path: &str, key: &str, had: &HashMap<i64, Value>, what: &str) -> Result<Vec<Value>, String> {
    let mut out = vec![];
    let mut page = 1;
    loop {
      let v = self.discogs_get(&format!("{path}&per_page={PAGE}&page={page}"))?;
      for it in v[key].as_array().into_iter().flatten() {
        let id = it["basic_information"]["id"].as_i64().unwrap_or(0);
        if let Some(r) = record_of(it, had.get(&id)) { out.push(r); }
      }
      let pages = v["pagination"]["pages"].as_u64().unwrap_or(1) as u32;
      *self.devices.discogs.lock().unwrap() = json!({ "reading": { "what": what, "done": page, "of": pages } });
      if page >= pages { return Ok(out); }
      page += 1;
    }
  }
  /// What was kept for a profile (GLUE Home's copy, else the GLUE folder's).
  pub fn discogs_kept(&self, p: &str) -> Option<Value> {
    read_json(&self.cache_dir(), &cached_of(p)).ok().flatten().or_else(|| read_json(&self.dir(), &file_of(p)).ok().flatten())
  }
  fn discogs_keep(&self, p: &str, v: &Value) -> Result<(), String> {
    write_json(&self.cache_dir(), &cached_of(p), v)?;
    // The GLUE folder only while no tab holds the lease (ADR 0051); GLUE Home's copy carries it meanwhile.
    if !self.host.lease_held() { write_json(&self.dir(), &file_of(p), v)?; }
    Ok(())
  }
  /// The user's collection and wantlist read from Discogs into every profile's file, then the covers it lacks
  /// (`now`: whatever the last read's age). One read at a time. The records read.
  pub fn discogs_read(&self, now: bool) -> Result<usize, String> {
    let cfg = self.host.config();
    if token(&cfg).is_none() { return Err("No Discogs token in GLUE Home’s settings".into()); }
    let Some(user) = cfg["discogsUser"].as_str().filter(|u| !u.is_empty()).map(String::from) else { return Err("The Discogs token isn’t checked yet".into()) };
    if cfg["glue"].as_str().is_none_or(|g| g.is_empty()) { return Ok(0); }
    let profiles: Vec<String> = self.describe().unwrap_or(Value::Null)["profiles"].as_array().into_iter().flatten().map(|p| crate::text(p, "id")).filter(|p| !p.is_empty()).collect();
    let Some(first) = profiles.first() else { return Ok(0) };
    let last = self.discogs_kept(first);
    // Read within the day: only what it lacks is fetched (covers, tracklists: 2026-11-01, a collection read before 0.78
    // had no tracklists, and its auto playlists stayed empty until the next day's read).
    let fresh = !now && last.as_ref().is_some_and(|l| l["user"].as_str() == Some(user.as_str()) && crate::now().0 - l["readAt"].as_i64().unwrap_or(0) < AGAIN_MS);
    if fresh && !last.as_ref().is_some_and(lacks) { return Ok(0); }
    {
      let mut g = self.devices.discogs.lock().unwrap();
      if g.get("reading").is_some() { return Ok(0); }
      *g = json!({ "reading": { "what": "collection", "done": 0, "of": 0 } });
    }
    let r = match (fresh, last) {
      (true, Some(mut file)) => self.discogs_fill(&mut file, &profiles).map(|_| 0),
      (_, last) => self.discogs_read_now(&user, last.as_ref(), &profiles),
    };
    *self.devices.discogs.lock().unwrap() = match &r { Ok(_) => Value::Null, Err(e) => json!({ "error": e }) };
    r
  }
  fn discogs_read_now(&self, user: &str, last: Option<&Value>, profiles: &[String]) -> Result<usize, String> {
    let mut had = HashMap::new();
    for k in ["records", "wants"] { for r in last.map(|l| &l[k]).and_then(Value::as_array).into_iter().flatten() { if let Some(id) = r["id"].as_i64() { had.insert(id, r.clone()); } } }
    let u = crate::covers::enc(user);
    let records = self.discogs_pages(&format!("users/{u}/collection/folders/0/releases?sort=added&sort_order=desc"), "releases", &had, "collection")?;
    let wants = self.discogs_pages(&format!("users/{u}/wants?sort=added&sort_order=desc"), "wants", &had, "wantlist")?;
    let n = records.len();
    let mut file = json!({ "schemaVersion": 1, "user": user, "readAt": crate::now().0, "records": records, "wants": wants });
    for p in profiles { self.discogs_keep(p, &file)?; }
    self.discogs_fill(&mut file, profiles)?;
    Ok(n)
  }
  /// The covers and tracklists the records lack, at Discogs' pace, the file kept every 25.
  fn discogs_fill(&self, file: &mut Value, profiles: &[String]) -> Result<(), String> {
    // The covers.
    let mut todo: Vec<(&str, usize)> = vec![];
    for k in ["records", "wants"] {
      for (i, r) in file[k].as_array().into_iter().flatten().enumerate() {
        if r["art"].as_str() == Some("") && r["cover"].as_str().is_some_and(|c| !c.is_empty()) { todo.push((k, i)); }
      }
    }
    for (done, (k, i)) in todo.iter().enumerate() {
      *self.devices.discogs.lock().unwrap() = json!({ "reading": { "what": "covers", "done": done, "of": todo.len() } });
      let url = file[*k][*i]["cover"].as_str().unwrap_or("").to_string();
      if let Ok(img) = self.cover_ask(Service::Discogs, &url) {
        if let Ok(c) = glue_audio::out::cover::from_image(&img) { if self.keep_cover(&c).is_ok() { file[*k][*i]["art"] = json!(c.hash); } }
      }
      // One that can't be had: not asked again until its picture changes (record_of starts it over then).
      if file[*k][*i]["art"].as_str() == Some("") { file[*k][*i]["art"] = json!(NO_ART); }
      if (done + 1) % 25 == 0 { for p in profiles { self.discogs_keep(p, file)?; } }
    }
    if !todo.is_empty() { for p in profiles { self.discogs_keep(p, file)?; } }
    // The tracklists it lacks (a request a record, once: they match the songs track by track), kept every 25.
    let mut todo: Vec<(&str, usize)> = vec![];
    for k in ["records", "wants"] {
      for (i, r) in file[k].as_array().into_iter().flatten().enumerate() { if r.get("tracks").is_none() { todo.push((k, i)); } }
    }
    for (done, (k, i)) in todo.iter().enumerate() {
      *self.devices.discogs.lock().unwrap() = json!({ "reading": { "what": "tracklists", "done": done, "of": todo.len() } });
      let id = file[*k][*i]["id"].as_i64().unwrap_or(0);
      match self.discogs_get(&format!("releases/{id}")) {
        Ok(rel) => file[*k][*i]["tracks"] = Value::Array(tracks_of(&rel)),
        // Gone from Discogs (404): nothing to match by; anything else is asked again next time.
        Err(e) if e.contains("404") => file[*k][*i]["tracks"] = json!([]),
        Err(_) => {}
      }
      if (done + 1) % 25 == 0 { for p in profiles { self.discogs_keep(p, file)?; } }
    }
    if !todo.is_empty() { for p in profiles { self.discogs_keep(p, file)?; } }
    Ok(())
  }
  /// For the page (`discogs`): the profile's records and wantlist, whether a token is set and whose, and a read under
  /// way or its error.
  pub fn discogs_state(&self, p: &str) -> Value {
    let cfg = self.host.config();
    json!({ "token": token(&cfg).is_some(), "user": cfg["discogsUser"], "tokenError": cfg["discogsError"], "now": self.devices.discogs.lock().unwrap().clone(), "kept": self.discogs_kept(p) })
  }
}
