//! Reminders of events that need music (ADR 0074), home/ui/reminders.ts in Rust (ADR 0160): GLUE Home reads the events
//! of this computer's GLUE folder (read only) and sends a desktop notification once a day for each one coming within
//! its reminder days with no songs in its playlists. The rule is the website's (src/core/library/events.ts:
//! `needsMusic`, `daysUntil`, `parseLocal`), so the banner there and the notification here agree. Dates are this
//! computer's, local.
use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

/// `parseLocal`: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm' as a local date-time; None if unreadable.
pub fn parse_local(s: &str) -> Option<NaiveDateTime> {
  let b = s.as_bytes();
  let num = |r: std::ops::Range<usize>| s.get(r.clone()).filter(|x| x.bytes().all(|c| c.is_ascii_digit())).and_then(|x| x.parse::<u32>().ok());
  if b.len() < 10 || b[4] != b'-' || b[7] != b'-' { return None; }
  let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
  let (h, mi) = if b.len() >= 16 && b[10] == b'T' && b[13] == b':' { (num(11..13)?, num(14..16)?) } else { (0, 0) };
  NaiveDate::from_ymd_opt(y as i32, m, d)?.and_hms_opt(h, mi, 0)
}
/// `dayKey`: 'YYYY-MM-DD' of a date.
pub fn day_key(d: NaiveDateTime) -> String { format!("{:04}-{:02}-{:02}", d.year(), d.month(), d.day()) }
/// `daysUntil`: whole days from today to the event's day (0 today, 1 tomorrow, below 0 past).
pub fn days_until(starts: &str, now: NaiveDateTime) -> Option<i64> {
  let d = parse_local(starts.get(..10).unwrap_or(starts))?;
  Some((d.date() - now.date()).num_days())
}
/// `needsMusic`: a planned event within its reminder days with no songs in its playlists.
pub fn needs_music(e: &Value, songs: usize, now: NaiveDateTime) -> bool {
  let days = e["remindDays"].as_f64().unwrap_or(0.0);
  if e["status"] != "planned" || songs > 0 || days <= 0.0 { return false; }
  days_until(e["starts"].as_str().unwrap_or(""), now).is_some_and(|d| d >= 0 && d as f64 <= days)
}
/// The songs in an event's playlists: its folder (and the folders in it), and the playlists assigned to it.
pub fn songs_of(e: &Value, lists: &HashMap<String, Value>) -> usize {
  let (mut ids, mut seen) = (HashSet::<String>::new(), HashSet::<String>::new());
  fn walk(id: &str, lists: &HashMap<String, Value>, ids: &mut HashSet<String>, seen: &mut HashSet<String>) {
    let Some(l) = lists.get(id) else { return };
    if !seen.insert(id.to_string()) { return; }
    for i in l["items"].as_array().into_iter().flatten() { if let Some(s) = i.as_str() { ids.insert(s.into()); } }
    for c in lists.values() { if c["parentId"].as_str() == Some(id) { if let Some(cid) = c["id"].as_str() { walk(cid, lists, ids, seen); } } }
  }
  if let Some(f) = e["folderId"].as_str() { walk(f, lists, &mut ids, &mut seen); }
  for id in e["lists"].as_array().into_iter().flatten() { if let Some(s) = id.as_str() { walk(s, lists, &mut ids, &mut seen); } }
  ids.len()
}
/// The notification: its title and body.
pub fn message(e: &Value, now: NaiveDateTime) -> (String, String) {
  let starts = e["starts"].as_str().unwrap_or("");
  let d = days_until(starts, now).unwrap_or(0);
  let day = parse_local(starts).map(|x| x.format("%a %-d %b").to_string()).unwrap_or_else(|| starts.get(..10).unwrap_or(starts).to_string());
  let when = match d { 0 => "Today".to_string(), 1 => "Tomorrow".to_string(), _ => format!("{day}, in {d} days") };
  let venue = e["venue"].as_str().filter(|v| !v.is_empty()).map(|v| format!(" at {v}")).unwrap_or_default();
  (format!("{} needs music", e["name"].as_str().unwrap_or("An event")), format!("{when}{venue}. Open GLUE › Calendar to make or assign a playlist for it."))
}
/// A week ago's day key (what's remembered of the reminders sent).
pub fn week_ago(now: NaiveDateTime) -> String { day_key(now - Duration::days(7)) }

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;
  fn at(s: &str) -> NaiveDateTime { parse_local(s).unwrap() }
  fn ev(starts: &str, extra: Value) -> Value { let mut e = json!({ "id": "e", "name": "Lux", "starts": starts, "status": "planned", "remindDays": 7, "venue": "Club", "folderId": null, "lists": [] }); for (k, v) in extra.as_object().unwrap() { e[k] = v.clone(); } e }

  /// As src/core/library/events.ts: within its reminder days, planned, no songs; days counted in local calendar days.
  #[test]
  fn needs_music_as_the_website_says() {
    let now = at("2026-10-07T23:30");
    assert_eq!(days_until("2026-10-08T01:00", now), Some(1));   // tomorrow, though under 2 hours away
    assert_eq!(days_until("2026-10-07", now), Some(0));
    assert!(needs_music(&ev("2026-10-09T23:00", json!({})), 0, now));
    assert!(!needs_music(&ev("2026-10-09T23:00", json!({})), 1, now));                       // it has a song
    assert!(!needs_music(&ev("2026-11-09T23:00", json!({})), 0, now));                       // not yet
    assert!(!needs_music(&ev("2026-10-06T23:00", json!({})), 0, now));                       // over
    assert!(!needs_music(&ev("2026-10-09T23:00", json!({ "status": "cancelled" })), 0, now));
    assert!(!needs_music(&ev("2026-10-09T23:00", json!({ "remindDays": 0 })), 0, now));
    assert!(parse_local("2026-13-01").is_none() && parse_local("soon").is_none());
    assert_eq!(day_key(now), "2026-10-07");
    assert_eq!(week_ago(now), "2026-09-30");
  }

  #[test]
  fn songs_in_its_folder_the_folders_in_it_and_its_playlists() {
    let lists: HashMap<String, Value> = [
      json!({ "id": "f1", "kind": "folder", "items": [], "parentId": "ev" }),
      json!({ "id": "v1", "kind": "playlist", "items": ["a", "b"], "parentId": "f1" }),
      json!({ "id": "l2", "kind": "playlist", "items": ["b", "c"], "parentId": null }),
    ].into_iter().map(|l| (l["id"].as_str().unwrap().to_string(), l)).collect();
    assert_eq!(songs_of(&json!({ "folderId": "f1", "lists": [] }), &lists), 2);
    assert_eq!(songs_of(&json!({ "folderId": "f1", "lists": ["l2"] }), &lists), 3);
    assert_eq!(songs_of(&json!({ "folderId": null, "lists": ["nope"] }), &lists), 0);
  }

  #[test]
  fn the_message_says_when_and_where() {
    let now = at("2026-10-07T10:00");
    assert_eq!(message(&ev("2026-10-09T23:00", json!({})), now), ("Lux needs music".to_string(), "Fri 9 Oct, in 2 days at Club. Open GLUE › Calendar to make or assign a playlist for it.".to_string()));
    assert_eq!(message(&ev("2026-10-08T23:00", json!({ "venue": "" })), now).1, "Tomorrow. Open GLUE › Calendar to make or assign a playlist for it.");
  }
}
