// GLUE Home (ADR 0044): an icon next to the clock; a settings window; a hidden window that runs the
// service (online in the account's signaling room, receiving songs over WebRTC). This Rust side
// keeps the settings file, writes received songs into the incoming folder, and runs the tray menu.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent, Wry};
use tauri_plugin_opener::OpenerExt;

mod disk;
mod dock;
mod dupes;
mod tags;
mod libraries;
mod local;
mod ws;
mod activity;
mod web;
mod analysis;

/// The GLUE library in the browser. `open=home`: a GLUE tab that's open already comes forward instead.
const LIBRARY_URL: &str = "https://joaopmanso.github.io/glue/?open=home#/";

/// Songs being received: id → (the file being written, its `.part` path, its final path).
#[derive(Default)]
struct Transfers {
    next: Mutex<u32>,
    open: Mutex<HashMap<u32, (File, PathBuf, PathBuf)>>,
}

/// The tray menu items that change with the service's state.
struct Tray {
    status: MenuItem<Wry>,
    start: MenuItem<Wry>,
    stop: MenuItem<Wry>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map(|d| d.join("config.json")).map_err(|e| e.to_string())
}

/// The settings (account, device credential, incoming folder), or none before the first setup.
#[tauri::command]
fn get_config(app: AppHandle) -> Option<serde_json::Value> {
    get_config_impl(app)
}

/// The settings as last read, with the file's date and size then: read again only when the file
/// changed (every request of the local link and every file read asks for them; the user's report,
/// 2026-09-28, of GLUE Home using the CPU while idle).
static CONFIG: Mutex<Option<(std::time::SystemTime, u64, serde_json::Value)>> = Mutex::new(None);

pub(crate) fn get_config_impl(app: AppHandle) -> Option<serde_json::Value> {
    let p = config_path(&app).ok()?;
    let m = fs::metadata(&p).ok()?;
    let (at, len) = (m.modified().ok()?, m.len());
    if let Some((a, l, v)) = CONFIG.lock().unwrap().as_ref() {
        if *a == at && *l == len {
            return Some(v.clone());
        }
    }
    let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(&p).ok()?).ok()?;
    *CONFIG.lock().unwrap() = Some((at, len, v.clone()));
    Some(v)
}

/// Save the settings (readable by this user only) and tell both windows.
#[tauri::command]
fn set_config(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    set_config_impl(app, config)
}

pub(crate) fn set_config_impl(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    let p = config_path(&app)?;
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
    }
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    *CONFIG.lock().unwrap() = None;   // read again next time (its date may not have moved)
    let _ = app.emit("config", &config);
    Ok(())
}

/// Music/GLUE Incoming, the suggested incoming folder.
#[tauri::command]
fn default_incoming(app: AppHandle) -> String {
    let base = app.path().audio_dir().or_else(|_| app.path().home_dir()).unwrap_or_else(|_| PathBuf::from("."));
    base.join("GLUE Incoming").to_string_lossy().into_owned()
}

/// This computer's name, to show in the account's device list.
#[tauri::command]
fn device_name() -> String {
    if let Ok(n) = std::env::var("COMPUTERNAME") {
        return n;
    }
    #[cfg(target_os = "macos")]
    if let Ok(o) = std::process::Command::new("scutil").args(["--get", "ComputerName"]).output() {
        let n = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if !n.is_empty() {
            return n;
        }
    }
    std::env::var("HOSTNAME").unwrap_or_else(|_| "GLUE Home".into())
}

/// A file name that is safe on Windows and macOS (the website sends only the name, never a path).
pub(crate) fn safe_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let mut n: String = base.chars().map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c }).collect();
    n = n.trim().trim_end_matches(['.', ' ']).to_string();
    let stem = n.split('.').next().unwrap_or("").to_ascii_lowercase();
    if ["con", "prn", "aux", "nul"].contains(&stem.as_str()) || ((stem.starts_with("com") || stem.starts_with("lpt")) && stem.len() == 4) {
        n = format!("_{n}");
    }
    if n.is_empty() || n == "." || n == ".." {
        n = "song".into();
    }
    if n.chars().count() > 180 {
        n = n.chars().take(170).collect();
    }
    n
}

