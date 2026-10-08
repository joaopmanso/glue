//! "Same recording" pairs by sound (ADR 0013, 0025; `src/core/library/duplicates.ts` in Rust, ADR 0164): GLUE Home
//! matches its songs' fingerprints, which its analysis keeps in its cache, instead of the page. Candidates come from
//! an index of 16-bit pieces of the fingerprint words; each candidate pair is confirmed by bit error rate at its best
//! alignment. Line for line the website's, its maps in insertion order and its sorts stable, so the result is the same
//! to the byte (held to it by `tests/golden/dupes`).
use crate::names::{song_name, version_of};
use crate::{get, truthy, Engine, Host};
use glue_store::dir::{read_json, write_json, Dir};
use glue_store::project::unknown_computer;
use glue_store::store::shard_of;
use indexmap::{IndexMap, IndexSet};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// A song's fingerprint: one 32-bit word per frame, and the frame's level (0 silent … 255).
pub struct Fingerprint { pub words: Vec<u32>, pub loud: Vec<u8> }

/// `encodeFingerprint`'s bytes: the word count (u32), the words, then one level byte per word.
pub fn decode(b: &[u8]) -> Option<Fingerprint> {
  if b.len() < 4 { return None; }
  let n = u32::from_le_bytes(b[0..4].try_into().ok()?) as usize;
  if b.len() < 4 + n * 5 { return None; }
  let words = (0..n).map(|i| u32::from_le_bytes(b[4 + i * 4..8 + i * 4].try_into().unwrap())).collect();
  Some(Fingerprint { words, loud: b[4 + n * 4..4 + n * 5].to_vec() })
}

const FP_FRAME_SEC: f64 = 256.0 / 5512.5;
/// At or below: the same recording (unrelated audio ≈ 0.5).
const SAME_BER: f64 = 0.3;
/// At least this much sound in common.
const MIN_OVERLAP_SEC: f64 = 20.0;
/// Quiet frames skipped; pieces that are everywhere ignored.
const LOUD_MIN: u8 = 64;
const MAX_RUN: usize = 60;

/// A pair: `ber` its bit error rate, `offset_sec` b against a, `overlap_sec` the sound they have in common.
#[derive(Clone, Debug)]
pub struct Match { pub a: String, pub b: String, pub ber: f64, pub offset_sec: f64, pub overlap_sec: f64 }
impl Match {
  pub fn to_json(&self) -> Value { json!({ "a": self.a, "b": self.b, "ber": self.ber, "offsetSec": self.offset_sec, "overlapSec": self.overlap_sec }) }
  pub fn from_json(v: &Value) -> Option<Match> {
    Some(Match { a: v["a"].as_str()?.into(), b: v["b"].as_str()?.into(), ber: v["ber"].as_f64()?, offset_sec: v["offsetSec"].as_f64()?, overlap_sec: v["overlapSec"].as_f64()? })
  }
}

/// Bit error rate of b shifted by `offset` frames against a (b[i + offset] ~ a[i]), over frames both have sound in.
fn ber(a: &Fingerprint, b: &Fingerprint, offset: i64) -> (f64, usize) {
  let (mut errs, mut n) = (0u64, 0usize);
  let i0 = 0.max(-offset);
  let i1 = (a.words.len() as i64).min(b.words.len() as i64 - offset);
  let mut i = i0;
  while i < i1 {
    let j = (i + offset) as usize;
    let k = i as usize;
    if a.loud[k] >= LOUD_MIN && b.loud[j] >= LOUD_MIN { errs += (a.words[k] ^ b.words[j]).count_ones() as u64; n += 1; }
    i += 1;
  }
  (if n > 0 { errs as f64 / (32 * n) as f64 } else { 1.0 }, n)
}

type Votes = IndexMap<u64, IndexMap<i64, u32>>;
fn vote(votes: &mut Votes, pair: u64, off: i64) { *votes.entry(pair).or_default().entry(off).or_insert(0) += 1; }

