// The local link (ADR 0048): GLUE Home answers the GLUE website on the same computer directly, on
// http://127.0.0.1 (no GLUE Cloud in between): what's in the incoming folder, its songs (with byte
// ranges, so they play and seek at once), GLUE Home's cache of analyses, and moving songs into a
// music folder. Only the GLUE website's pages may read the answers (CORS), and every request but
// /hello carries the token GLUE Home gave that website.
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicU16, Ordering};

use tauri::AppHandle;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

pub static PORT: AtomicU16 = AtomicU16::new(0);
const ORIGINS: [&str; 4] = ["https://joaopmanso.github.io", "http://localhost:5174", "http://localhost:5175", "http://localhost:5173"];

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let Some((server, port)) = (47400..47410).find_map(|p| Server::http(("127.0.0.1", p)).ok().map(|s| (s, p))) else { return };
        PORT.store(port, Ordering::Relaxed);
        for req in server.incoming_requests() {
            let app = app.clone();
            std::thread::spawn(move || handle(app, req));
        }
    });
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

fn handle(app: AppHandle, req: Request) {
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
    if path == "/hello" {
        let body = serde_json::json!({ "app": "glue-home", "version": app.package_info().version.to_string(), "device": s("deviceId") });
        return reply(req, 200, body.to_string().into_bytes(), "application/json");
    }
    // Everything else: the token GLUE Home gave the website (a header, or ?t= for <audio src>).
    let token = req.headers().iter().find(|h| h.field.equiv("x-glue-token")).map(|h| h.value.as_str().to_string()).unwrap_or_else(|| arg("t"));
    let want = s("localToken");
    if want.is_empty() || token != want {
        return reply(req, 401, b"{\"error\":\"not allowed\"}".to_vec(), "application/json");
    }
    match path.as_str() {
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
        "/dock/show" if req.method() == &Method::Post => { crate::dock::show(&app); reply(req, 200, b"{}".to_vec(), "application/json") }
        "/dock" if req.method() == &Method::Get => reply(req, 200, crate::dock::current().to_string().into_bytes(), "application/json"),
        "/dock/clear" if req.method() == &Method::Post => { crate::dock::clear(&app); reply(req, 200, b"{}".to_vec(), "application/json") }
        // The website's files, through GLUE Home (ADR 0051).
        p if p.starts_with("/fs/") => crate::disk::handle(app.clone(), req, p, &arg, cors),
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
            send_file(req, &p, type_of(&name), cors)
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
pub(crate) fn send_file(req: Request, path: &std::path::Path, ctype: &str, cors: Vec<Header>) {
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
    let mut r = Response::new(StatusCode(if partial { 206 } else { 200 }), vec![], f.take(count), Some(count as usize), None);
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