fn with_number(name: &str, i: u32) -> String {
    match name.rfind('.') {
        Some(d) if d > 0 => format!("{} ({}){}", &name[..d], i, &name[d..]),
        _ => format!("{name} ({i})"),
    }
}

pub(crate) fn incoming_dir(app: &AppHandle) -> PathBuf {
    get_config(app.clone())
        .and_then(|c| c.get("incoming").and_then(|v| v.as_str()).map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from(default_incoming(app.clone())))
}

/// A song starts: a `.part` file in the incoming folder, under a name that isn't taken.
#[tauri::command]
fn incoming_begin(app: AppHandle, t: State<'_, Transfers>, name: String) -> Result<(u32, String), String> {
    let dir = incoming_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| format!("can't use the incoming folder {}: {e}", dir.display()))?;
    let clean = safe_name(&name);
    let (mut fin, mut i) = (clean.clone(), 2);
    while dir.join(&fin).exists() || dir.join(format!("{fin}.part")).exists() {
        fin = with_number(&clean, i);
        i += 1;
    }
    let part = dir.join(format!("{fin}.part"));
    let f = File::create(&part).map_err(|e| e.to_string())?;
    let mut next = t.next.lock().unwrap();
    *next += 1;
    t.open.lock().unwrap().insert(*next, (f, part, dir.join(&fin)));
    Ok((*next, fin))
}

/// More bytes of a song (a raw body; its id in the `x-id` header).
#[tauri::command]
fn incoming_write(request: tauri::ipc::Request<'_>, t: State<'_, Transfers>) -> Result<(), String> {
    let id: u32 = request.headers().get("x-id").and_then(|v| v.to_str().ok()).and_then(|s| s.parse().ok()).ok_or("no transfer id")?;
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("expected bytes".into());
    };
    let mut open = t.open.lock().unwrap();
    let (f, _, _) = open.get_mut(&id).ok_or("unknown transfer")?;
    f.write_all(data).map_err(|e| e.to_string())
}

/// A song is complete (it gets its real name) or failed (the `.part` file goes).
#[tauri::command]
fn incoming_end(t: State<'_, Transfers>, id: u32, ok: bool) -> Result<String, String> {
    let (f, part, fin) = t.open.lock().unwrap().remove(&id).ok_or("unknown transfer")?;
    f.sync_all().ok();
    drop(f);
    if !ok {
        let _ = fs::remove_file(&part);
        return Ok(String::new());
    }
    fs::rename(&part, &fin).map_err(|e| e.to_string())?;
    Ok(fin.to_string_lossy().into_owned())
}

// ---- this computer's GLUE library (ADR 0045): read-only; the website stays its only writer ----------

fn cfg_str(c: &Option<serde_json::Value>, key: &str) -> Option<PathBuf> {
    c.as_ref().and_then(|c| c.get(key)).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(PathBuf::from)
}

/// Where the website keeps its GLUE folder, if it's in a usual place (it has an mco.json).
#[tauri::command]
fn find_glue_folder(app: AppHandle) -> Option<String> {
    let p = app.path();
    let bases = [p.document_dir(), p.home_dir(), p.audio_dir(), p.desktop_dir()];
    for base in bases.into_iter().flatten() {
        for name in ["GLUE", "MCO", "Glue"] {
            let d = base.join(name);
            if d.join("mco.json").is_file() {
                return Some(d.to_string_lossy().into_owned());
            }
        }
    }
    None
}

