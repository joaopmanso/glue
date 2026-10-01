// GLUE Home's disk for the website on this computer (ADR 0051): the website reads and writes its GLUE
// folder, music folders and incoming folder through here, so it needs no folder permission of its
// own. Only inside those roots: every path is a list of plain names, and what it resolves to (links
// included) must still be inside the root it names.
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tiny_http::{Header, Request};

use crate::local::{respond, send_file};

/// A refusal, as an HTTP status and a message for the website.
pub(crate) type Fail = (u16, String);

fn fail(code: u16, msg: impl Into<String>) -> Fail {
    (code, msg.into())
}

fn io_fail(e: std::io::Error) -> Fail {
    match e.kind() {
        std::io::ErrorKind::NotFound => fail(404, "not found"),
        std::io::ErrorKind::PermissionDenied => fail(403, e.to_string()),
        _ => fail(500, e.to_string()),
    }
}

fn cfg_path(c: &Option<serde_json::Value>, key: &str) -> Option<PathBuf> {
    c.as_ref().and_then(|c| c.get(key)).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(PathBuf::from)
}

/// The folders the website may use through GLUE Home: the GLUE folder, the incoming folder, and the
/// music folders (by the collection's folder id).
fn roots(app: &AppHandle) -> (Option<PathBuf>, PathBuf, Vec<(String, PathBuf)>) {
    let c = crate::get_config_impl(app.clone());
    let folders = c.as_ref().and_then(|c| c.get("folders")).and_then(|v| v.as_object())
        .map(|m| m.iter().filter_map(|(id, v)| v.as_str().map(|p| (id.clone(), PathBuf::from(p)))).collect())
        .unwrap_or_default();
    (cfg_path(&c, "glue"), crate::incoming_dir(app), folders)
}

/// One of the GLUE folder, the incoming folder or a music folder (which can be written), not only a DJ
/// library's folder (which is read only).
fn regular(app: &AppHandle, dir: &Path) -> bool {
    let (glue, incoming, folders) = roots(app);
    glue.into_iter().chain(std::iter::once(incoming)).chain(folders.into_iter().map(|f| f.1)).any(|r| fs::canonicalize(&r).map(|c| c == dir).unwrap_or(false))
}

/// The root the website names, if it's one of GLUE Home's roots (compared once resolved).
fn root(app: &AppHandle, name: &str) -> Result<PathBuf, Fail> {
    // Why it can't be reached, said (a Mac said "needs GLUE Home 0.12" for any of these, 2026-10-01).
    let want = fs::canonicalize(name).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => fail(403, format!("this computer doesn't let GLUE Home into {name} (on a Mac: System Settings › Privacy & Security › Files and Folders, or Full Disk Access)")),
        _ => fail(404, format!("{name} isn't reachable right now (a network folder not connected, a drive not plugged in, or the folder was moved or renamed)")),
    })?;
    let (glue, incoming, folders) = roots(app);
    let all = glue.into_iter().chain(std::iter::once(incoming)).chain(folders.into_iter().map(|f| f.1));
    for r in all {
        if fs::canonicalize(&r).map(|c| c == want).unwrap_or(false) {
            return Ok(want);
        }
    }
    // The DJ libraries GLUE Home found (ADR 0065): read only.
    if crate::libraries::is_library(app, &want) {
        return Ok(want);
    }
    Err(fail(403, "not a folder GLUE Home may use"))
}

/// A '/'-separated path inside a root: plain names only (no '..', drive letters or stream names).
/// On Windows a '\' or ':' in a name is a separator, a drive or a stream; on macOS and Linux they're ordinary
/// characters (a song Finder shows as "Track 1/2" is "Track 1:2" on disk). Refusing them there failed a whole
/// network folder's scan on a Mac, 2026-10-01 (ADR 0134).
pub(crate) fn inside(root: &Path, rel: &str) -> Result<PathBuf, Fail> {
    let mut p = root.to_path_buf();
    for part in rel.split('/').filter(|s| !s.is_empty()) {
        let windows_only = cfg!(windows) && part.contains(['\\', ':']);
        if part == "." || part == ".." || part.contains('\0') || windows_only || part.chars().any(|c| c.is_control()) {
            return Err(fail(400, "bad path"));
        }
        p.push(part);
    }
    Ok(p)
}

/// Still inside the root once links are followed: the path itself if it exists, else its nearest
/// existing folder.
pub(crate) fn check(root: &Path, p: &Path) -> Result<(), Fail> {
    let mut at = p;
    loop {
        if let Ok(c) = fs::canonicalize(at) {
            return if c.starts_with(root) { Ok(()) } else { Err(fail(403, "outside the folder")) };
        }
        at = at.parent().ok_or_else(|| fail(403, "outside the folder"))?;
    }
}

