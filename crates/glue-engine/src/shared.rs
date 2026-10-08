//! GLUE Home syncs its computer's shared collections when no GLUE tab here does (ADR 0097; home/ui/sharedSync.ts in
//! Rust, ADR 0155): `sync.rs` against the GLUE folder, under the same rule as every other write (only while no tab
//! holds the lease, ADR 0051). Then the song info edited on other devices goes into this computer's files, and what
//! that changed (their size and date) goes back up. A collection deleted from the account is backed up and put away
//! (ADR 0112). GLUE Cloud is reached through the host (`Host::cloud`: its address and this GLUE Home's credential).
use crate::sync::{resolve_clash, sync_shared, waiting_clashes, CloudError, Place, SharedCloud};
use crate::{get, text, Engine, Host};
use glue_store::dir::{read_json, write_json, Dir};
use glue_store::project::{truthy, unknown_computer};
use serde_json::{json, Value};

/// A collection's copy in GLUE Cloud, over the host's calls (`/v1/shared/:cid/*`).
pub struct HttpCloud<'a, H: Host> { pub host: &'a H, pub cid: String }
impl<H: Host> HttpCloud<'_, H> {
  fn at(&self, path: &str) -> String { format!("/v1/shared/{}{path}", self.cid) }
  fn json(&self, method: &str, path: &str, ctype: Option<&str>, body: Option<&str>) -> Result<Value, CloudError> {
    let t = self.host.cloud(method, &self.at(path), ctype, body)?;
    serde_json::from_str(&t).map_err(|_| CloudError::new("GLUE Cloud answered strangely"))
  }
}
impl<H: Host> SharedCloud for HttpCloud<'_, H> {
  fn changes(&self, since: i64) -> Result<Value, CloudError> { self.json("GET", &format!("/changes?since={since}"), None, None) }
  fn bundle(&self, paths: &[String]) -> Result<String, CloudError> { self.host.cloud("POST", &self.at("/bundle"), Some("application/json"), Some(&json!({ "paths": paths }).to_string())) }
  fn log(&self, since: i64) -> Result<Value, CloudError> { self.json("GET", &format!("/log?since={since}"), None, None) }
  fn append(&self, base: i64, paths: &[String], data: &str) -> Result<Value, CloudError> {
    self.json("POST", "/append?music=1", Some("text/plain"), Some(&format!("{base}\t{}\n{data}", json!(paths))))
  }
  fn touched(&self, to: i64) -> Result<Value, CloudError> { self.json("GET", &format!("/touched?to={to}"), None, None) }
  fn checkpoint(&self, at: i64, body: &str, done: bool) -> Result<Value, CloudError> {
    self.json("POST", &format!("/checkpoint?at={at}{}", if done { "&done=1" } else { "" }), Some("text/plain"), Some(body))
  }
}

/// This computer's other devices (ADR 0162): this GLUE Home's own; its pushes are this computer's.
fn own_devices(cfg: &Value) -> Vec<String> { cfg["deviceId"].as_str().filter(|d| !d.is_empty()).map(|d| vec![d.to_string()]).unwrap_or_default() }

/// A collection's numbers, sent when they changed since the last time, and once a day anyway (counts.ts `sendCounts`).
fn send_counts(last: &mut std::collections::HashMap<String, (String, i64)>, cid: &str, tracks: u64, songs: u64, now: i64) -> bool {
  let key = format!("{tracks}/{songs}");
  if let Some((k, at)) = last.get(cid) { if *k == key && now - at < 86_400_000 { return false; } }
  last.insert(cid.into(), (key, now));
  true
}