/// The usual folders of this computer (to find music folders by name).
#[tauri::command]
fn known_folders(app: AppHandle) -> serde_json::Value {
    let p = app.path();
    let s = |r: tauri::Result<PathBuf>| r.ok().map(|d| d.to_string_lossy().into_owned());
    serde_json::json!({ "home": s(p.home_dir()), "music": s(p.audio_dir()), "documents": s(p.document_dir()), "desktop": s(p.desktop_dir()), "downloads": s(p.download_dir()), "sep": std::path::MAIN_SEPARATOR.to_string() })
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

/// Where a song dropped onto a GLUE page is (the browser never says, ADR 0125): a file called `name` (any case) of
/// `size` bytes. Looks through `first` (the collection's music folders) whole, then the usual folders and every
/// drive (or volume), a few levels deep; gives up after a while.
#[tauri::command]
async fn find_file(app: AppHandle, name: String, size: u64, first: Vec<String>) -> Option<String> {
    let p = app.path();
    let mut later: Vec<PathBuf> = [p.audio_dir(), p.download_dir(), p.desktop_dir(), p.document_dir(), p.home_dir()].into_iter().flatten().collect();
    #[cfg(windows)]
    for d in b'C'..=b'Z' {
        let r = PathBuf::from(format!("{}:\\", d as char));
        if r.exists() {
            later.push(r);
        }
    }
    #[cfg(target_os = "macos")]
    if let Ok(v) = fs::read_dir("/Volumes") {
        later.extend(v.flatten().map(|e| e.path()));
    }
    let first: Vec<PathBuf> = first.into_iter().map(PathBuf::from).collect();
    tauri::async_runtime::spawn_blocking(move || search_file(&first, 64, &name, size).or_else(|| search_file(&later, 8, &name, size))).await.ok().flatten()
}

fn search_file(starts: &[PathBuf], depth_max: u32, name: &str, size: u64) -> Option<String> {
    use std::collections::{HashSet, VecDeque};
    let want = name.to_lowercase();
    let skip = ["windows", "program files", "program files (x86)", "programdata", "appdata", "$recycle.bin", "system volume information", "library", "node_modules", "applications", "system", "private", "usr", "bin", "opt"];
    let started = std::time::Instant::now();
    let (mut seen, mut visited) = (HashSet::new(), 0usize);
    let mut queue: VecDeque<(PathBuf, u32)> = starts.iter().map(|s| (s.clone(), 0)).collect();
    while let Some((dir, depth)) = queue.pop_front() {
        if visited > 600_000 || started.elapsed().as_secs() > 25 {
            break;
        }
        if !seen.insert(dir.clone()) {
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            visited += 1;
            let Ok(t) = e.file_type() else { continue };
            let n = e.file_name().to_string_lossy().to_lowercase();
            if t.is_file() {
                if n == want && e.metadata().map(|m| m.len() == size).unwrap_or(false) {
                    return Some(e.path().to_string_lossy().into_owned());
                }
                continue;
            }
            if !t.is_dir() || t.is_symlink() || depth >= depth_max || n.starts_with('.') || skip.contains(&n.as_str()) {
                continue;
            }
            queue.push_back((e.path(), depth + 1));
        }
    }
    None
}

/// Where a music folder is on this computer: a folder called `name` that has `sample` (a song's
/// path inside it) in it. Looks in the usual folders first, then every drive (or volume), a few
/// levels deep, skipping system folders; gives up after a while.
#[tauri::command]
/// `secs`: how long to look (25 at most). A folder just dropped on the website looks briefly, then GLUE Home's
/// dialog asks: a network folder isn't on any drive here, and a long search showed nothing (ADR 0134).
async fn find_folder(app: AppHandle, name: String, sample: String, secs: Option<u64>) -> Option<String> {
    let p = app.path();
    let mut starts: Vec<PathBuf> = [p.audio_dir(), p.document_dir(), p.desktop_dir(), p.download_dir(), p.home_dir()].into_iter().flatten().collect();
    #[cfg(windows)]
    for d in b'C'..=b'Z' {
        let r = PathBuf::from(format!("{}:\\", d as char));
        if r.exists() {
            starts.push(r);
        }
    }
    #[cfg(target_os = "macos")]
    if let Ok(v) = fs::read_dir("/Volumes") {
        starts.extend(v.flatten().map(|e| e.path()));
    }
    let limit = secs.unwrap_or(25).clamp(1, 25);
    tauri::async_runtime::spawn_blocking(move || search(starts, &name, &sample, limit)).await.ok().flatten()
}

fn search(starts: Vec<PathBuf>, name: &str, sample: &str, limit: u64) -> Option<String> {
    use std::collections::{HashSet, VecDeque};
    let rel: PathBuf = sample.split('/').collect();
    let want = name.to_lowercase();
    let skip = ["windows", "program files", "program files (x86)", "programdata", "appdata", "$recycle.bin", "system volume information", "library", "node_modules", "applications", "system", "private", "usr", "bin", "opt"];
    let started = std::time::Instant::now();
    let (mut seen, mut visited) = (HashSet::new(), 0usize);
    let mut queue: VecDeque<(PathBuf, u32)> = starts.into_iter().map(|s| (s, 0)).collect();
    while let Some((dir, depth)) = queue.pop_front() {
        if visited > 300_000 || started.elapsed().as_secs() >= limit {
            break;
        }
        if !seen.insert(dir.clone()) {
            continue;
        }
        let matches = dir.file_name().map(|n| n.to_string_lossy().to_lowercase() == want).unwrap_or(false);
        if matches && dir.join(&rel).is_file() {
            return Some(dir.to_string_lossy().into_owned());
        }
        if depth >= 6 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            visited += 1;
            let Ok(t) = e.file_type() else { continue };
            if !t.is_dir() || t.is_symlink() {
                continue;
            }
            let n = e.file_name().to_string_lossy().to_lowercase();
            if n.starts_with('.') || skip.contains(&n.as_str()) {
                continue;
            }
            queue.push_back((e.path(), depth + 1));
        }
    }
    None
}

