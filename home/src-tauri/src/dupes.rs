// Cleaning up duplicates (ADR 0070): the website picks the copies to go, GLUE Home moves them into its
// duplicates folder (under their music folder's name and path, so nothing is lost and they can go back)
// or into the Recycle Bin / Trash. Only files inside a music folder or the incoming folder: never the
// GLUE folder, never a DJ library's folder.
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::disk::{check, inside, Fail};

/// Where moved duplicates go: the setting, else "GLUE duplicates" in the user's folder (not in Music:
/// that's often a music folder, where GLUE would find them again).
pub(crate) fn duplicates_dir(app: &AppHandle) -> PathBuf {
    crate::get_config_impl(app.clone())
        .and_then(|c| c.get("duplicates").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from(default_duplicates(app.clone())))
}

#[tauri::command]
pub fn default_duplicates(app: AppHandle) -> String {
    let base = app.path().home_dir().unwrap_or_else(|_| PathBuf::from("."));
    base.join("GLUE duplicates").to_string_lossy().into_owned()
}

/// The music folders and the incoming folder, resolved (the only places duplicates are taken from).
pub(crate) fn music_roots(app: &AppHandle) -> Vec<PathBuf> {
    let c = crate::get_config_impl(app.clone());
    let folders = c.as_ref().and_then(|c| c.get("folders")).and_then(|v| v.as_object())
        .map(|m| m.values().filter_map(|v| v.as_str().map(PathBuf::from)).collect::<Vec<_>>())
        .unwrap_or_default();
    folders.into_iter().chain(std::iter::once(crate::incoming_dir(app))).filter_map(|p| fs::canonicalize(p).ok()).collect()
}

/// A name that isn't taken there: "song.mp3", then "song (2).mp3"…
fn free(p: PathBuf) -> PathBuf {
    if !p.exists() {
        return p;
    }
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..).map(|n| p.with_file_name(format!("{stem} ({n}){ext}"))).find(|q| !q.exists()).unwrap()
}

/// Move `rel` (inside `root`) into `dup`, as `<root's name>/<rel>`. Across drives: copied, the size
/// checked, then the original removed.
pub(crate) fn move_into(dup: &Path, root: &Path, rel: &str) -> Result<PathBuf, String> {
    let from = inside(root, rel).map_err(|f| f.1)?;
    check(root, &from).map_err(|f| f.1)?;
    let m = fs::metadata(&from).map_err(|e| e.to_string())?;
    if !m.is_file() {
        return Err("not a file".into());
    }
    let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "music".into());
    let to = free(inside(&dup.join(name), rel).map_err(|f| f.1)?);
    fs::create_dir_all(to.parent().ok_or("bad path")?).map_err(|e| e.to_string())?;
    match fs::rename(&from, &to) {
        Ok(()) => Ok(to),
        // Another drive: EXDEV (18) on Unix, ERROR_NOT_SAME_DEVICE (17) on Windows.
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices || matches!(e.raw_os_error(), Some(17) | Some(18)) => {
            let copied = fs::copy(&from, &to).map_err(|e| e.to_string())?;
            if copied != m.len() {
                let _ = fs::remove_file(&to);
                return Err("the copy came out a different size; the original stays".into());
            }
            fs::remove_file(&from).map_err(|e| e.to_string())?;
            Ok(to)
        }
        Err(e) => Err(e.to_string()),
    }
}

/// `POST /fs/dupes {mode: "move" | "trash", items: [{root, path}]}`: each item's result, in order.
pub(crate) fn run(app: &AppHandle, body: &str) -> Result<serde_json::Value, Fail> {
    let ask: serde_json::Value = serde_json::from_str(body).map_err(|e| (400, e.to_string()))?;
    let mode = ask.get("mode").and_then(|v| v.as_str()).unwrap_or("");
    let items: Vec<(String, String)> = ask.get("items").and_then(|v| v.as_array()).map(|a| a.iter().map(|it| (
        it.get("root").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        it.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    )).collect()).unwrap_or_default();
    let roots = music_roots(app);
    let dup = duplicates_dir(app);
    if mode == "move" {
        // Inside a music folder, the songs would come back on the next scan.
        let d = fs::canonicalize(&dup).unwrap_or_else(|_| dup.clone());
        if roots.iter().any(|r| d.starts_with(r)) {
            return Err((409, "The duplicates folder is inside a music folder, so GLUE would find those songs again. Choose another one in GLUE Home's settings.".into()));
        }
    } else if mode != "trash" {
        return Err((400, "move or trash?".into()));
    }
    let results: Vec<serde_json::Value> = items.iter().map(|(root, path)| {
        let Some(root) = fs::canonicalize(root).ok().filter(|r| roots.contains(r)) else {
            return serde_json::json!({ "ok": false, "error": "not a music folder GLUE Home knows" });
        };
        let done = if mode == "move" {
            move_into(&dup, &root, path).map(|to| Some(to.to_string_lossy().into_owned()))
        } else {
            inside(&root, path).map_err(|f| f.1)
                .and_then(|p| check(&root, &p).map(|_| p).map_err(|f| f.1))
                .and_then(|p| if p.is_file() { trash::delete(&p).map_err(|e| e.to_string()) } else { Err("not a file".into()) })
                .map(|_| None)
        };
        match done {
            Ok(to) => serde_json::json!({ "ok": true, "to": to }),
            Err(e) => serde_json::json!({ "ok": false, "error": e }),
        }
    }).collect();
    Ok(serde_json::json!({ "results": results }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("glue-dupes-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        fs::canonicalize(d).unwrap()
    }

    #[test]
    fn moves_under_the_folder_name_and_path_and_numbers_clashes() {
        let base = tmp("move");
        let music = base.join("Music Collection");
        let dup = base.join("GLUE duplicates");
        fs::create_dir_all(music.join("House")).unwrap();
        fs::write(music.join("House/a.mp3"), b"one").unwrap();
        let to = move_into(&dup, &music, "House/a.mp3").unwrap();
        assert_eq!(to, dup.join("Music Collection/House/a.mp3"));
        assert!(!music.join("House/a.mp3").exists());
        assert_eq!(fs::read(&to).unwrap(), b"one");
        // The same name again: numbered, nothing overwritten.
        fs::write(music.join("House/a.mp3"), b"two").unwrap();
        let again = move_into(&dup, &music, "House/a.mp3").unwrap();
        assert_eq!(again, dup.join("Music Collection/House/a (2).mp3"));
        assert_eq!(fs::read(&to).unwrap(), b"one");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn refuses_paths_that_leave_the_folder_and_folders() {
        let base = tmp("refuse");
        let music = base.join("Music");
        fs::create_dir_all(music.join("sub")).unwrap();
        fs::write(base.join("outside.mp3"), b"x").unwrap();
        let dup = base.join("dups");
        assert!(move_into(&dup, &music, "../outside.mp3").is_err());
        assert!(move_into(&dup, &music, "sub").is_err());
        assert!(move_into(&dup, &music, "missing.mp3").is_err());
        assert!(base.join("outside.mp3").exists());
        let _ = fs::remove_dir_all(&base);
    }
}