impl<H: Host> Engine<H> {
  /// Sync every shared collection here (one sync at a time: a call while one runs waits for it). The files that changed
  /// here.
  pub fn sync_shared_here(&self) -> Result<usize, CloudError> {
    let _one = self.syncing.lock().unwrap();
    let cfg = self.host.config();
    if [&cfg["deviceId"], &cfg["token"], &cfg["glue"]].iter().any(|v| v.as_str().is_none_or(|s| s.is_empty())) { return Ok(0); }
    if self.host.lease_held() { return Ok(0); }   // the open tab syncs
    let Some(lib) = self.describe() else { return Ok(0) };
    let computer = cfg["computer"].as_str();
    let mut changed = 0;
    for p in lib["profiles"].as_array().into_iter().flatten() { for c in p["collections"].as_array().into_iter().flatten() {
      let (pid, cid) = (text(p, "id"), text(c, "id"));
      // Cloud sync turned off for the profile: its collections stay as they are (ADR 0102).
      let prof = read_json(&self.dir(), &format!("profiles/{pid}/profile.json")).ok().flatten();
      if prof.as_ref().and_then(|x| x["cloudSync"].as_bool()) == Some(false) { continue; }
      let Some(meta) = read_json(&self.dir(), &format!("profiles/{pid}/collections/{cid}/collection.json")).ok().flatten() else { continue };
      if !truthy(get(&meta, "shared")) { continue; }
      // As this computer, once GLUE Home knows which it is (ADR 0108); until then, not synced from here.
      if unknown_computer(computer) { continue; }
      let me = computer.unwrap_or("").to_string();
      if self.host.lease_held() { return Ok(changed); }   // a tab opened meanwhile: it's the writer now
      // The engine's store first: anything written under another id is put right before this syncs (ADR 0108).
      self.store(&pid, &cid).map_err(CloudError::new)?;
      let root = self.dir();
      let cloud = HttpCloud { host: &self.host, cid: cid.clone() };
      let place = Place { root: &root, pid: pid.clone(), cid: cid.clone(), me, cloud: &cloud, own: own_devices(&cfg) };
      // Only the files written here since the last sync are looked at (every one now and then, ADR 0107).
      let hint = self.take_written(&pid, &cid);
      // What came in, into the store (and a GLUE tab's feed), also when the sync fails partway (ADR 0143).
      let mut got = vec![];
      let res = match sync_shared(&place, hint.as_deref(), &mut got) {
        Ok(r) => r,
        Err(e) => {
          self.written_again(&pid, &cid, hint.as_deref());
          // Deleted from the account on another device (ADR 0112): a backup, then forgotten here.
          if e.status == 410 { self.forget_deleted(&pid, &cid, &text(&meta, "name")); continue; }
          if !got.is_empty() { self.reload(&pid, &cid, &got); }
          return Err(e);
        }
      };
      changed += res.changed.len();
      self.reload(&pid, &cid, &res.changed);
      // This computer's numbers, for the account's list (ADR 0112), when they changed.
      let (tracks, songs, holds, unwritten) = {
        let s = self.store(&pid, &cid).map_err(CloudError::new)?;
        let st = s.lock().unwrap();
        let (t, n) = st.counts();
        (t, n, st.holds_music(), st.tracks.values().any(|t| truthy(get(t, "unwritten")) && !truthy(get(t, "remote"))))
      };
      if holds && send_counts(&mut self.counted.lock().unwrap(), &cid, tracks, songs, self.host.now().0) {
        let body = json!({ "tracks": tracks, "songs": songs }).to_string();
        if self.host.cloud("POST", &format!("/v1/shared/{cid}/stats"), Some("application/json"), Some(&body)).is_err() { self.counted.lock().unwrap().remove(&cid); }
      }
      // Song info edited elsewhere, into this computer's files; their new size and date go back up.
      if !unwritten { continue; }
      if self.host.lease_held() { return Ok(changed); }
      self.write_unwritten(&pid, &cid).map_err(CloudError::new)?;
      let hint = self.take_written(&pid, &cid);
      if let Err(e) = sync_shared(&place, hint.as_deref(), &mut vec![]) { self.written_again(&pid, &cid, hint.as_deref()); return Err(e); }
    } }
    Ok(changed)
  }