/// Every "same recording" pair among these songs (`findSameRecordings`).
pub fn find_same_recordings(fps: &[(String, Fingerprint)]) -> Vec<Match> {
  // Index: (piece, track, frame). Each frame gives two pieces: low 16 bands and high 16 bands.
  let (mut key, mut trk, mut pos) = (vec![], vec![], vec![]);
  for (t, (_, fp)) in fps.iter().enumerate() {
    for (i, &w) in fp.words.iter().enumerate() {
      if fp.loud[i] < LOUD_MIN { continue; }
      key.push(w & 0xffff); trk.push(t); pos.push(i as i64);
      key.push((w >> 16) | 0x10000); trk.push(t); pos.push(i as i64);   // tagged: high half
    }
  }
  let mut order: Vec<usize> = (0..key.len()).collect();
  order.sort_by_key(|&i| key[i]);
  // Votes for (track a, track b, offset b − a).
  let mut votes = Votes::new();
  let mut s = 0;
  while s < order.len() {
    let mut e = s + 1;
    while e < order.len() && key[order[e]] == key[order[s]] { e += 1; }
    if e - s <= MAX_RUN {
      for i in s..e { for j in i + 1..e {
        let (mut p, mut q) = (order[i], order[j]);
        if trk[p] == trk[q] { continue; }
        if trk[p] > trk[q] { std::mem::swap(&mut p, &mut q); }
        vote(&mut votes, trk[p] as u64 * 65536 + trk[q] as u64, pos[q] - pos[p]);
      } }
    }
    s = e;
  }
  confirm(fps, &votes)
}

/// The pairs that got votes, checked by bit error rate at their best offsets.
fn confirm(fps: &[(String, Fingerprint)], votes: &Votes) -> Vec<Match> {
  let mut out = vec![];
  let min_frames = MIN_OVERLAP_SEC / FP_FRAME_SEC;
  for (&pair, m) in votes {
    // Best offsets, with neighbours pooled (alignment within a frame or two).
    let mut pooled: Vec<(i64, u32)> = m.iter().map(|(&off, &c)| (off, c + m.get(&(off - 1)).copied().unwrap_or(0) + m.get(&(off + 1)).copied().unwrap_or(0))).collect();
    pooled.sort_by_key(|x| std::cmp::Reverse(x.1));   // stable, as the website's
    if pooled.is_empty() || pooled[0].1 < 4 { continue; }
    let (a, b) = (&fps[(pair / 65536) as usize], &fps[(pair % 65536) as usize]);
    let (mut best_ber, mut best_frames, mut best_off) = (1.0f64, 0usize, 0i64);
    for &(off, _) in pooled.iter().take(3) { for d in -2..=2 {
      let (r, frames) = ber(&a.1, &b.1, off + d);
      if frames as f64 >= min_frames && r < best_ber { best_ber = r; best_frames = frames; best_off = off + d; }
    } }
    if best_ber <= SAME_BER { out.push(Match { a: a.0.clone(), b: b.0.clone(), ber: best_ber, offset_sec: best_off as f64 * FP_FRAME_SEC, overlap_sec: best_frames as f64 * FP_FRAME_SEC }); }
  }
  out.sort_by(|x, y| x.ber.partial_cmp(&y.ber).unwrap_or(std::cmp::Ordering::Equal));
  out
}

/// The matches involving the `fresh` songs, with every other song and among themselves (`findMatchesFor`): the
/// same ones `find_same_recordings` finds for those pairs, without sorting every piece of the collection again. A
/// piece's key is 17 bits, so pieces are counted per key, and only the fresh songs' pieces are indexed.
pub fn find_matches_for(fps: &[(String, Fingerprint)], fresh: &std::collections::HashSet<String>) -> Vec<Match> {
  const KEYS: usize = 1 << 17;
  let mut count = vec![0u32; KEYS];
  let is_fresh: Vec<bool> = fps.iter().map(|x| fresh.contains(&x.0)).collect();
  for (_, fp) in fps { for (i, &w) in fp.words.iter().enumerate() {
    if fp.loud[i] < LOUD_MIN { continue; }
    count[(w & 0xffff) as usize] += 1; count[((w >> 16) | 0x10000) as usize] += 1;
  } }
  let rare = |k: usize| count[k] >= 2 && count[k] as usize <= MAX_RUN;
  // A song's pieces worth counting, in order: (key, frame).
  let each = |t: usize| -> Vec<(usize, i64)> {
    let fp = &fps[t].1;
    let mut v = vec![];
    for (i, &w) in fp.words.iter().enumerate() {
      if fp.loud[i] < LOUD_MIN { continue; }
      let (lo, hi) = ((w & 0xffff) as usize, ((w >> 16) | 0x10000) as usize);
      if rare(lo) { v.push((lo, i as i64)); }
      if rare(hi) { v.push((hi, i as i64)); }
    }
    v
  };
  // The fresh songs' pieces by key, as start offsets into two arrays.
  let mut start = vec![0u32; KEYS + 1];
  let fresh_pieces: Vec<(usize, Vec<(usize, i64)>)> = (0..fps.len()).filter(|&t| is_fresh[t]).map(|t| (t, each(t))).collect();
  for (_, ps) in &fresh_pieces { for &(k, _) in ps { start[k + 1] += 1; } }
  for k in 0..KEYS { start[k + 1] += start[k]; }
  let mut fill: Vec<u32> = start[..KEYS].to_vec();
  let total = start[KEYS] as usize;
  let (mut ft, mut fpos) = (vec![0usize; total], vec![0i64; total]);
  for (t, ps) in &fresh_pieces { for &(k, i) in ps { let j = fill[k] as usize; fill[k] += 1; ft[j] = *t; fpos[j] = i; } }
  // Votes, as in find_same_recordings: every pair of pieces with the same key, once.
  let mut votes = Votes::new();
  for (t, &fresh_t) in is_fresh.iter().enumerate() {
    for (k, i) in each(t) {
      for j in start[k] as usize..start[k + 1] as usize {
        let f = ft[j];
        if f == t || (fresh_t && f > t) { continue; }   // fresh with fresh: counted from one side
        let (a, pa, b, pb) = if f < t { (f, fpos[j], t, i) } else { (t, i, f, fpos[j]) };
        vote(&mut votes, a as u64 * 65536 + b as u64, pb - pa);
      }
    }
  }
  confirm(fps, &votes)
}