/// The service page's file commands are `async`: they run off the main thread, where the windows and
/// the tray live, and each is counted (the user's report, 2026-09-28; ADR 0083).
fn count<T>(what: &str, t0: std::time::Instant, r: Result<T, String>, size: impl FnOnce(&T) -> u64) -> Result<T, String> {
    activity::note(what, t0, r.as_ref().map(size).unwrap_or(0));
    r
}

/// A cover service's answer (ADR 0086): only the services `web.rs` allows.
#[tauri::command]
async fn web_get(app: AppHandle, url: String) -> Result<tauri::ipc::Response, String> {
    let t0 = std::time::Instant::now();
    let version = app.package_info().version.to_string();
    let r = tauri::async_runtime::spawn_blocking(move || web::get(&url, &version)).await.map_err(|e| e.to_string()).and_then(|r| r);
    count("bridge web_get", t0, r, |b| b.len() as u64).map(tauri::ipc::Response::new)
}

/// Does a GLUE tab hold the writer lease (ADR 0087)? Then GLUE Home leaves edits to it.
#[tauri::command]
fn lease_held() -> bool { local::leased() }

/// The library engine's answer to a website request on the local link (ADR 0104).
#[tauri::command]
fn rpc_reply(id: u64, body: String) { local::rpc_done(id, body); }

/// Another device sent edits for this computer: the open tab (if any) takes them in at once.
#[tauri::command]
fn edits_waiting() { local::EDITS.fetch_add(1, std::sync::atomic::Ordering::Relaxed); }

/// What GLUE Home was asked since it started (the settings show it).
#[tauri::command]
fn activity_now() -> serde_json::Value {
    activity::snapshot()
}

