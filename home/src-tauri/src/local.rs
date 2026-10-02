// The local link (ADR 0048): GLUE Home answers the GLUE website on the same computer directly, on
// http://127.0.0.1 (no GLUE Cloud in between): what's in the incoming folder, its songs (with byte
// ranges, so they play and seek at once), GLUE Home's cache of analyses, and moving songs into a
// music folder. Only the GLUE website's pages may read the answers (CORS), and every request but
// /hello carries the token GLUE Home gave that website.
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU16, AtomicU64, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};

use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

pub static PORT: AtomicU16 = AtomicU16::new(0);
/// The songs' own port (ADR 0141): the same link, for the songs the website plays only. A browser opens at most 6
/// connections to one address, and the page's other requests to GLUE Home share them: a song clicked mustn't wait
/// for one (the first song after opening GLUE took 34 s, 2026-10-02). 0 until it listens.
pub static PLAY_PORT: AtomicU16 = AtomicU16::new(0);
// GLUE Home's own service page too (it applies edits through the same file API when no GLUE tab is
// open, ADR 0087): Tauri's origin on Windows and on macOS, and the test server's.
const ORIGINS: [&str; 7] = ["https://joaopmanso.github.io", "http://localhost:5174", "http://localhost:5175", "http://localhost:5173", "http://tauri.localhost", "tauri://localhost", "http://localhost:5176"];

/// Stopped (Stop in the tray or the settings, `running: false`), the local link answers only GLUE Home's own
/// windows: a GLUE tab on this computer carries on in the browser, as if GLUE Home were quit (2026-10-01: Stop
/// only went offline for other devices, and the website kept using GLUE Home).
fn refused_while_stopped(cfg: Option<&serde_json::Value>, origin: Option<&str>) -> bool {
    let stopped = cfg.and_then(|c| c.get("running")).and_then(|v| v.as_bool()) == Some(false);
    stopped && !matches!(origin, Some("http://tauri.localhost") | Some("tauri://localhost"))
}

/// The writer lease (ADR 0051, 0087): when a GLUE tab in Home mode last said it's open (ms since 1970).
pub static LEASE_AT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// Bumped when another device says it sent edits: the tab takes them in at once.
pub static EDITS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// When a song was last read for playing (here, or streamed to a device): GLUE Home's analysis eases off, so the song
/// comes first (ADR 0138, 0140).
pub static FOREGROUND_AT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Who a file is read for (ADR 0140): a song played marks it as it's read; the analysis's own reads wait while one was
/// marked in the last 3 s. Its new songs not starting wasn't enough: the ones running read on, about 30 s each from the
/// user's NAS, and the first song played took about as long to start (2026-10-02).
#[derive(Clone, Copy, PartialEq, Debug)]
pub(crate) enum Pri { Play, Analysis }
pub(crate) fn mark_playing() { FOREGROUND_AT.store(now_ms(), Ordering::Relaxed); }
pub(crate) fn playing_now() -> bool { now_ms().saturating_sub(FOREGROUND_AT.load(Ordering::Relaxed)) < 3000 }

/// A reader that marks playing, or waits while something plays (2 minutes at most: never stuck).
pub(crate) struct Paced<R> { pub inner: R, pub pri: Pri, pub busy: fn() -> bool }
impl<R: Read> Read for Paced<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self.pri {
            Pri::Play => mark_playing(),
            Pri::Analysis => {
                let t0 = std::time::Instant::now();
                while (self.busy)() && t0.elapsed() < std::time::Duration::from_secs(120) {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }
        }
        self.inner.read(buf)
    }
}
/// Requests to the library engine in the service page (ADR 0104): each waits here for its answer.
static RPC_NEXT: AtomicU64 = AtomicU64::new(0);
fn rpc_waiting() -> &'static Mutex<HashMap<u64, mpsc::Sender<String>>> {
    static WAITING: OnceLock<Mutex<HashMap<u64, mpsc::Sender<String>>>> = OnceLock::new();
    WAITING.get_or_init(|| Mutex::new(HashMap::new()))
}
/// The service page's answer to request `id` (the rpc_reply command).
pub fn rpc_done(id: u64, body: String) {
    let tx = rpc_waiting().lock().ok().and_then(|mut m| m.remove(&id));
    if let Some(tx) = tx {
        let _ = tx.send(body);
    }
}
/// The routes that change files: not for a read-only token (ADR 0104).
const WRITES: [&str; 6] = ["/fs/write", "/fs/mkdir", "/fs/remove", "/fs/tags", "/fs/dupes", "/incoming/move"];

