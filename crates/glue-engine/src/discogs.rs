//! Discogs, with the user's personal access token (ADR 0186): GLUE Home's settings keep it (`discogsToken`, this
//! computer's only). It goes to Discogs' API only (`API`, web.rs), at most a request every 1.1 s (Discogs allows 60 a
//! minute with a token), sharing the cover look-up's pace. Checked once set: `discogsUser` (the account's name) and
//! `discogsAt` (when) in the settings, or `discogsError`.
use crate::covers::Service;
use crate::{Engine, Host};
use serde_json::{json, Value};

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
