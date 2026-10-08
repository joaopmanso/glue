//! Quality verdicts made again when the rules changed (`recheckVerdicts`, ADR 0166): GLUE Home's own, from the details
//! its analysis kept (`d/…`), never the file again. The songs whose verdict a newer rule may change (suspect, bad, or
//! "Genuine hi-res", made by an older rule) get the rules run again on what's stored; the new verdicts go into the
//! library as one edit. Once a collection a run (new rules come with a new GLUE Home).
use crate::{get, text, truthy, Engine, Host};
use glue_audio::out::files::{unzlib, DETAILS_VERSION};
use glue_audio::out::summary::VERDICT_VERSION;
use glue_store::dir::{read_json, Dir};
use glue_store::store::shard_of;
use serde_json::{json, Value};

/// Was it made by older rules, and may newer ones change it? (`recheckVerdicts`'s choice.)
fn due(a: &Value) -> bool {
  a["vv"].as_f64().unwrap_or(1.0) < VERDICT_VERSION && !truthy(get(a, "error"))
    && (matches!(text(a, "grade").as_str(), "warn" | "bad") || text(a, "label") == "Genuine hi-res")
}

impl<H: Host> Engine<H> {
  /// The re-check, once per collection per run, on a thread of its own (the analysis carries on).
  pub(crate) fn recheck_once(&self, p: &str, c: &str) {
    if !self.rechecked.lock().unwrap().insert((p.to_string(), c.to_string())) { return; }
    let Some(e) = self.arc() else { return };
    let (p, c) = (p.to_string(), c.to_string());
    std::thread::spawn(move || if let Err(x) = e.recheck_verdicts(&p, &c) { eprintln!("GLUE Home: couldn’t re-check the verdicts: {x}"); });
  }

  /// The re-check itself: how many verdicts became fine, and how many became doubtful.
  pub fn recheck_verdicts(&self, p: &str, c: &str) -> Result<(usize, usize), String> {
    if self.host.lease_held() { return Ok((0, 0)); }
    let s = self.store(p, c)?;
    let todo: Vec<(String, Value, Value)> = {
      let st = s.lock().unwrap();
      st.analysis.iter().filter(|(_, a)| due(a)).filter_map(|(id, a)| st.tracks.get(id).filter(|t| !truthy(get(t, "remote"))).map(|t| (id.clone(), a.clone(), t.clone()))).collect()
    };
    if todo.is_empty() { return Ok((0, 0)); }
    let cache = self.cache_dir();
    let (mut ops, mut cleared, mut flagged) = (vec![], 0, 0);
    for (id, prev, t) in todo {
      let base = format!("d/{p}/{c}/{}/{id}", shard_of(&id));
      // Of this file still (`loadDetails`): else the next full analysis brings the new rules.
      let Ok(Some(header)) = read_json(&cache, &format!("{base}.json")) else { continue };
      // (Numbers as numbers: the header says 968141.0 where the record says 968141.)
      let num = |v: &Value| v.as_f64();
      if header["v"].as_f64() != Some(DETAILS_VERSION) || num(&header["fileSize"]) != num(&t["size"]) || num(&header["fileMtime"]) != num(&t["mtime"]) || num(&t["size"]).is_none() { continue; }
      let Some(raw) = cache.read_bytes(&format!("{base}.bin")).ok().flatten().and_then(|b| unzlib(&b).ok()) else { continue };
      let Some(next) = glue_audio::recheck(&header, &raw, text(&prev, "at")) else { continue };
      let mut a = serde_json::to_value(&next).map_err(|e| e.to_string())?;
      // `{ ...next, at: prev.at, fp: prev.fp }`: when it was analysed, and whether it has a fingerprint, as they were.
      { let o = a.as_object_mut().unwrap(); o.remove("engine"); o.remove("fp"); o.insert("at".into(), prev["at"].clone()); if let Some(fp) = prev.get("fp") { o.insert("fp".into(), fp.clone()); } }
      let (was, now) = (text(&prev, "grade"), text(&a, "grade"));
      if now == "ok" && was != "ok" { cleared += 1; } else if now != "ok" && was == "ok" { flagged += 1; }
      ops.push(json!({ "m": "analysis", "id": id, "a": a }));
    }
    if ops.is_empty() { return Ok((0, 0)); }
    let paths = {
      let mut st = s.lock().unwrap();
      if self.host.lease_held() { return Ok((0, 0)); }   // a tab opened meanwhile: it's the writer
      for op in &ops { st.apply(op); }
      self.flush(&mut st, p, c)?
    };
    if !paths.is_empty() { self.edited(p, c, &paths); }
    if cleared > 0 || flagged > 0 {
      let parts: Vec<String> = [
        if cleared > 0 { format!("{cleared} song{} now count as fine (a quiet top end is still hi-res)", if cleared == 1 { "" } else { "s" }) } else { String::new() },
        if flagged > 0 { format!("{flagged} found upsampled") } else { String::new() },
      ].into_iter().filter(|x| !x.is_empty()).collect();
      self.event(&format!("Quality verdicts updated: {}.", parts.join(", ")));
    }
    Ok((cleared, flagged))
  }
}

#[cfg(test)]
mod tests {
  use serde_json::json;
  #[test]
  fn which_verdicts_are_made_again() {
    let old = super::VERDICT_VERSION - 1.0;
    assert!(super::due(&json!({ "vv": old, "grade": "warn", "label": "Upsampled" })));
    assert!(super::due(&json!({ "grade": "ok", "label": "Genuine hi-res" })));   // no vv: the first rules
    assert!(!super::due(&json!({ "vv": old, "grade": "ok", "label": "Lossless" })));
    assert!(!super::due(&json!({ "vv": super::VERDICT_VERSION, "grade": "bad", "label": "Transcode" })));
    assert!(!super::due(&json!({ "vv": old, "grade": "bad", "error": "It couldn’t be decoded." })));
  }
}