// ---- the groups (`buildGroups`, `bestLists`) -----------------------------------------------------------------------

/// A pair of songs, either way round.
fn pair_key(a: &str, b: &str) -> String { if a < b { format!("{a}+{b}") } else { format!("{b}+{a}") } }
/// A group's key: its songs, sorted.
pub fn group_key(ids: &[String]) -> String { let mut v = ids.to_vec(); v.sort_by(|a, b| glue_store::json::utf16_cmp(a, b)); v.join("+") }
fn s<'a>(t: &'a Value, k: &str) -> &'a str { t.get(k).and_then(|v| v.as_str()).unwrap_or("") }
/// A song's length: unknown (`null`, absent) or a number (0 included: `== null` in the website).
fn length(t: &Value) -> Option<f64> { t.get("duration").and_then(|d| d.as_f64()) }
/// A length the version check counts (`!a`: 0 and unknown pass).
fn known(t: &Value) -> Option<f64> { length(t).filter(|d| *d != 0.0 && !d.is_nan()) }
fn stem(f: &str) -> &str { match f.rfind('.') { Some(i) if i + 1 < f.len() && !f[i + 1..].contains('.') => &f[..i], _ => f } }

/// Lengths close enough for one recording (`similarLength`): 10 s apart at most, or 6 % on long songs.
fn similar_length(a: Option<f64>, b: Option<f64>) -> bool { match (a, b) { (Some(a), Some(b)) => (a - b).abs() <= 10f64.max(0.06 * a.max(b)), _ => true } }
/// Two copies that could be the same recording (`sameVersion`).
fn same_version(a: &Value, b: &Value) -> bool { version_of(s(a, "title"), s(a, "album")) == version_of(s(b, "title"), s(b, "album")) && similar_length(known(a), known(b)) }

/// Higher is better (`copyScore`): genuine before suspect, lossless before lossy, then the main music folder's, then
/// resolution or bitrate. JavaScript's arithmetic: a number missing is NaN, null is 0.
fn copy_score(t: &Value, a: Option<&Value>, main: Option<&str>) -> f64 {
  let num = |v: Option<&Value>| match v { None => f64::NAN, Some(Value::Null) => 0.0, Some(x) => x.as_f64().unwrap_or(f64::NAN) };
  let q = match t.get("format").filter(|f| f.is_object()) {
    None => 0.0,
    Some(f) if truthy(f.get("lossless")) => {
      let bits = f.get("bits").and_then(|b| b.as_f64()).filter(|b| *b != 0.0 && !b.is_nan()).unwrap_or(16.0);
      1e6 + (num(f.get("sampleRate")) / 1000.0) * bits
    }
    Some(f) => num(f.get("bitrate")),
  };
  let m = if main.is_some_and(|m| !m.is_empty() && t.get("rootId").and_then(|r| r.as_str()) == Some(m)) { 5e5 } else { 0.0 };
  let g = match a.filter(|a| !truthy(get(a, "error"))) { Some(a) => match s(a, "grade") { "ok" => 3.0, "info" => 2.0, "warn" => 1.0, "bad" => 0.0, _ => 1.0 }, None => 1.0 };
  g * 1e7 + q + m
}