pub fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }
/// A GLUE tab holds the lease (renewed every 5 s; it lapses after 15).
pub fn leased() -> bool { now_ms().saturating_sub(LEASE_AT.load(Ordering::Relaxed)) < 15_000 }

/// A GLUE website (or GLUE Home's own windows, or a test server): the origins the local link answers.
pub(crate) fn origin_ok(o: &str) -> bool { ORIGINS.contains(&o) }

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let Some((server, port)) = (47400..47410).find_map(|p| Server::http(("127.0.0.1", p)).ok().map(|s| (s, p))) else { return };
        PORT.store(port, Ordering::Relaxed);
        if let Ok(play) = Server::http(("127.0.0.1", 0)) {
            if let Some(p) = play.server_addr().to_ip().map(|a| a.port()) {
                PLAY_PORT.store(p, Ordering::Relaxed);
            }
            let app = app.clone();
            std::thread::spawn(move || serve(app, play));
        }
        serve(app, server);
    });
}

fn serve(app: AppHandle, server: Server) {
    for req in server.incoming_requests() {
        let app = app.clone();
        std::thread::spawn(move || handle(app, req));
    }
}

pub(crate) fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap()
}

fn query(url: &str) -> Vec<(String, String)> {
    let q = url.split_once('?').map(|x| x.1).unwrap_or("");
    q.split('&').filter(|s| !s.is_empty()).map(|kv| {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        (decode(k), decode(v))
    }).collect()
}

fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => {
                if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(v);
                    i += 2;
                } else {
                    out.push(b'%');
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub(crate) fn type_of(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "aif" | "aiff" => "audio/aiff",
        "m4a" | "mp4" | "alac" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" | "opus" => "audio/ogg",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
}

/// Each request, counted by its first two path parts ("/fs/file"), with the time it took (ADR 0083).
fn handle(app: AppHandle, req: Request) {
    let t0 = std::time::Instant::now();
    let what = "local ".to_string() + &req.url().split('?').next().unwrap_or("").split('/').take(3).collect::<Vec<_>>().join("/");
    answer(app, req);
    crate::activity::note(&what, t0, 0);
}

fn answer(app: AppHandle, req: Request) {
    let origin = req.headers().iter().find(|h| h.field.equiv("Origin")).map(|h| h.value.as_str().to_string());
    let mut cors = vec![header("Vary", "Origin"), header("Access-Control-Allow-Private-Network", "true"), header("Access-Control-Allow-Headers", "x-glue-token, range, content-type"),
        header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"), header("Access-Control-Expose-Headers", "content-range, content-length, accept-ranges, x-glue-name, x-glue-mtime")];
    if let Some(o) = origin.as_deref() {
        if ORIGINS.contains(&o) {
            cors.push(header("Access-Control-Allow-Origin", o));
        }
    }
    let reply = |req: Request, code: u16, body: Vec<u8>, ctype: &str| respond(req, code, body, ctype, &cors);
    if req.method() == &Method::Options {
        return reply(req, 204, vec![], "text/plain");
    }
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("").to_string();
    let q = query(&url);
    let arg = |k: &str| q.iter().find(|(a, _)| a == k).map(|(_, v)| v.clone()).unwrap_or_default();
    let cfg = crate::get_config_impl(app.clone());
    let s = |key: &str| cfg.as_ref().and_then(|c| c.get(key)).and_then(|v| v.as_str()).unwrap_or("").to_string();
    if refused_while_stopped(cfg.as_ref(), origin.as_deref()) {
        return reply(req, 503, b"{\"error\":\"GLUE Home is stopped\"}".to_vec(), "application/json");
    }
    if path == "/hello" {
        let body = serde_json::json!({ "app": "glue-home", "version": app.package_info().version.to_string(), "device": s("deviceId"), "wsPort": crate::ws::WS_PORT.load(Ordering::Relaxed), "playPort": PLAY_PORT.load(Ordering::Relaxed) });
        return reply(req, 200, body.to_string().into_bytes(), "application/json");
    }
    // A GLUE page in any browser on this computer takes the link (ADR 0115): being the GLUE website (its origin,
    // which a web page can't fake) on this computer (127.0.0.1) is the proof. No account channel, no sign-in:
    // every browser here is the same GLUE, GLUE Home's. (A program on this computer could fake the origin, but it
    // can read the token from GLUE Home's settings file anyway.)
    // Only the live website, in a release: pages on localhost (a test run, another project's dev server) never
    // get the token of the GLUE Home that holds the user's real library.
    if path == "/connect" {
        let token = s("localToken");
        let site = |o: &str| o == ORIGINS[0] || (cfg!(debug_assertions) && ORIGINS.contains(&o));
        if !origin.as_deref().map(site).unwrap_or(false) || token.is_empty() {
            return reply(req, 403, b"{\"error\":\"not allowed\"}".to_vec(), "application/json");
        }
        let body = serde_json::json!({ "home": s("deviceId"), "port": PORT.load(Ordering::Relaxed), "wsPort": crate::ws::WS_PORT.load(Ordering::Relaxed), "playPort": PLAY_PORT.load(Ordering::Relaxed), "token": token, "version": app.package_info().version.to_string() });
        return reply(req, 200, body.to_string().into_bytes(), "application/json");
    }
    // Everything else: the token GLUE Home gave the website (a header, or ?t= for <audio src>). The full one
    // (GLUE Home's own service page, and websites until they use the engine), or the read-only one: a GLUE
    // tab while GLUE Home is the library's engine (ADR 0104) reads, and asks the engine for every change.
    let token = req.headers().iter().find(|h| h.field.equiv("x-glue-token")).map(|h| h.value.as_str().to_string()).unwrap_or_else(|| arg("t"));
    let want = s("localToken");
    let read = s("readToken");
    let full = !want.is_empty() && token == want;
    let reading = !full && !read.is_empty() && token == read;
    if !full && !reading {
        return reply(req, 401, b"{\"error\":\"not allowed\"}".to_vec(), "application/json");
    }
    if reading && WRITES.contains(&path.as_str()) {
        return reply(req, 403, b"{\"error\":\"read only: GLUE Home changes the library (ask its engine)\"}".to_vec(), "application/json");
    }
    match path.as_str() {
        // A GLUE tab in Home mode is open: it writes the library (ADR 0087); and edits wait, if any.
        "/lease" if req.method() == &Method::Post => {
            // `release`: the tab lets go at once (GLUE Home's engine writes now, ADR 0104).
            LEASE_AT.store(if arg("release") == "1" { 0 } else { now_ms() }, Ordering::Relaxed);
            reply(req, 200, serde_json::json!({ "edits": EDITS.load(Ordering::Relaxed) }).to_string().into_bytes(), "application/json")
        }
        // A request to the library engine (ADR 0104): handed to the service page, answered when it has.
        "/rpc" if req.method() == &Method::Post => {
            let mut req = req;
            let mut body = String::new();
            let read_ok = {
                let mut r = std::io::Read::take(req.as_reader(), 64 << 20);
                std::io::Read::read_to_string(&mut r, &mut body).is_ok()
            };
            if !read_ok {
                return reply(req, 400, b"{\"error\":\"bad request\"}".to_vec(), "application/json");
            }
            let id = RPC_NEXT.fetch_add(1, Ordering::Relaxed) + 1;
            let (tx, rx) = mpsc::channel();
            if let Ok(mut m) = rpc_waiting().lock() {
                m.insert(id, tx);
            }
            let msg = serde_json::json!({ "id": id, "body": body, "read": reading });
            if app.emit_to("service", "rpc", msg).is_err() {
                if let Ok(mut m) = rpc_waiting().lock() { m.remove(&id); }
                return reply(req, 503, b"{\"error\":\"GLUE Home's service isn't running\"}".to_vec(), "application/json");
            }
            match rx.recv_timeout(std::time::Duration::from_secs(90)) {
                Ok(answer) => reply(req, 200, answer.into_bytes(), "application/json"),
                Err(_) => {
                    if let Ok(mut m) = rpc_waiting().lock() { m.remove(&id); }
                    reply(req, 504, b"{\"error\":\"GLUE Home didn't answer in time\"}".to_vec(), "application/json")
                }
            }
        }
        // A browser on this computer asks to join it (ADR 0091): only a page on this computer can reach this
        // address, which is the proof. The service page tells GLUE Cloud (with GLUE Home's own credential).
        "/attach" if req.method() == &Method::Post => {
            let mut body = String::new();
            let mut req = req;
            let _ = std::io::Read::read_to_string(req.as_reader(), &mut body);
            let _ = app.emit_to("service", "attach", body);
            reply(req, 202, b"{}".to_vec(), "application/json")
        }
        // The drag dock (ADR 0054): what's selected on the website, to drag into the DJ apps.
        "/dock" if req.method() == &Method::Post => {
            let mut body = String::new();
            let mut req = req;
            let _ = std::io::Read::read_to_string(req.as_reader(), &mut body);
            match crate::dock::set(&app, &body) {
                Ok(n) => reply(req, 200, serde_json::json!({ "songs": n }).to_string().into_bytes(), "application/json"),
                Err(e) => reply(req, 400, serde_json::json!({ "error": e }).to_string().into_bytes(), "application/json"),
            }
        }
        // Songs dragged out of the website's window, let go at a point on the screen (ADR 0061).
        "/dock/drop" if req.method() == &Method::Post => {
            let mut body = String::new();
            let mut req = req;
            let _ = std::io::Read::read_to_string(req.as_reader(), &mut body);
            match crate::dock::drop_at(&app, &body) {
                Ok(Some(n)) => reply(req, 200, serde_json::json!({ "on": true, "songs": n }).to_string().into_bytes(), "application/json"),
                Ok(None) => reply(req, 200, serde_json::json!({ "on": false }).to_string().into_bytes(), "application/json"),
                Err(e) => reply(req, 400, serde_json::json!({ "error": e }).to_string().into_bytes(), "application/json"),
            }
        }
        "/dock/show" if req.method() == &Method::Post => { crate::dock::show(&app); reply(req, 200, b"{}".to_vec(), "application/json") }
        "/dock" if req.method() == &Method::Get => reply(req, 200, crate::dock::current().to_string().into_bytes(), "application/json"),
        "/dock/clear" if req.method() == &Method::Post => { crate::dock::clear(&app); reply(req, 200, b"{}".to_vec(), "application/json") }
        // A song read whole for GLUE Home's own analysis (ADR 0138): any file GLUE Home may read (as its file_read), in one
        // request from one open file, for its own windows with the full token only. Through Tauri's messages, 4 MB at a
        // time, it came at about 10 MB/s in all from a NAS that gives 47 to 74 (2026-10-01).
        "/home/file" if full && matches!(origin.as_deref(), Some("http://tauri.localhost") | Some("tauri://localhost")) => {
            match crate::allowed(&app, &arg("path")) {
                Ok(p) if p.is_file() => send_file(req, &p, "application/octet-stream", cors, Pri::Analysis),
                Ok(_) => reply(req, 404, b"{\"error\":\"not a file\"}".to_vec(), "application/json"),
                Err(e) => reply(req, 403, serde_json::json!({ "error": e }).to_string().into_bytes(), "application/json"),
            }
        }
        // The website's files, through GLUE Home (ADR 0051). A song file read: the analysis lets it go first (ADR 0138).
        p if p.starts_with("/fs/") => { if p == "/fs/file" { FOREGROUND_AT.store(now_ms(), Ordering::Relaxed); } crate::disk::handle(app.clone(), req, p, &arg, cors) }
        "/incoming" => {
            let list: Vec<serde_json::Value> = crate::incoming_list_impl(app.clone()).into_iter().map(|mut f| {
                // With the analysis GLUE Home made when the song arrived, if it's done.
                let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                if let Ok(p) = crate::cache_path(&app, &format!("i/{name}.summary.json")) {
                    if let Ok(t) = std::fs::read_to_string(p) {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
                            f["summary"] = v;
                        }
                    }
                }
                f
            }).collect();
            reply(req, 200, serde_json::to_vec(&list).unwrap_or_default(), "application/json")
        }
        "/incoming/file" => {
            let name = crate::safe_name(&arg("name"));
            let p = crate::incoming_dir(&app).join(&name);
            send_file(req, &p, type_of(&name), cors, Pri::Play)
        }
        "/cache" => match crate::cache_path(&app, &arg("key")).ok().and_then(|p| std::fs::read(p).ok()) {
            Some(b) => reply(req, 200, b, "application/octet-stream"),
            None => reply(req, 404, b"{\"error\":\"not there\"}".to_vec(), "application/json"),
        },
        // The music folders GLUE Home found (songs can be moved there): id, the folder's name, where it is.
        "/folders" => {
            let list: Vec<serde_json::Value> = cfg.as_ref().and_then(|c| c.get("folders")).and_then(|f| f.as_object()).map(|m| m.iter().filter_map(|(id, v)| {
                let p = v.as_str()?;
                let name = std::path::Path::new(p).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| p.to_string());
                Some(serde_json::json!({ "id": id, "name": name, "collection": p }))
            }).collect()).unwrap_or_default();
            reply(req, 200, serde_json::to_vec(&list).unwrap_or_default(), "application/json")
        }
        "/incoming/move" if req.method() == &Method::Post => {
            let to = cfg.as_ref().and_then(|c| c.get("folders")).and_then(|f| f.get(arg("folder"))).and_then(|v| v.as_str()).map(|v| v.to_string());
            match to.map(|to| crate::incoming_move_impl(app.clone(), arg("name"), to)) {
                Some(Ok(p)) => reply(req, 200, serde_json::json!({ "path": p }).to_string().into_bytes(), "application/json"),
                Some(Err(e)) => reply(req, 400, serde_json::json!({ "error": e }).to_string().into_bytes(), "application/json"),
                None => reply(req, 400, b"{\"error\":\"GLUE Home doesn't know that music folder\"}".to_vec(), "application/json"),
            }
        }
        _ => reply(req, 404, b"{\"error\":\"not found\"}".to_vec(), "application/json"),
    }
}

