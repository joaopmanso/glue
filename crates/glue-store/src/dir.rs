//! A GLUE folder (src/store/fsx.ts): whole files by '/'-separated paths. `FsDir` is a folder on disk (GLUE Home's),
//! `MemDir` one in memory (the tests').
use crate::json;
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub trait Dir: Send + Sync {
  /// A file's text, or None when it isn't there.
  fn read(&self, path: &str) -> Result<Option<String>, String>;
  /// Write a file whole (its folders made as needed).
  fn write(&self, path: &str, text: &str) -> Result<(), String>;
  /// Remove a file or a folder (nothing when it isn't there).
  fn remove(&self, path: &str) -> Result<(), String>;
  /// The names of the files (or folders) in a folder, sorted.
  fn list(&self, path: &str, dirs: bool) -> Result<Vec<String>, String>;
  /// A file's bytes (a backup's: flyers are pictures).
  fn read_bytes(&self, path: &str) -> Result<Option<Vec<u8>>, String> { Ok(self.read(path)?.map(String::into_bytes)) }
  /// Write bytes whole.
  fn write_bytes(&self, path: &str, data: &[u8]) -> Result<(), String> { self.write(path, &String::from_utf8_lossy(data)) }
  /// When a file was last changed (ms since 1970), if known.
  fn mtime(&self, _path: &str) -> Option<i64> { None }
}

/// A file that isn't JSON (`DamagedFile`): kept aside, its text with it.
#[derive(Debug, Clone, PartialEq)]
pub enum ReadError { Damaged(String), Io(String) }

/// `readJSON`: a file's JSON; None when it's missing or empty (a crash during a first write leaves it empty).
pub fn read_json(d: &dyn Dir, path: &str) -> Result<Option<Value>, ReadError> {
  let Some(t) = d.read(path).map_err(ReadError::Io)? else { return Ok(None) };
  if t.trim().is_empty() { return Ok(None); }
  json::parse(&t).map(Some).map_err(|_| ReadError::Damaged(t))
}

/// `writeJSON`: `JSON.stringify` into the file.
pub fn write_json(d: &dyn Dir, path: &str, v: &Value) -> Result<(), String> { d.write(path, &json::stringify(v)) }

#[derive(Default)]
pub struct MemDir { pub files: Mutex<BTreeMap<String, String>> }
impl MemDir {
  pub fn with(files: impl IntoIterator<Item = (String, String)>) -> Self { MemDir { files: Mutex::new(files.into_iter().collect()) } }
  pub fn snapshot(&self) -> BTreeMap<String, String> { self.files.lock().unwrap().clone() }
}
impl Dir for MemDir {
  fn read(&self, path: &str) -> Result<Option<String>, String> { Ok(self.files.lock().unwrap().get(path).cloned()) }
  fn write(&self, path: &str, text: &str) -> Result<(), String> { self.files.lock().unwrap().insert(path.to_string(), text.to_string()); Ok(()) }
  fn remove(&self, path: &str) -> Result<(), String> {
    let mut f = self.files.lock().unwrap();
    let prefix = format!("{path}/");
    f.retain(|k, _| k != path && !k.starts_with(&prefix));
    Ok(())
  }
  fn list(&self, path: &str, dirs: bool) -> Result<Vec<String>, String> {
    let prefix = if path.is_empty() { String::new() } else { format!("{path}/") };
    let mut out: Vec<String> = vec![];
    for k in self.files.lock().unwrap().keys() {
      let Some(rest) = k.strip_prefix(&prefix) else { continue };
      match rest.split_once('/') {
        Some((d, _)) if dirs => { if !out.iter().any(|x| x == d) { out.push(d.to_string()); } }
        None if !dirs => out.push(rest.to_string()),
        _ => {}
      }
    }
    out.sort_by(|a, b| json::utf16_cmp(a, b));
    Ok(out)
  }
}

/// A folder on disk. Writes go to a temporary file renamed into place (a reader never sees half a file).
pub struct FsDir { pub root: PathBuf }
impl FsDir {
  fn at(&self, path: &str) -> Result<PathBuf, String> {
    if path.split('/').any(|p| p == ".." || p == ".") { return Err("bad path".into()); }
    Ok(self.root.join(Path::new(&path.replace('/', std::path::MAIN_SEPARATOR_STR))))
  }
}
impl Dir for FsDir {
  fn read(&self, path: &str) -> Result<Option<String>, String> {
    match std::fs::read(self.at(path)?) {
      Ok(b) => Ok(Some(String::from_utf8_lossy(&b).into_owned())),
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
      Err(e) => Err(e.to_string()),
    }
  }
  fn write(&self, path: &str, text: &str) -> Result<(), String> {
    let p = self.at(path)?;
    if let Some(d) = p.parent() { std::fs::create_dir_all(d).map_err(|e| e.to_string())?; }
    let tmp = p.with_extension(format!("{}.tmp", p.extension().and_then(|e| e.to_str()).unwrap_or("")));
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
  }
  fn remove(&self, path: &str) -> Result<(), String> {
    let p = self.at(path)?;
    let r = if p.is_dir() { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) };
    match r { Ok(()) => Ok(()), Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(e) => Err(e.to_string()) }
  }
  fn read_bytes(&self, path: &str) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(self.at(path)?) { Ok(b) => Ok(Some(b)), Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None), Err(e) => Err(e.to_string()) }
  }
  fn write_bytes(&self, path: &str, data: &[u8]) -> Result<(), String> {
    let p = self.at(path)?;
    if let Some(d) = p.parent() { std::fs::create_dir_all(d).map_err(|e| e.to_string())?; }
    let tmp = p.with_extension(format!("{}.tmp", p.extension().and_then(|e| e.to_str()).unwrap_or("")));
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
  }
  fn mtime(&self, path: &str) -> Option<i64> {
    std::fs::metadata(self.at(path).ok()?).ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_millis() as i64)
  }
  fn list(&self, path: &str, dirs: bool) -> Result<Vec<String>, String> {
    let rd = match std::fs::read_dir(self.at(path)?) { Ok(r) => r, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]), Err(e) => return Err(e.to_string()) };
    let mut out: Vec<String> = rd.flatten().filter(|e| e.file_type().map(|t| t.is_dir() == dirs).unwrap_or(false)).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    out.sort_by(|a, b| json::utf16_cmp(a, b));
    Ok(out)
  }
}