/// How sure GLUE is that a group's copies are one recording, 0–100 (`certainty`).
fn certainty(kind: &str, similarity: Option<f64>, said: bool, copies: &[&Value]) -> i64 {
  if said { return 100; }
  let lens: Vec<f64> = copies.iter().filter_map(|c| known(c)).collect();
  let spread = if lens.len() > 1 { lens.iter().cloned().fold(f64::MIN, f64::max) - lens.iter().cloned().fold(f64::MAX, f64::min) } else { 0.0 };
  if kind == "probable" { return if spread <= 1.0 { 60 } else { 50 }; }
  let mut names: IndexSet<String> = IndexSet::new();
  for c in copies { let title = s(c, "title"); names.insert(song_name(s(c, "artist")) + "|" + &song_name(if title.is_empty() { stem(s(c, "fileName")) } else { title })); }
  let mut v = 60.0 + 40.0 * (((similarity.unwrap_or(0.4) - 0.4) / 0.55).clamp(0.0, 1.0));
  if names.len() > 1 { v -= 10.0; }
  if spread > 2.0 { v -= 10.0; }
  (v + 0.5).floor().clamp(0.0, 100.0) as i64
}

/// What to look at before removing a group's copies (`concerns`): version words that differ (title or file name),
/// lengths more than 3 s apart, other artists.
fn concerns(copies: &[&Value]) -> Vec<String> {
  let mut out = vec![];
  let marks: Vec<String> = copies.iter().map(|c| {
    let mut w: Vec<String> = vec![];
    let (title, file) = (version_of(s(c, "title"), s(c, "album")), version_of(stem(s(c, "fileName")), ""));
    for x in title.split(',').chain(file.split(',')) {
      if !x.is_empty() && !w.iter().any(|y| y == x) { w.push(x.to_string()); }
    }
    w.sort_by(|a, b| glue_store::json::utf16_cmp(a, b));
    w.join(", ")
  }).collect();
  let distinct: IndexSet<&String> = marks.iter().collect();
  if distinct.len() > 1 {
    let shown: IndexSet<&str> = marks.iter().map(|m| if m.is_empty() { "none" } else { m.as_str() }).collect();
    out.push(format!("versions differ: {}", shown.into_iter().collect::<Vec<_>>().join(" / ")));
  }
  let lens: Vec<f64> = copies.iter().filter_map(|c| known(c)).collect();
  if lens.len() > 1 {
    let d = lens.iter().cloned().fold(f64::MIN, f64::max) - lens.iter().cloned().fold(f64::MAX, f64::min);
    if d > 3.0 { out.push(format!("lengths differ by {} s", (d + 0.5).floor() as i64)); }
  }
  let artists: IndexSet<String> = copies.iter().map(|c| song_name(s(c, "artist"))).filter(|a| !a.is_empty()).collect();
  if artists.len() > 1 { out.push("other artists".into()); }
  out
}

/// Connected groups of matching songs (`groupMatches`: union–find, in the website's order).
fn group_matches(matches: &[Match]) -> Vec<Vec<String>> {
  let mut parent: IndexMap<String, String> = IndexMap::new();
  fn find(parent: &mut IndexMap<String, String>, x: &str) -> String {
    let mut r = x.to_string();
    while parent.get(&r).is_some_and(|p| *p != r) { r = parent[&r].clone(); }
    parent.insert(x.to_string(), r.clone());
    r
  }
  for m in matches {
    if !parent.contains_key(&m.a) { parent.insert(m.a.clone(), m.a.clone()); }
    if !parent.contains_key(&m.b) { parent.insert(m.b.clone(), m.b.clone()); }
    let (ra, rb) = (find(&mut parent, &m.a), find(&mut parent, &m.b));
    parent.insert(ra, rb);
  }
  let mut groups: IndexMap<String, Vec<String>> = IndexMap::new();
  let keys: Vec<String> = parent.keys().cloned().collect();
  for x in keys { let r = find(&mut parent, &x); groups.entry(r).or_default().push(x); }
  groups.into_values().filter(|g| g.len() > 1).collect()
}