  /// The clashes waiting in a shared collection here (ADR 0095): GLUE Home syncs it, a GLUE tab shows them (ADR 0162).
  pub fn clashes(&self, pid: &str, cid: &str) -> Value {
    let cfg = self.host.config();
    let (root, cloud) = (self.dir(), HttpCloud { host: &self.host, cid: cid.into() });
    let place = Place { root: &root, pid: pid.into(), cid: cid.into(), me: cfg["computer"].as_str().unwrap_or("").into(), cloud: &cloud, own: own_devices(&cfg) };
    json!({ "clashes": waiting_clashes(&place) })
  }
  /// A clash answered in a GLUE tab (`shared.resolve`): settled here, the file read again (and in the tab's feed), and
  /// sent with the next sync.
  pub fn resolve(&self, pid: &str, cid: &str, b: &Value) -> Result<Value, String> {
    let (file, at) = (text(b, "file"), text(b, "at"));
    if !crate::sync::synced(&file) { return Err("not a file of the collection".into()); }
    let cfg = self.host.config();
    let (root, cloud) = (self.dir(), HttpCloud { host: &self.host, cid: cid.into() });
    let place = Place { root: &root, pid: pid.into(), cid: cid.into(), me: cfg["computer"].as_str().unwrap_or("").into(), cloud: &cloud, own: own_devices(&cfg) };
    // The store is the file's writer: what it has waiting saved first, then the answer written and read back, all while
    // holding it (an analysis saving between the two put the old value back).
    let files = std::slice::from_ref(&file);
    {
      let s = self.store(pid, cid)?;
      let mut st = s.lock().unwrap();
      self.flush(&mut st, pid, cid)?;
      resolve_clash(&place, &file, &at, b.get("value"), b["keepRemote"].as_bool().unwrap_or(false));
      st.reload_files(files).map_err(|e| e.to_string())?;
    }
    self.written_again(pid, cid, Some(files));
    self.changed(pid, cid, files, &[]);
    if let Some(e) = self.arc() { e.sync_soon(500); }
    Ok(json!({ "left": waiting_clashes(&place).len() }))
  }

  /// A collection deleted from the account (ADR 0112; store/shared/forget.ts): the profile backed up, then the
  /// collection out of its list; its files stay in the GLUE folder.
  pub fn forget_deleted(&self, pid: &str, cid: &str, name: &str) {
    if self.host.lease_held() { return; }   // a tab opened meanwhile: it forgets it
    let path = format!("profiles/{pid}/profile.json");
    let Ok(Some(raw)) = read_json(&self.dir(), &path) else { return };
    let Ok(mut prof) = glue_store::store::migrate(raw) else { return };
    let cols = prof["collections"].as_array().cloned().unwrap_or_default();
    if !cols.iter().any(|c| text(c, "id") == cid) { return; }
    let (_, at) = self.host.now();
    let Ok(zip) = glue_store::backup::build_backup(&self.dir(), &prof, false, &at) else { return };
    if self.dir().write_bytes(&format!("backups/pre-deleted-{}-{cid}.zip", &at[..10]), &zip).is_err() { return; }
    let left: Vec<Value> = cols.into_iter().filter(|c| text(c, "id") != cid).collect();
    if text(&prof, "lastCollection") == cid { prof["lastCollection"] = left.first().map(|c| c["id"].clone()).unwrap_or(Value::Null); }
    prof["collections"] = Value::Array(left);
    if write_json(&self.dir(), &path, &prof).is_err() { return; }
    self.drop_store(pid, cid);
    self.event(&format!("“{name}” was deleted from your account: backed up and put away"));
  }
}

#[cfg(test)]
mod tests {
  #[test]
  fn counts_are_sent_when_they_change_and_daily() {
    let mut last = std::collections::HashMap::new();
    assert!(super::send_counts(&mut last, "c1", 10, 4, 1000));
    assert!(!super::send_counts(&mut last, "c1", 10, 4, 2000));
    assert!(super::send_counts(&mut last, "c1", 11, 4, 3000));
    assert!(super::send_counts(&mut last, "c1", 11, 4, 3000 + 86_400_000));
  }
}