/// A text file inside the GLUE folder (the library's JSON), by its path in there.
#[tauri::command]
async fn glue_read(app: AppHandle, rel: String) -> Result<String, String> {
    let t0 = std::time::Instant::now();
    let r = (|| {
        let root = cfg_str(&get_config(app), "glue").ok_or("no GLUE folder chosen")?;
        if rel.split(['/', '\\']).any(|p| p == ".." || p.is_empty()) {
            return Err("bad path".into());
        }
        fs::read_to_string(root.join(&rel)).map_err(|e| e.to_string())
    })();
    count("bridge glue_read", t0, r, |s| s.len() as u64)
}

/// The names of the files in a folder inside the GLUE folder (events' playlists, ADR 0074); none if it isn't there.
#[tauri::command]
async fn glue_list(app: AppHandle, rel: String) -> Result<Vec<String>, String> {
    let root = cfg_str(&get_config(app), "glue").ok_or("no GLUE folder chosen")?;
    if rel.split(['/', '\\']).any(|p| p == ".." || p.is_empty()) {
        return Err("bad path".into());
    }
    let Ok(dir) = fs::read_dir(root.join(rel)) else { return Ok(vec![]) };
    Ok(dir.flatten().filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false)).map(|e| e.file_name().to_string_lossy().into_owned()).collect())
}

/// A folder of GLUE Home's settings as the disk names it (`canonicalize`), remembered (ADR 0141): every file read
/// looked up every folder on every request, the NAS's among them, so a song on a local drive waited on the network,
/// or woke a sleeping drive it doesn't live on. One that can't be reached is tried again after 30 s, a found one
/// after 10 minutes (a drive letter mapped elsewhere).
pub(crate) fn resolved(root: &std::path::Path) -> Option<PathBuf> {
    static SEEN: Mutex<Option<HashMap<PathBuf, (Option<PathBuf>, std::time::Instant)>>> = Mutex::new(None);
    let fresh = |(c, at): &(Option<PathBuf>, std::time::Instant)| at.elapsed().as_secs() < if c.is_some() { 600 } else { 30 };
    if let Some(hit) = SEEN.lock().unwrap().as_ref().and_then(|m| m.get(root)).filter(|e| fresh(e)) {
        return hit.0.clone();
    }
    // Looked up without the lock: a network folder that's slow to answer holds up no other request.
    let c = fs::canonicalize(root).ok();
    SEEN.lock().unwrap().get_or_insert_with(HashMap::new).insert(root.to_path_buf(), (c.clone(), std::time::Instant::now()));
    c
}

/// The folders GLUE Home may use, the ones `path` is written under first (so a file is matched without looking
/// up any other folder: a network folder, another drive).
pub(crate) fn roots_for(roots: Vec<PathBuf>, path: &str) -> Vec<PathBuf> {
    let low = path.replace('\\', "/").to_lowercase();
    let under = |r: &PathBuf| low.starts_with(&r.to_string_lossy().replace('\\', "/").to_lowercase());
    let (mut first, rest): (Vec<_>, Vec<_>) = roots.into_iter().partition(under);
    first.extend(rest);
    first
}

/// Files GLUE Home may read: in the GLUE folder, the music folders it located, the incoming folder.
pub(crate) fn allowed(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let c = get_config(app.clone());
    let mut roots: Vec<PathBuf> = [cfg_str(&c, "glue"), cfg_str(&c, "incoming")].into_iter().flatten().collect();
    if let Some(m) = c.as_ref().and_then(|c| c.get("folders")).and_then(|v| v.as_object()) {
        roots.extend(m.values().filter_map(|v| v.as_str()).map(PathBuf::from));
    }
    let p = fs::canonicalize(path).map_err(|e| e.to_string())?;
    for r in roots_for(roots, path) {
        if resolved(&r).is_some_and(|r| p.starts_with(r)) {
            return Ok(p);
        }
    }
    Err("not in a folder GLUE Home may read".into())
}