/// Songs probably of one recording by their names (`nameGroups`): the same artist and title, then copies of the same
/// version within 3 s of each other (unknown lengths pass); `apart`: pairs the user kept apart.
fn name_groups<'a>(tracks: &[&'a Value], apart: &HashSet<String>) -> Vec<Vec<&'a Value>> {
  let mut by_key: IndexMap<String, Vec<&Value>> = IndexMap::new();
  for &t in tracks {
    if s(t, "title").is_empty() { continue; }
    let k = song_name(s(t, "artist")) + "|" + &song_name(s(t, "title"));
    if k.encode_utf16().count() < 3 { continue; }
    by_key.entry(k).or_default().push(t);
  }
  let near = |t: &Value, u: &Value| (match (length(t), length(u)) { (Some(a), Some(b)) => (a - b).abs() <= 3.0, _ => true }) && same_version(t, u) && !apart.contains(&pair_key(s(t, "id"), s(u, "id")));
  let mut out = vec![];
  for g in by_key.values() {
    if g.len() < 2 { continue; }
    let mut left: IndexSet<usize> = (0..g.len()).collect();
    for i in 0..g.len() {
      if !left.shift_remove(&i) { continue; }
      let mut part = vec![i];
      let mut j = 0;
      while j < part.len() {
        let order: Vec<usize> = left.iter().copied().collect();
        for u in order { if left.contains(&u) && near(g[part[j]], g[u]) { left.shift_remove(&u); part.push(u); } }
        j += 1;
      }
      if part.len() > 1 { out.push(part.into_iter().map(|k| g[k]).collect()); }
    }
  }
  out
}

/// The duplicate groups (`buildGroups`): this computer's songs and analyses (as it sees them), the user's say (the
/// collection's meta), this computer's matches and the other computers'.
pub fn build_groups(tracks: &IndexMap<String, Value>, analysis: &IndexMap<String, Value>, meta: &Value, matches: &[Match], others: &[Match]) -> Vec<Value> {
  let strs = |k: &str| -> Vec<String> { meta.get(k).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default() };
  let (ignored, confirmed, apart): (HashSet<String>, HashSet<String>, HashSet<String>) = (strs("ignoredDupes").into_iter().collect(), strs("dupConfirmed").into_iter().collect(), strs("dupApart").into_iter().collect());
  let (mut manual, mut by_hand) = (vec![], HashSet::new());
  for g in meta.get("dupManual").and_then(|v| v.as_array()).into_iter().flatten() {
    let g: Vec<&str> = g.as_array().map(|a| a.iter().filter_map(|x| x.as_str()).collect()).unwrap_or_default();
    for i in 1..g.len() { manual.push(Match { a: g[0].into(), b: g[i].into(), ber: 0.0, offset_sec: 0.0, overlap_sec: 0.0 }); by_hand.insert(pair_key(g[0], g[i])); }
  }
  let main = meta.get("mainRoot").and_then(|v| v.as_str());
  let best = |ids: &[String]| -> String {
    if let Some(c) = meta.get("dupBest").and_then(|b| b.get(group_key(ids))).and_then(|v| v.as_str()) { if ids.iter().any(|i| i == c) { return c.to_string(); } }
    let score = |id: &str| copy_score(&tracks[id], analysis.get(id), main);
    let mut b = ids[0].clone();
    for id in &ids[1..] { if score(id) > score(&b) { b = id.clone(); } }
    b
  };
  let same = |m: &Match| match (tracks.get(&m.a), tracks.get(&m.b)) { (Some(a), Some(b)) => same_version(a, b), _ => true };
  let all: Vec<Match> = matches.iter().chain(others.iter()).filter(|m| !apart.contains(&pair_key(&m.a, &m.b)) && same(m)).cloned().chain(manual).collect();
  let (mut out, mut in_group): (Vec<Value>, HashSet<String>) = (vec![], HashSet::new());
  for ids in group_matches(&all) {
    let live: Vec<String> = ids.into_iter().filter(|id| tracks.contains_key(id)).collect();
    if live.len() < 2 || ignored.contains(&group_key(&live)) { continue; }
    let pairs: Vec<&Match> = all.iter().filter(|m| live.contains(&m.a) && live.contains(&m.b)).collect();
    let hand = pairs.iter().any(|m| by_hand.contains(&pair_key(&m.a, &m.b)));
    let sim = if hand { None } else { Some(1.0 - 2.0 * pairs.iter().map(|m| m.ber).fold(f64::NEG_INFINITY, f64::max)) };
    let copies: Vec<&Value> = live.iter().map(|id| &tracks[id]).collect();
    let mut g = json!({ "key": group_key(&live), "kind": "same", "ids": live, "best": best(&live), "similarity": sim });
    if hand { g["confirmed"] = json!(true); g["byHand"] = json!(true); }
    g["how"] = json!(if hand { "hand" } else { "sound" });
    g["sure"] = json!(certainty("same", sim, hand, &copies));
    g["concerns"] = json!(concerns(&copies));
    in_group.extend(live);
    out.push(g);
  }
  // Probable: same artist + title, similar length, not already matched by sound.
  let rest: Vec<&Value> = tracks.values().filter(|t| !in_group.contains(s(t, "id"))).collect();
  for near in name_groups(&rest, &apart) {
    let ids: Vec<String> = near.iter().map(|t| s(t, "id").to_string()).collect();
    if ids.len() < 2 || ignored.contains(&group_key(&ids)) { continue; }
    let key = group_key(&ids);
    let said = confirmed.contains(&key);
    let mut g = json!({ "key": key, "kind": if said { "same" } else { "probable" }, "ids": ids, "best": best(&ids), "similarity": null });
    if said { g["confirmed"] = json!(true); }
    g["how"] = json!(if said { "confirmed" } else { "name" });
    g["sure"] = json!(certainty(if said { "same" } else { "probable" }, None, said, &near));
    g["concerns"] = json!(concerns(&near));
    out.push(g);
  }
  out.sort_by(|a, b| {
    let (ka, kb) = (a["kind"].as_str() == Some("same"), b["kind"].as_str() == Some("same"));
    if ka == kb { b["ids"].as_array().map_or(0, |x| x.len()).cmp(&a["ids"].as_array().map_or(0, |x| x.len())) } else if ka { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater }
  });
  out
}

