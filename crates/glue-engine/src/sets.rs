//! A set mixed by GLUE Home (ADR 0204): the website's plan, mixed here by `glue-sets` (the website's mixer, ported), from
//! the songs on this computer, and handed out as a stream of the mix (stereo f32 at 44.1 kHz, little-endian,
//! interleaved) from any frame. A tab opens a session (`setOpen`), changes its plan as it's edited (`setPlan`), streams
//! it to listen or to export (the local link's `/set/<id>/pcm`), and closes it (`setClose`).
//! - Songs are found (`track_path`), read at a player's priority, decoded (`glue_audio::decode_song`) and resampled to
//!   the mix rate as the mix comes to them; those due in the next 20 s are decoded ahead, a few kept for seeking back.
//! - The renderer writes into a bounded channel: it stays a few blocks ahead of whoever reads, and stops when they go.
use crate::{Engine, Host};
use glue_sets::{dsp::resample, Mixer, Pcm, SetPlan, Sources, MIX_RATE};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::sync::mpsc::{sync_channel, Receiver};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

/// Decoded songs kept beyond those due soon; frames per block; how far ahead songs are decoded; an idle session's life.
const KEEP: usize = 4;
const BLOCK: usize = 4096;
const AHEAD_S: f64 = 20.0;
const IDLE: Duration = Duration::from_secs(30 * 60);

#[derive(Default)]
struct Songs { pcm: HashMap<String, Arc<Pcm>>, used: HashMap<String, Instant>, loading: HashSet<String>, failed: HashMap<String, String> }

pub struct Session { p: String, c: String, plan: Mutex<SetPlan>, songs: Mutex<Songs>, changed: Condvar, touched: Mutex<Instant> }

/// The engine's set sessions, by id.
#[derive(Default)]
pub struct Sets { map: Mutex<HashMap<String, Arc<Session>>>, next: Mutex<u64> }

/// The songs a block needs, as the mixer reads them.
struct Have(HashMap<String, Arc<Pcm>>);
impl Sources for Have { fn get(&self, id: &str) -> Option<&Pcm> { self.0.get(id).map(|p| p.as_ref()) } }

/// The mix as a byte stream (what a reader of `/set/<id>/pcm` gets).
pub struct SetStream { rx: Receiver<Vec<u8>>, buf: Vec<u8>, at: usize }
impl Read for SetStream {
  fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
    while self.at >= self.buf.len() {
      match self.rx.recv() { Ok(b) => { self.buf = b; self.at = 0; } Err(_) => return Ok(0) }
    }
    let k = out.len().min(self.buf.len() - self.at);
    out[..k].copy_from_slice(&self.buf[self.at..self.at + k]);
    self.at += k;
    Ok(k)
  }
}

impl<H: Host> Engine<H> {
  fn set_session(&self, id: &str) -> Result<Arc<Session>, String> {
    let s = self.sets.map.lock().unwrap().get(id).cloned().ok_or("That set isn’t open in GLUE Home any more.")?;
    *s.touched.lock().unwrap() = Instant::now();
    Ok(s)
  }