#[tauri::command]
async fn file_size(app: AppHandle, path: String) -> Result<u64, String> {
    let t0 = std::time::Instant::now();
    let r = allowed(&app, &path).and_then(|p| fs::metadata(p).map_err(|e| e.to_string())).map(|m| m.len());
    count("bridge file_size", t0, r, |_| 0)
}

/// Bytes of a song, from `offset` (at most `len`), as a raw answer.
#[tauri::command]
/// `play`: read for a song streamed to a device (ADR 0140): the analysis's reads wait meanwhile.
async fn file_read(app: AppHandle, path: String, offset: u64, len: u32, play: Option<bool>) -> Result<tauri::ipc::Response, String> {
    if play == Some(true) {
        local::mark_playing();
    }
    use std::io::{Read, Seek, SeekFrom};
    let t0 = std::time::Instant::now();
    let r = (|| {
        let mut f = File::open(allowed(&app, &path)?).map_err(|e| e.to_string())?;
        f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; len.min(4 * 1024 * 1024) as usize];
        let mut n = 0;
        while n < buf.len() {
            let k = f.read(&mut buf[n..]).map_err(|e| e.to_string())?;
            if k == 0 {
                break;
            }
            n += k;
        }
        buf.truncate(n);
        Ok(buf)
    })();
    count("bridge file_read", t0, r, |b| b.len() as u64).map(tauri::ipc::Response::new)
}

// ---- GLUE Home's own cache: waveforms and full analyses of the shared songs (ADR 0046) --------------

pub(crate) fn cache_path(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    if rel.split(['/', '\\']).any(|p| p == ".." || p.is_empty()) {
        return Err("bad path".into());
    }
    Ok(app.path().app_cache_dir().map_err(|e| e.to_string())?.join("library").join(rel))
}

#[tauri::command]
async fn cache_read(app: AppHandle, rel: String) -> Result<tauri::ipc::Response, String> {
    let t0 = std::time::Instant::now();
    let r = cache_path(&app, &rel).and_then(|p| fs::read(p).map_err(|e| e.to_string()));
    count("bridge cache_read", t0, r, |b| b.len() as u64).map(tauri::ipc::Response::new)
}

/// Write a cache file (a raw body; its path in the `x-rel` header).
#[tauri::command]
async fn cache_write(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let t0 = std::time::Instant::now();
    let rel = request.headers().get("x-rel").and_then(|v| v.to_str().ok()).ok_or("no path")?.to_string();
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("expected bytes".into());
    };
    let r = cache_put(&app, &rel, data);
    count("bridge cache_write", t0, r, |_| data.len() as u64)
}