/// Playlists and folders pointed at the best copies (`bestLists`, ADR 0120): each list whose items name another copy,
/// with its items as they become (order kept; never the same song twice).
pub fn best_lists<'a>(lists: impl Iterator<Item = &'a Value>, groups: &[Value]) -> Vec<(String, Vec<String>)> {
  let mut to: IndexMap<String, String> = IndexMap::new();
  for g in groups.iter().filter(|g| g["kind"] == "same") {
    let best = s(g, "best");
    for id in g["ids"].as_array().into_iter().flatten().filter_map(|x| x.as_str()) { if id != best { to.insert(id.into(), best.into()); } }
  }
  if to.is_empty() { return vec![]; }
  let mut out = vec![];
  for l in lists {
    let items: Vec<&str> = l["items"].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).collect()).unwrap_or_default();
    if !items.iter().any(|i| to.contains_key(*i)) { continue; }
    let mut next: Vec<String> = vec![];
    for i in items { let v = to.get(i).cloned().unwrap_or_else(|| i.to_string()); if !next.contains(&v) { next.push(v); } }
    out.push((s(l, "id").to_string(), next));
  }
  out
}

// ---- GLUE Home's duplicates ---------------------------------------------------------------------------------------

/// The matching to do in a moment (several analyses saved make one), and one at a time.
#[derive(Default)]
pub struct Pending { soon: Mutex<Option<Instant>>, which: Mutex<IndexSet<(String, String)>>, one: Mutex<()>, gsoon: Mutex<Option<Instant>>, gwhich: Mutex<IndexSet<(String, String)>> }

/// The last result for a collection, in GLUE Home's cache (the page's `Saved`, and the songs analysed without a
/// fingerprint): `dupes/<p>/<c>.json`.
fn saved_path(p: &str, c: &str) -> String { format!("dupes/{p}/{c}.json") }
/// The groups made from it last (`dupes/<p>/<c>.groups.json`): what a tab shows.
fn groups_path(p: &str, c: &str) -> String { format!("dupes/{p}/{c}.groups.json") }

impl<H: Host> Engine<H> {
  /// A collection's duplicates matched again in a few seconds: the analysis saved results (the new songs only).
  pub fn dupes_soon(self: &Arc<Self>, p: &str, c: &str) {
    self.dupes.which.lock().unwrap().insert((p.to_string(), c.to_string()));
    let at = Instant::now() + Duration::from_secs(5);
    let first = { let mut s = self.dupes.soon.lock().unwrap(); let first = s.is_none(); *s = Some(at); first };
    if !first { return; }
    let me = self.clone();
    std::thread::spawn(move || loop {
      let Some(at) = *me.dupes.soon.lock().unwrap() else { return };
      let wait = at.saturating_duration_since(Instant::now());
      if !wait.is_zero() { std::thread::sleep(wait); continue; }
      *me.dupes.soon.lock().unwrap() = None;
      let which: Vec<(String, String)> = me.dupes.which.lock().unwrap().drain(..).collect();
      for (p, c) in which { if let Err(e) = me.dupes_scan(&p, &c, false) { eprintln!("GLUE Home: couldn’t look for duplicates: {e}"); } }
      return;
    });
  }