  /// A session for this plan: its id, the mix's length (frames), and the songs GLUE Home has no file for.
  pub fn set_open(&self, p: &str, c: &str, plan: &Value) -> Result<Value, String> {
    let plan: SetPlan = serde_json::from_value(plan.clone()).map_err(|e| format!("That set’s plan isn’t one GLUE Home reads ({e})"))?;
    let cfg = self.host.config();
    let mut missing = Vec::new();
    let mut seen = HashSet::new();
    for it in &plan.items {
      if !seen.insert(it.id.clone()) { continue; }
      if let Err(why) = self.track_path(p, c, &it.id, &cfg) { missing.push(json!({ "id": it.id, "why": why })); }
    }
    let length = Mixer::new(&plan).length;
    let id = {
      let mut m = self.sets.map.lock().unwrap();
      m.retain(|_, s| s.touched.lock().unwrap().elapsed() < IDLE);
      let mut n = self.sets.next.lock().unwrap();
      *n += 1;
      let id = format!("s{}{:x}", *n, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0) & 0xffffff);
      m.insert(id.clone(), Arc::new(Session { p: p.into(), c: c.into(), plan: Mutex::new(plan), songs: Mutex::new(Songs::default()), changed: Condvar::new(), touched: Mutex::new(Instant::now()) }));
      id
    };
    Ok(json!({ "id": id, "length": length, "missing": missing }))
  }

  /// The session's plan changed (an edit): the next stream mixes it. Its length back.
  pub fn set_plan(&self, id: &str, plan: &Value) -> Result<Value, String> {
    let plan: SetPlan = serde_json::from_value(plan.clone()).map_err(|e| format!("That set’s plan isn’t one GLUE Home reads ({e})"))?;
    let length = Mixer::new(&plan).length;
    *self.set_session(id)?.plan.lock().unwrap() = plan;
    Ok(json!({ "length": length }))
  }

  pub fn set_close(&self, id: &str) -> Value { self.sets.map.lock().unwrap().remove(id); json!({ "ok": true }) }

  /// The mix from `from` (frames) to its end, rendered as it's read.
  pub fn set_stream(self: &Arc<Self>, id: &str, from: usize) -> Result<SetStream, String> {
    let s = self.set_session(id)?;
    let plan = s.plan.lock().unwrap().clone();
    let (tx, rx) = sync_channel::<Vec<u8>>(6);
    let me = self.clone();
    std::thread::spawn(move || {
      let mut m = Mixer::new(&plan);
      let from = from.min(m.length);
      m.seek(from);
      let (mut l, mut r) = (vec![0f32; BLOCK], vec![0f32; BLOCK]);
      let mut f = from;
      while f < m.length {
        let soon = m.needed(f, f + BLOCK + (AHEAD_S * MIX_RATE) as usize);
        for id in &soon { me.set_fetch(&s, id); }
        let now = m.needed(f, f + BLOCK);
        let have = Have(now.iter().filter_map(|id| me.set_wait(&s, id).map(|p| (id.clone(), p))).collect());
        s.keep(&soon);
        let n = m.render(&have, &mut l, &mut r, BLOCK, 0);
        if n == 0 { break; }
        let mut b = Vec::with_capacity(n * 8);
        for i in 0..n { b.extend_from_slice(&l[i].to_le_bytes()); b.extend_from_slice(&r[i].to_le_bytes()); }
        if tx.send(b).is_err() { return; }   // the reader went: stop
        f += n;
      }
    });
    Ok(SetStream { rx, buf: Vec::new(), at: 0 })
  }

  /// Decode a song in the background unless it's here, coming or failed.
  fn set_fetch(self: &Arc<Self>, s: &Arc<Session>, id: &str) {
    {
      let mut g = s.songs.lock().unwrap();
      if g.pcm.contains_key(id) || g.loading.contains(id) || g.failed.contains_key(id) { return; }
      g.loading.insert(id.to_string());
    }
    let (me, s, id) = (self.clone(), s.clone(), id.to_string());
    std::thread::spawn(move || {
      let got = me.set_decode(&s.p, &s.c, &id);
      let mut g = s.songs.lock().unwrap();
      g.loading.remove(&id);
      match got { Ok(p) => { g.pcm.insert(id.clone(), Arc::new(p)); g.used.insert(id, Instant::now()); } Err(e) => { g.failed.insert(id, e); } }
      s.changed.notify_all();
    });
  }

  /// A song the mix needs now: waited for while it's decoded (None: it can't be, and plays as silence).
  fn set_wait(self: &Arc<Self>, s: &Arc<Session>, id: &str) -> Option<Arc<Pcm>> {
    self.set_fetch(s, id);
    let mut g = s.songs.lock().unwrap();
    loop {
      if let Some(p) = g.pcm.get(id) { return Some(p.clone()); }
      if g.failed.contains_key(id) || !g.loading.contains(id) { return None; }
      g = s.changed.wait_timeout(g, Duration::from_millis(500)).unwrap().0;
    }
  }

  /// A song of the collection at the mix rate, stereo.
  fn set_decode(&self, p: &str, c: &str, id: &str) -> Result<Pcm, String> {
    let file = self.track_path(p, c, id, &self.host.config())?;
    let bytes = self.host.read_song_playing(std::path::Path::new(&file.path), &file.name)?;
    let (chs, sr) = glue_audio::decode_song(&bytes, &file.name).map_err(|e| format!("{}: {e}", file.name))?;
    let l = resample(&chs[0], sr, MIX_RATE);
    let r = match chs.get(1) { Some(x) => resample(x, sr, MIX_RATE), None => l.clone() };
    Ok(Pcm { l, r })
  }
}

impl Session {
  /// The songs due soon are kept; of the rest, the most recently used KEEP, for seeking back.
  fn keep(&self, soon: &[String]) {
    let mut g = self.songs.lock().unwrap();
    let t = Instant::now();
    for id in soon { if g.pcm.contains_key(id) { g.used.insert(id.clone(), t); } }
    let mut old: Vec<(String, Instant)> = g.pcm.keys().filter(|id| !soon.contains(id)).map(|id| (id.clone(), g.used.get(id).copied().unwrap_or(t))).collect();
    old.sort_by_key(|x| std::cmp::Reverse(x.1));
    for (id, _) in old.into_iter().skip(KEEP) { g.pcm.remove(&id); g.used.remove(&id); }
  }
}
