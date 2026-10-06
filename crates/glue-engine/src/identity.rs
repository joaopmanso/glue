//! Which computer GLUE Home is on (ADR 0108), home/ui/identity.ts in Rust (ADR 0158): the account's device a computer's
//! shared parts go under (its copies of the songs, its analyses, its music folders), the same one a GLUE tab here is.
//! From GLUE Cloud: GLUE Home's companion. Failing that, from what's on this disk: the member of this GLUE folder's
//! shared collections whose music folders GLUE Home found here, which GLUE Home then vouches for (it becomes its
//! companion). Failing that, the next GLUE tab here that attaches (ADR 0091, `attach`). Until it's known, GLUE Home
//! writes none of a shared collection's per-computer parts.
use crate::{text, truthy, Engine, Host};
use glue_store::project::unknown_computer;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::sync::Arc;

impl<H: Host> Engine<H> {
  /// The members of this GLUE folder's shared collections whose (non-hidden) music folders GLUE Home found on this
  /// computer, sorted.
  pub fn computers_here(&self, cfg: &Value) -> Vec<String> {
    let found: BTreeSet<String> = cfg["folders"].as_object().map(|m| m.keys().cloned().collect()).unwrap_or_default();
    let mut out = BTreeSet::new();
    let lib = self.describe().unwrap_or(Value::Null);
    for p in lib["profiles"].as_array().into_iter().flatten() { for c in p["collections"].as_array().into_iter().flatten() {
      let Ok(Some(meta)) = glue_store::dir::read_json(&self.dir(), &format!("profiles/{}/collections/{}/collection.json", text(p, "id"), text(c, "id"))) else { continue };
      if !truthy(meta.get("shared")) || truthy(meta.get("movedTo")) { continue; }
      for (m, roots) in meta["rootsBy"].as_object().into_iter().flatten() {
        if unknown_computer(Some(m)) { continue; }
        if roots.as_array().into_iter().flatten().any(|r| !truthy(r.get("hidden")) && found.contains(&text(r, "id"))) { out.insert(m.clone()); }
      }
    } }
    out.into_iter().collect()
  }

  /// Which computer this is, and why (`computer` None: not known, `why` says why). Err: GLUE Cloud couldn't be asked
  /// (unreachable, or not answering as it should: nothing changes; its "no companion" is an answer).
  pub fn who_am_i(&self, cfg: &Value) -> Result<(Option<String>, String), String> {
    if cfg["deviceId"].as_str().is_none_or(|d| d.is_empty()) || cfg["token"].as_str().is_none_or(|t| t.is_empty()) { return Ok((None, "not connected to a GLUE account".into())); }
    let t = self.host.cloud("GET", "/v1/computer", None, None).map_err(|e| e.message)?;
    let cloud = serde_json::from_str::<Value>(&t).map_err(|e| e.to_string())?["computer"].as_str().map(String::from);
    let here = self.computers_here(cfg);
    if let Some(c) = cloud {
      // GLUE Cloud and this disk disagree: nothing is written until they don't.
      if !here.is_empty() && !here.contains(&c) { return Ok((None, format!("GLUE Cloud says this computer is “{c}”, but its music folders are another computer’s ({})", here.join(", ")))); }
      return Ok((Some(c), "GLUE Cloud".into()));
    }
    if here.len() == 1 {
      // Vouched for: it becomes this GLUE Home's companion (ADR 0091).
      return match self.host.cloud("POST", "/v1/computer/attach", Some("application/json"), Some(&json!({ "browser": here[0] }).to_string())) {
        Ok(t) => match serde_json::from_str::<Value>(&t).ok().and_then(|v| v["device"].as_str().map(String::from)) {
          Some(d) => Ok((Some(d), "its music folders".into())),
          None => Ok((None, "GLUE Cloud didn’t confirm the computer its music folders show (200)".into())),
        },
        Err(e) if e.status == 0 => Err(e.message),
        Err(e) => Ok((None, format!("GLUE Cloud didn’t confirm the computer its music folders show ({})", e.status))),
      };
    }
    Ok((None, if here.len() > 1 { format!("its music folders belong to several computers ({})", here.join(", ")) } else { "a GLUE tab on this computer hasn’t attached yet".into() }))
  }

  /// Asked of GLUE Cloud (and this disk's music folders), and saved when it changed.
  pub fn learn_computer(self: &Arc<Self>) {
    let cfg = self.host.config();
    let Ok((computer, why)) = self.who_am_i(&cfg) else { return };
    if computer.as_deref() == cfg["computer"].as_str() && why == cfg["computerWhy"].as_str().unwrap_or("") { return; }
    self.set_computer(computer, &why);
  }
  /// This computer is `computer` (None: not known), and why. When it changed, everything here reads the library as
  /// that computer again (and puts right what was written under another id).
  pub fn set_computer(self: &Arc<Self>, computer: Option<String>, why: &str) {
    let was = self.host.config()["computer"].as_str().map(String::from);
    let (c2, w2) = (computer.clone(), why.to_string());
    self.host.patch_config(&move |_| Some(json!({ "computer": c2, "computerWhy": w2 })));
    self.room_told();
    if computer == was { return; }
    self.forget();
    self.host.event(&match &computer {
      Some(_) => format!("This computer is known ({why}): its songs are read and written as its own"),
      None => format!("Which computer this is isn’t known ({why}): nothing is written for it"),
    });
    if computer.is_some() { self.run_analysis(); self.sync_soon(1500); }
  }
  /// A browser on this computer joins it (ADR 0091): it reached GLUE Home on 127.0.0.1, which vouches for it; the
  /// device it is now is this computer (ADR 0108).
  pub fn attach(self: &Arc<Self>, browser: &str) -> Result<(), String> {
    if browser.is_empty() { return Err("no browser".into()); }
    let t = self.host.cloud("POST", "/v1/computer/attach", Some("application/json"), Some(&json!({ "browser": browser }).to_string())).map_err(|e| e.message)?;
    if let Some(d) = serde_json::from_str::<Value>(&t).ok().and_then(|v| v["device"].as_str().map(String::from)) { self.set_computer(Some(d), "a GLUE tab on this computer"); }
    Ok(())
  }
}