  /// A collection's groups made again in a moment (its songs, the user's say or the other computers' matches changed;
  /// several make one).
  pub fn groups_soon(self: &Arc<Self>, p: &str, c: &str) {
    self.dupes.gwhich.lock().unwrap().insert((p.to_string(), c.to_string()));
    let at = Instant::now() + Duration::from_millis(500);
    let first = { let mut s = self.dupes.gsoon.lock().unwrap(); let first = s.is_none(); *s = Some(at); first };
    if !first { return; }
    let me = self.clone();
    std::thread::spawn(move || loop {
      let Some(at) = *me.dupes.gsoon.lock().unwrap() else { return };
      let wait = at.saturating_duration_since(Instant::now());
      if !wait.is_zero() { std::thread::sleep(wait); continue; }
      *me.dupes.gsoon.lock().unwrap() = None;
      let which: Vec<(String, String)> = me.dupes.gwhich.lock().unwrap().drain(..).collect();
      for (p, c) in which { if let Err(e) = me.dupe_groups(&p, &c) { eprintln!("GLUE Home: couldn’t make the duplicate groups: {e}"); } }
      return;
    });
  }

  /// The collection's last result (`at`, `matches`, `missing`: songs analysed with no fingerprint here, `groups`);
  /// matched now when there's none yet, or `full` ("Check again": every song matched again).
  pub fn dupes(&self, p: &str, c: &str, full: bool) -> Result<Value, String> {
    let cache = self.cache_dir();
    if !full {
      if let Ok(Some(v)) = read_json(&cache, &saved_path(p, c)) {
        let groups = match read_json(&cache, &groups_path(p, c)) { Ok(Some(g)) => g["groups"].clone(), _ => self.dupe_groups(p, c)? };
        return Ok(json!({ "at": v["at"], "matches": v["matches"], "missing": v["missing"], "groups": groups }));
      }
    }
    let mut r = self.dupes_scan(p, c, full)?;
    r["groups"] = read_json(&cache, &groups_path(p, c)).ok().flatten().map(|g| g["groups"].clone()).unwrap_or(json!([]));
    Ok(r)
  }

  /// The groups (`buildGroups`) from the last matches, this computer's and the others' (a shared collection's
  /// `dupes/*.json`), its songs and the user's say; kept for the tabs, and every playlist pointed at the best copies
  /// (`bestLists`, ADR 0120). Told to a tab when they changed.
  pub fn dupe_groups(&self, p: &str, c: &str) -> Result<Value, String> {
    let cache = self.cache_dir();
    let saved = read_json(&cache, &saved_path(p, c)).ok().flatten();
    let matches: Vec<Match> = saved.as_ref().and_then(|v| v["matches"].as_array()).map(|a| a.iter().filter_map(Match::from_json).collect()).unwrap_or_default();
    let s = self.store(p, c)?;
    let mut st = s.lock().unwrap();
    // The other computers' matches (ADR 0098): every published file but this computer's.
    let mine = st.shared.as_ref().map(|m| format!("{}.json", m.here.me));
    let mut others = vec![];
    if mine.is_some() {
      let dir = format!("profiles/{p}/collections/{c}/dupes");
      for n in self.dir().list(&dir, false).unwrap_or_default() {
        if Some(&n) == mine.as_ref() || !n.ends_with(".json") { continue; }
        if let Ok(Some(f)) = read_json(&self.dir(), &format!("{dir}/{n}")) { if f["v"] == 1 { others.extend(f["matches"].as_array().into_iter().flatten().filter_map(Match::from_json)); } }
      }
    }
    let groups = build_groups(&st.tracks, &st.analysis, &st.meta, &matches, &others);
    let list = Value::Array(groups.clone());
    let had = read_json(&cache, &groups_path(p, c)).ok().flatten();
    let changed = had.as_ref().is_none_or(|h| h["groups"] != list);
    if changed { write_json(&cache, &groups_path(p, c), &json!({ "groups": list }))?; }
    // Every playlist on the best copies (GLUE Home writes the GLUE folder only while no tab holds the lease).
    let moves = best_lists(st.lists.values(), &groups);
    if !moves.is_empty() && !self.host.lease_held() {
      for (id, items) in &moves { if let Some(l) = st.lists.get(id).cloned() { let mut l = l; l["items"] = json!(items); st.apply(&json!({ "m": "list", "l": l })); } }
      let paths = self.flush(&mut st, p, c)?;
      drop(st);
      if !paths.is_empty() { self.edited(p, c, &paths); }
    } else { drop(st); }
    if changed { self.changed(p, c, &["dupes".to_string()], &[]); }
    Ok(list)
  }