/// An answer with the CORS headers.
pub(crate) fn respond(req: Request, code: u16, body: Vec<u8>, ctype: &str, cors: &[Header]) {
    let mut r = Response::from_data(body).with_status_code(StatusCode(code)).with_header(header("Content-Type", ctype));
    for h in cors.iter().cloned() {
        r.add_header(h);
    }
    let _ = req.respond(r);
}

/// A file, whole or the byte range asked for (so the browser's <audio> plays and seeks at once).
pub(crate) fn send_file(req: Request, path: &std::path::Path, ctype: &str, cors: Vec<Header>, pri: Pri) {
    let Ok(mut f) = File::open(path) else {
        let mut r = Response::from_data(b"{\"error\":\"not there\"}".to_vec()).with_status_code(StatusCode(404));
        for h in cors {
            r.add_header(h);
        }
        let _ = req.respond(r);
        return;
    };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let range = req.headers().iter().find(|h| h.field.equiv("Range")).map(|h| h.value.as_str().to_string());
    let (mut start, mut end, mut partial) = (0u64, len.saturating_sub(1), false);
    if let Some(r) = range.as_deref().and_then(|r| r.strip_prefix("bytes=")) {
        let (a, b) = r.split_once('-').unwrap_or((r, ""));
        if let Ok(a) = a.parse::<u64>() {
            start = a.min(len.saturating_sub(1));
            if let Ok(b) = b.parse::<u64>() {
                end = b.min(len.saturating_sub(1));
            }
            partial = true;
        } else if let Ok(n) = b.parse::<u64>() {
            start = len.saturating_sub(n);
            partial = true;
        }
    }
    let count = if len == 0 { 0 } else { end.saturating_sub(start) + 1 };
    let _ = f.seek(SeekFrom::Start(start));
    // Read in 1 MB steps: a network folder gives far more for big reads than for the server's small ones (ADR 0138).
    let mut r = Response::new(StatusCode(if partial { 206 } else { 200 }), vec![], Paced { inner: std::io::BufReader::with_capacity(1 << 20, f).take(count), pri, busy: playing_now }, Some(count as usize), None);
    r.add_header(header("Content-Type", ctype));
    r.add_header(header("Accept-Ranges", "bytes"));
    if partial {
        r.add_header(header("Content-Range", &format!("bytes {start}-{end}/{len}")));
    }
    for h in cors {
        r.add_header(h);
    }
    let _ = req.respond(r);
}