/// Write a cache file whole (a temporary file, then renamed: a reader never sees half of it).
pub(crate) fn cache_put(app: &AppHandle, rel: &str, data: &[u8]) -> Result<(), String> {
    let p = cache_path(app, rel)?;
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// The names of the files in a cache folder.
#[tauri::command]
async fn cache_list(app: AppHandle, rel: String) -> Result<Vec<String>, String> {
    let t0 = std::time::Instant::now();
    let names: Vec<String> = cache_path(&app, &rel).ok().and_then(|p| fs::read_dir(p).ok()).map(|d| d.flatten().filter(|e| e.path().is_file()).map(|e| e.file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default();
    count("bridge cache_list", t0, Ok(names), |_| 0)
}

// ---- the incoming folder: what's waiting to be sorted (ADR 0046) -----------------------------------

/// The songs in the incoming folder (not the ones still arriving).
#[tauri::command]
async fn incoming_list(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let t0 = std::time::Instant::now();
    count("bridge incoming_list", t0, Ok(incoming_list_impl(app)), |_| 0)
}

pub(crate) fn incoming_list_impl(app: AppHandle) -> Vec<serde_json::Value> {
    let dir = incoming_dir(&app);
    let Ok(d) = fs::read_dir(dir) else { return vec![] };
    d.flatten()
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            let name = e.file_name().to_string_lossy().into_owned();
            if !m.is_file() || name.ends_with(".part") || name.starts_with('.') {
                return None;
            }
            let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            Some(serde_json::json!({ "name": name, "size": m.len(), "mtime": mtime, "path": e.path().to_string_lossy() }))
        })
        .collect()
}

/// Move a song from the incoming folder into one of the music folders GLUE Home found (never
/// overwriting); the website picks it up there on its next scan.
#[tauri::command]
fn incoming_move(app: AppHandle, name: String, to: String) -> Result<String, String> {
    incoming_move_impl(app, name, to)
}

pub(crate) fn incoming_move_impl(app: AppHandle, name: String, to: String) -> Result<String, String> {
    let from = incoming_dir(&app).join(safe_name(&name));
    if !from.is_file() {
        return Err("that song isn't in the incoming folder any more".into());
    }
    let dest = allowed(&app, &to)?;
    let clean = safe_name(&name);
    let (mut fin, mut i) = (clean.clone(), 2);
    while dest.join(&fin).exists() {
        fin = with_number(&clean, i);
        i += 1;
    }
    let target = dest.join(&fin);
    if fs::rename(&from, &target).is_err() {
        // Another drive: copy, then remove.
        fs::copy(&from, &target).map_err(|e| e.to_string())?;
        fs::remove_file(&from).map_err(|e| e.to_string())?;
    }
    Ok(target.to_string_lossy().into_owned())
}

/// The service reports its state: the tray's first line, tooltip and Start / Stop follow it.
#[tauri::command]
fn set_status(app: AppHandle, tray: State<'_, Tray>, text: String, running: bool) {
    let _ = tray.status.set_text(&text);
    let _ = tray.start.set_enabled(!running);
    let _ = tray.stop.set_enabled(running);
    if let Some(icon) = app.tray_by_id("main") {
        let _ = icon.set_tooltip(Some(format!("GLUE Home · {text}")));
    }
}

/// When the website here last read a song file (ADR 0138), ms.
#[tauri::command]
fn foreground_at() -> u64 {
    local::FOREGROUND_AT.load(std::sync::atomic::Ordering::Relaxed)
}

/// The local link's port (0 until it's listening).
#[tauri::command]
fn local_port() -> u16 {
    local::PORT.load(std::sync::atomic::Ordering::Relaxed)
}

#[tauri::command]
fn show_settings(app: AppHandle) {
    open_settings(&app);
}

#[tauri::command]
fn open_library(app: AppHandle) {
    open_glue(&app);
}

fn open_glue(app: &AppHandle) {
    let _ = app.opener().open_url(LIBRARY_URL, None::<&str>);
}

fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.unminimize();
        follow_windows(app);
        let _ = w.set_focus();
    }
}

/// macOS: GLUE Home is a menu-bar app, but while one of its windows is open it's a normal app, in the
/// Cmd-Tab switcher and the Dock (it went missing from Cmd-Tab, the user's list 2026-09-28).
#[cfg(target_os = "macos")]
pub(crate) fn follow_windows(app: &AppHandle) {
    let open = ["settings", "dock"].iter().any(|l| app.get_webview_window(l).and_then(|w| w.is_visible().ok()).unwrap_or(false));
    let _ = app.set_activation_policy(if open { tauri::ActivationPolicy::Regular } else { tauri::ActivationPolicy::Accessory });
}
#[cfg(not(target_os = "macos"))]
pub(crate) fn follow_windows(_app: &AppHandle) {}