  /// Match this computer's songs (`Dupes.scan`): those with an analysis here and a fingerprint in the cache. Only the
  /// songs fingerprinted since the last result are matched, against all of them, unless `full`. Kept in the cache, and
  /// in a shared collection published for the other computers (`dupes/<computer>.json`, ADR 0098).
  pub fn dupes_scan(&self, p: &str, c: &str, full: bool) -> Result<Value, String> {
    let _one = self.dupes.one.lock().unwrap();
    let s = self.store(p, c)?;
    let (ids, me): (Vec<String>, Option<String>) = {
      let st = s.lock().unwrap();
      let ids = st.tracks.iter().filter(|(id, t)| !truthy(get(t, "remote")) && st.analysis.get(*id).is_some_and(|a| !truthy(get(a, "error")))).map(|(id, _)| id.clone()).collect();
      (ids, st.shared.as_ref().map(|m| m.here.me.clone()))
    };
    let cache = self.cache_dir();
    let (mut tracks, mut missing) = (vec![], 0usize);
    for id in ids {
      match cache.read_bytes(&format!("p/{p}/{c}/{}/{id}.bin", shard_of(&id))).ok().flatten().and_then(|b| decode(&b)) {
        Some(fp) if !fp.words.is_empty() => tracks.push((id, fp)),
        _ => missing += 1,
      }
    }
    let saved = if full { None } else { read_json(&cache, &saved_path(p, c)).ok().flatten() };
    let had: Vec<Match> = saved.as_ref().and_then(|v| v["matches"].as_array()).map(|a| a.iter().filter_map(Match::from_json).collect()).unwrap_or_default();
    let known: Option<HashSet<String>> = saved.as_ref().and_then(|v| v["ids"].as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect());
    let now: HashSet<String> = tracks.iter().map(|t| t.0.clone()).collect();
    let matches = match &known {
      Some(k) => {
        let fresh: HashSet<String> = now.iter().filter(|id| !k.contains(*id)).cloned().collect();
        let mut kept: Vec<Match> = had.iter().filter(|m| now.contains(&m.a) && now.contains(&m.b)).cloned().collect();
        if !fresh.is_empty() { kept.extend(find_matches_for(&tracks, &fresh)); }
        kept
      }
      None => if tracks.len() > 1 { find_same_recordings(&tracks) } else { vec![] },
    };
    let changed = known.as_ref().is_none_or(|k| k.len() != now.len() || now.iter().any(|id| !k.contains(id))) || matches.len() != had.len() || saved.as_ref().is_some_and(|v| v["missing"].as_u64() != Some(missing as u64));
    let at = self.host.now().0;
    let list = Value::Array(matches.iter().map(Match::to_json).collect());
    if changed {
      let ids: Vec<&String> = tracks.iter().map(|t| &t.0).collect();
      write_json(&cache, &saved_path(p, c), &json!({ "v": 1, "at": at, "ids": ids, "matches": list, "missing": missing }))?;
    }
    // A shared collection: what this computer found, for the others (only its own songs are in it). GLUE Home writes
    // the GLUE folder only while no tab holds the lease.
    if let Some(me) = me.filter(|m| !unknown_computer(Some(m))) {
      let rel = format!("dupes/{me}.json");
      let at_path = format!("profiles/{p}/collections/{c}/{rel}");
      if !self.host.lease_held() && (changed || !matches!(self.dir().read(&at_path), Ok(Some(_)))) {
        write_json(&self.dir(), &at_path, &json!({ "v": 1, "at": at, "matches": list }))?;
        let paths = [rel];
        self.wrote(p, c, &paths);
        self.changed(p, c, &paths, &[]);
        if let Some(e) = self.arc() { e.sync_soon(2000); }
      }
    }
    // The groups from these matches (a tab hears of them through the feed).
    self.dupe_groups(p, c)?;
    Ok(json!({ "at": at, "matches": list, "missing": missing }))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn a_fingerprint_reads_as_the_website_writes_it() {
    let mut b = 2u32.to_le_bytes().to_vec();
    b.extend(0xdead_beefu32.to_le_bytes()); b.extend(7u32.to_le_bytes()); b.extend([200, 3]);
    let fp = decode(&b).unwrap();
    assert_eq!(fp.words, vec![0xdead_beef, 7]);
    assert_eq!(fp.loud, vec![200, 3]);
    assert!(decode(&b[..9]).is_none());
  }
}