fn mtime(m: &fs::Metadata) -> u64 {
    m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn describe(name: &str, m: &fs::Metadata) -> serde_json::Value {
    serde_json::json!({ "name": name, "kind": if m.is_dir() { "directory" } else { "file" }, "size": if m.is_dir() { 0 } else { m.len() }, "mtime": mtime(m) })
}

/// A temporary file being written; "…" files are never listed.
const TMP: &str = ".glue-tmp-";

/// The root and the path inside it that a request names.
fn locate(app: &AppHandle, arg: &dyn Fn(&str) -> String) -> Result<(PathBuf, PathBuf), Fail> {
    let base = root(app, &arg("root"))?;
    let target = inside(&base, &arg("path"))?;
    check(&base, &target)?;
    Ok((base, target))
}

fn refuse(req: Request, (code, msg): Fail, cors: &[Header]) {
    respond(req, code, serde_json::json!({ "error": msg }).to_string().into_bytes(), "application/json", cors);
}

pub fn handle(app: AppHandle, mut req: Request, path: &str, arg: &dyn Fn(&str) -> String, cors: Vec<Header>) {
    // A file: sent as it is, with byte ranges (songs play and seek at once), and its date.
    if path == "/fs/file" {
        return match locate(&app, arg).and_then(|(_, p)| fs::metadata(&p).map(|m| (p, m)).map_err(io_fail)) {
            Ok((p, m)) if m.is_file() => {
                let extra = [crate::local::header("x-glue-mtime", &mtime(&m).to_string())];
                send_file(req, &p, crate::local::type_of(&p.to_string_lossy()), cors.into_iter().chain(extra).collect());
            }
            Ok(_) => refuse(req, fail(409, "that's a folder"), &cors),
            Err(f) => refuse(req, f, &cors),
        };
    }
    let json = |v: serde_json::Value| (200u16, v.to_string().into_bytes());
    let result: Result<(u16, Vec<u8>), Fail> = (|| {
        match path {
            // Where the roots are (the website names them in every other request).
            "/fs/roots" => {
                let (glue, incoming, folders) = roots(&app);
                let _ = fs::create_dir_all(&incoming);
                let folders: serde_json::Map<String, serde_json::Value> = folders.into_iter().map(|(id, p)| (id, p.to_string_lossy().into())).collect();
                Ok(json(serde_json::json!({ "glue": glue.map(|p| p.to_string_lossy().into_owned()), "incoming": incoming.to_string_lossy(), "folders": folders, "libraries": crate::libraries::json(&app), "sep": std::path::MAIN_SEPARATOR.to_string() })))
            }
            // A DJ library file chosen with this computer's own dialog (ADR 0065): remembered, and followed
            // live from now on. Its folder is a root, for reading.
            "/fs/pickfile" => {
                use tauri_plugin_dialog::DialogExt;
                let Some(picked) = app.dialog().file().set_title(arg("title")).blocking_pick_file().and_then(|p| p.into_path().ok()) else {
                    return Ok(json(serde_json::json!({ "path": null })));
                };
                crate::libraries::remember(&app, &picked).map_err(|e| fail(500, e))?;
                let dir = picked.parent().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default();
                let name = picked.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                Ok(json(serde_json::json!({ "path": picked.to_string_lossy(), "dir": dir, "file": name })))
            }
            // Choose a folder with this computer's own dialog: the GLUE folder (`as=glue`) or a music
            // folder of a collection (`as=folder:<id>`), which GLUE Home then remembers.
            "/fs/pick" => {
                use tauri_plugin_dialog::DialogExt;
                let mut d = app.dialog().file().set_title(arg("title"));
                let start = arg("start");
                if !start.is_empty() {
                    d = d.set_directory(start);
                }
                let Some(picked) = d.blocking_pick_folder().and_then(|p| p.into_path().ok()) else {
                    return Ok(json(serde_json::json!({ "path": null })));
                };
                let as_ = arg("as");
                let mut cfg = crate::get_config_impl(app.clone()).unwrap_or_else(|| serde_json::json!({}));
                let text = picked.to_string_lossy().into_owned();
                if as_ == "glue" {
                    cfg["glue"] = text.clone().into();
                } else if let Some(id) = as_.strip_prefix("folder:").filter(|id| !id.is_empty()) {
                    if !cfg.get("folders").map(|f| f.is_object()).unwrap_or(false) {
                        cfg["folders"] = serde_json::json!({});
                    }
                    cfg["folders"][id] = text.clone().into();
                } else {
                    return Err(fail(400, "pick a folder as what?"));
                }
                crate::set_config_impl(app.clone(), cfg).map_err(|e| fail(500, e))?;
                let name = picked.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| text.clone());
                Ok(json(serde_json::json!({ "path": text, "name": name })))
            }
            // Song info written into a music file (ADR 0071): {root, path, tags} in the body; its new size and date.
            "/fs/tags" => {
                let mut body = String::new();
                std::io::Read::read_to_string(req.as_reader(), &mut body).map_err(io_fail)?;
                let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| fail(400, e.to_string()))?;
                let root = fs::canonicalize(v.get("root").and_then(|x| x.as_str()).unwrap_or("")).map_err(|_| fail(404, "that folder isn't there"))?;
                if !crate::dupes::music_roots(&app).contains(&root) {
                    return Err(fail(403, "not a music folder GLUE Home knows"));
                }
                let target = inside(&root, v.get("path").and_then(|x| x.as_str()).unwrap_or(""))?;
                check(&root, &target)?;
                let fields = v.get("tags").and_then(|x| x.as_object()).cloned().unwrap_or_default();
                let (size, mtime) = crate::tags::write_tags(&target, &fields).map_err(|e| fail(500, e))?;
                Ok(json(serde_json::json!({ "size": size, "mtime": mtime })))
            }
            // Duplicates put aside or recycled (ADR 0070): items in the body, a result for each.
            "/fs/dupes" => {
                let mut body = String::new();
                std::io::Read::read_to_string(req.as_reader(), &mut body).map_err(io_fail)?;
                Ok(json(crate::dupes::run(&app, &body)?))
            }
            _ => {
                let (base, target) = locate(&app, arg)?;
                if matches!(path, "/fs/write" | "/fs/mkdir" | "/fs/remove") && !regular(&app, &base) {
                    return Err(fail(403, "a DJ library is read here, not written"));
                }
                match path {
                    "/fs/stat" => {
                        let m = fs::metadata(&target).map_err(io_fail)?;
                        Ok(json(describe(&target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), &m)))
                    }
                    "/fs/list" => {
                        let entries = fs::read_dir(&target).map_err(io_fail)?;
                        let list: Vec<serde_json::Value> = entries.flatten().filter_map(|e| {
                            let name = e.file_name().to_string_lossy().into_owned();
                            if name.contains(TMP) {
                                return None;
                            }
                            fs::metadata(e.path()).ok().map(|m| describe(&name, &m))
                        }).collect();
                        Ok(json(serde_json::Value::Array(list)))
                    }
                    "/fs/write" => {
                        if target == base {
                            return Err(fail(400, "bad path"));
                        }
                        if target.is_dir() {
                            return Err(fail(409, "a folder has that name"));
                        }
                        let dir = target.parent().ok_or_else(|| fail(400, "bad path"))?;
                        fs::create_dir_all(dir).map_err(io_fail)?;
                        check(&base, dir)?;
                        // Into a temporary file next to it, then over the old one: never half written.
                        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
                        let tmp = dir.join(format!("{TMP}{n}"));
                        let written = (|| -> std::io::Result<()> {
                            let mut f = fs::File::create(&tmp)?;
                            std::io::copy(req.as_reader(), &mut f)?;
                            f.flush()?;
                            f.sync_all()?;
                            drop(f);
                            fs::rename(&tmp, &target)
                        })();
                        if let Err(e) = written {
                            let _ = fs::remove_file(&tmp);
                            return Err(io_fail(e));
                        }
                        let m = fs::metadata(&target).map_err(io_fail)?;
                        Ok(json(describe(&target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), &m)))
                    }
                    "/fs/mkdir" => {
                        if target.is_file() {
                            return Err(fail(409, "a file has that name"));
                        }
                        fs::create_dir_all(&target).map_err(io_fail)?;
                        Ok(json(serde_json::json!({})))
                    }
                    "/fs/remove" => {
                        if target == base {
                            return Err(fail(400, "can't remove the folder itself"));
                        }
                        let m = fs::symlink_metadata(&target).map_err(io_fail)?;
                        if m.is_dir() {
                            if arg("recursive") == "1" { fs::remove_dir_all(&target) } else { fs::remove_dir(&target) }.map_err(io_fail)?;
                        } else {
                            fs::remove_file(&target).map_err(io_fail)?;
                        }
                        Ok(json(serde_json::json!({})))
                    }
                    _ => Err(fail(404, "not found")),
                }
            }
        }
    })();
    match result {
        Ok((code, body)) => respond(req, code, body, "application/json", &cors),
        Err(f) => refuse(req, f, &cors),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_names_inside_the_root() {
        let r = Path::new("music");
        assert_eq!(inside(r, "A/b.mp3").unwrap(), r.join("A").join("b.mp3"));
        assert!(inside(r, "A/../b.mp3").is_err());
        assert!(inside(r, "./b.mp3").is_err());
        assert!(inside(r, "a\0b").is_err());
        assert!(inside(r, "a\u{7}b").is_err());
    }

    #[test]
    fn colons_and_backslashes_only_matter_on_windows() {
        let r = Path::new("music");
        let mac = inside(r, "Albums/Track 1:2.mp3");
        let back = inside(r, r"Albums/AC\DC.mp3");
        if cfg!(windows) {
            assert!(mac.is_err() && back.is_err());
            assert!(inside(r, "C:/x").is_err());
        } else {
            assert_eq!(mac.unwrap(), r.join("Albums").join("Track 1:2.mp3"));
            assert!(back.is_ok());
        }
    }
}