fn main() {
    tauri::Builder::default()
        // A second launch (or a gluehome:// link) shows the running one's settings.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| open_settings(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--background"])))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Updates from the GitHub releases, signed with the project's key (ADR 0045).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Native file drags out of the drag dock (ADR 0054).
        .plugin(tauri_plugin_drag::init())
        // Reminders of events that need music (ADR 0074).
        .plugin(tauri_plugin_notification::init())
        .manage(Transfers::default())
        .invoke_handler(tauri::generate_handler![get_config, set_config, default_incoming, device_name, incoming_begin, incoming_write, incoming_end, set_status, show_settings, open_library, find_glue_folder, known_folders, path_exists, find_folder, find_file, glue_read, file_size, file_read, cache_read, cache_write, cache_list, incoming_list, incoming_move, local_port, foreground_at, glue_list, activity_now, web_get, lease_held, edits_waiting, rpc_reply, dock::dock_items, dock::dock_add, dock::dock_remove, dock::dock_clear, dock::drag_icon, dupes::default_duplicates, analysis::verify_song, analysis::analyse_song, analysis::analyse_incoming, analysis::cover_hash, analysis::cover_from_image, analysis::wave_from_details])
        .setup(|app| {
            // A menu-bar app on macOS: no Dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            #[cfg(windows)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            let status = MenuItem::with_id(app, "status", "Starting…", false, None::<&str>)?;
            let library = MenuItem::with_id(app, "library", "Open GLUE library", true, None::<&str>)?;
            let dock_item = MenuItem::with_id(app, "dock", "Drag dock", true, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "GLUE Home settings…", true, None::<&str>)?;
            let start = MenuItem::with_id(app, "start", "Start service", false, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop service", true, None::<&str>)?;
            let restart = MenuItem::with_id(app, "restart", "Restart service", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit GLUE Home", true, None::<&str>)?;
            let (s1, s2) = (PredefinedMenuItem::separator(app)?, PredefinedMenuItem::separator(app)?);
            let s3 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&status, &s1, &library, &dock_item, &open, &s3, &start, &stop, &restart, &s2, &quit])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .tooltip("GLUE Home")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "library" => open_glue(app),
                    "dock" => dock::show(app),
                    "open" => open_settings(app),
                    "start" | "stop" | "restart" => {
                        let _ = app.emit_to("service", "control", e.id().as_ref());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        // A click on the icon opens the library (right-click: the menu).
                        open_glue(tray.app_handle());
                    }
                })
                .build(app)?;
            app.manage(Tray { status, start, stop });
            // The website on this computer talks to GLUE Home directly (ADR 0048).
            activity::start();
            local::start(app.handle().clone());
            ws::start(app.handle().clone());
            // Started with the computer: stay in the tray. Opened by hand (or the first time): settings.
            if !std::env::args().any(|a| a == "--background") {
                open_settings(app.handle());
            }
            Ok(())
        })
        .on_window_event(|w, e| {
            // Closing the settings window hides it; the service keeps running in the tray.
            if let WindowEvent::CloseRequested { api, .. } = e {
                if w.label() == "settings" || w.label() == "dock" {
                    api.prevent_close();
                    let _ = w.hide();
                    follow_windows(w.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("GLUE Home couldn't start")
        .run(|_app, e| {
            // No windows shown isn't a reason to quit: only "Quit GLUE Home" is.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = e {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    // A file is matched against the folder it's written under first: no other folder looked up (ADR 0141).
    #[test]
    fn the_folder_a_file_is_under_comes_first() {
        let roots = vec![PathBuf::from(r"\nas\Archive"), PathBuf::from(r"F:\Music Collection"), PathBuf::from(r"F:\Music")];
        let order = roots_for(roots, r"f:\music\Song.wav");
        assert_eq!(order[0], PathBuf::from(r"F:\Music"));
        assert_eq!(order.len(), 3);
    }

    // A folder's name on the disk is looked up once, then remembered: gone a moment later, it's still the one known.
    #[test]
    fn a_folder_is_looked_up_once() {
        let dir = std::env::temp_dir().join(format!("glue-resolved-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let first = resolved(&dir);
        assert!(first.is_some());
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(resolved(&dir), first);
        assert_eq!(resolved(&dir.join("never-there")), None);
    }
}