#[cfg(test)]
mod tests {
    // A song played goes first (ADR 0140): the analysis's reads wait while one was read for playing.
    static BUSY_UNTIL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    fn busy_for_test() -> bool { now_ms() < BUSY_UNTIL.load(std::sync::atomic::Ordering::Relaxed) }

    #[test]
    fn an_analysis_read_waits_while_a_song_plays_then_goes_on() {
        BUSY_UNTIL.store(now_ms() + 400, std::sync::atomic::Ordering::Relaxed);
        let mut r = Paced { inner: &b"abc"[..], pri: Pri::Analysis, busy: busy_for_test };
        let t0 = std::time::Instant::now();
        let mut s = String::new();
        r.read_to_string(&mut s).unwrap();
        assert_eq!(s, "abc");
        assert!(t0.elapsed() >= std::time::Duration::from_millis(300));
    }

    #[test]
    fn a_song_read_for_playing_says_so() {
        let mut r = Paced { inner: &b"x"[..], pri: Pri::Play, busy: busy_for_test };
        let mut v = vec![];
        r.read_to_end(&mut v).unwrap();
        assert!(playing_now());
    }
    use super::{now_ms, playing_now, refused_while_stopped, Paced, Pri};
    use std::io::Read;

    #[test]
    fn stopped_answers_only_glue_homes_own_windows() {
        let stopped = serde_json::json!({ "running": false });
        let running = serde_json::json!({ "running": true });
        let never = serde_json::json!({});
        assert!(refused_while_stopped(Some(&stopped), Some("https://joaopmanso.github.io")));
        assert!(refused_while_stopped(Some(&stopped), None));   // <audio src>: no Origin
        assert!(!refused_while_stopped(Some(&stopped), Some("http://tauri.localhost")));
        assert!(!refused_while_stopped(Some(&stopped), Some("tauri://localhost")));
        assert!(!refused_while_stopped(Some(&running), Some("https://joaopmanso.github.io")));
        assert!(!refused_while_stopped(Some(&never), Some("https://joaopmanso.github.io")));
        assert!(!refused_while_stopped(None, None));
    }
}
