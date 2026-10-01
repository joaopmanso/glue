// A socket for the website's background loads from GLUE Home (ADR 0139): the rows' spectrograms and waveforms, a
// song's details, the analyses' results. Thousands of them, loaded and dropped as the list scrolls. Over HTTP they
// took the browser's 6 connections to 127.0.0.1, and a song clicked waited behind them (2026-10-01). Here they share
// one connection, as many at once as wanted, each numbered and cancellable; HTTP stays for playing and the rest.
//
// A connection: the GLUE website (its origin) with GLUE Home's token, as the local link asks. Requests are text:
//   {"n": 7, "op": "cache", "key": "w/<profile>/<collection>/<shard>/<id>.bin"}   one of GLUE Home's cache files
//   {"n": 7, "op": "cancel"}                                                        not wanted any more
// Answers are binary: the request's number (4 bytes, big-endian), 0 found or 1 not there (1 byte), the bytes.
use std::collections::HashSet;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use tauri::AppHandle;
use tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tungstenite::Message;

/// The socket's port (0 until it listens), told to the website with the local link's (`/connect`, `/hello`).
pub static WS_PORT: AtomicU16 = AtomicU16::new(0);
/// Cache files read at once for one connection.
const READERS: usize = 6;

pub fn start(app: AppHandle) {
    let Ok(listener) = TcpListener::bind("127.0.0.1:0") else { return };
    if let Ok(a) = listener.local_addr() {
        WS_PORT.store(a.port(), Ordering::Relaxed);
    }
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let (a, b) = (app.clone(), app.clone());
            let read: Reader = Arc::new(move |key: &str| crate::cache_path(&b, key).ok().and_then(|p| std::fs::read(p).ok()));
            std::thread::spawn(move || serve(stream, move |req| allowed(&a, req), read));
        }
    });
}

/// The GLUE website's origin and a token GLUE Home gave it (full or read-only).
fn allowed(app: &AppHandle, req: &Request) -> bool {
    let origin = req.headers().get("Origin").and_then(|v| v.to_str().ok()).unwrap_or("");
    if !crate::local::origin_ok(origin) {
        return false;
    }
    let token = req.uri().query().unwrap_or("").split('&').find_map(|kv| kv.strip_prefix("t=")).unwrap_or("");
    let cfg = crate::get_config_impl(app.clone());
    let s = |k: &str| cfg.as_ref().and_then(|c| c.get(k)).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let (full, read) = (s("localToken"), s("readToken"));
    !token.is_empty() && ((!full.is_empty() && token == full) || (!read.is_empty() && token == read))
}

/// How a cache file is read (GLUE Home's cache; a test's own).
pub(crate) type Reader = Arc<dyn Fn(&str) -> Option<Vec<u8>> + Send + Sync>;

/// One connection: the handshake (`allow` says who may), then requests answered by `read`, `READERS` at a time.
pub(crate) fn serve(stream: TcpStream, allow: impl Fn(&Request) -> bool, read: Reader) {
    let callback = move |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
        if allow(req) { Ok(resp) } else {
            let mut e = ErrorResponse::new(Some("not allowed".into()));
            *e.status_mut() = tungstenite::http::StatusCode::UNAUTHORIZED;
            Err(e)
        }
    };
    let Ok(mut ws) = tungstenite::accept_hdr(stream, callback) else { return };
    // Reads wait a moment at most, so answers go out in between (one thread owns the socket).
    let _ = ws.get_ref().set_read_timeout(Some(Duration::from_millis(15)));
    let (jobs_tx, jobs_rx) = mpsc::channel::<(u32, String)>();
    let (out_tx, out_rx) = mpsc::channel::<(u32, Option<Vec<u8>>)>();
    let jobs_rx = Arc::new(Mutex::new(jobs_rx));
    let cancelled = Arc::new(Mutex::new(HashSet::<u32>::new()));
    for _ in 0..READERS {
        let (rx, out, cancelled, read) = (jobs_rx.clone(), out_tx.clone(), cancelled.clone(), read.clone());
        std::thread::spawn(move || loop {
            let Ok((n, key)) = rx.lock().unwrap().recv() else { break };
            if cancelled.lock().unwrap().remove(&n) {
                continue;
            }
            let bytes = read(&key);
            if out.send((n, bytes)).is_err() {
                break;
            }
        });
    }
    drop(out_tx);
    'conn: loop {
        match ws.read() {
            Ok(Message::Text(t)) => {
                let Ok(v) = serde_json::from_str::<serde_json::Value>(t.as_str()) else { continue };
                let n = v.get("n").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                match v.get("op").and_then(|x| x.as_str()) {
                    Some("cache") => { let _ = jobs_tx.send((n, v.get("key").and_then(|x| x.as_str()).unwrap_or("").to_string())); }
                    Some("cancel") => { cancelled.lock().unwrap().insert(n); }
                    _ => {}
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e)) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(_) => break,
        }
        while let Ok((n, bytes)) = out_rx.try_recv() {
            // An answer to a request cancelled while it was read: not sent.
            if cancelled.lock().unwrap().remove(&n) {
                continue;
            }
            let mut frame = Vec::with_capacity(5 + bytes.as_ref().map(|b| b.len()).unwrap_or(0));
            frame.extend_from_slice(&n.to_be_bytes());
            frame.push(if bytes.is_some() { 0 } else { 1 });
            if let Some(b) = bytes {
                frame.extend_from_slice(&b);
            }
            if ws.send(Message::Binary(frame.into())).is_err() {
                break 'conn;
            }
        }
    }
    drop(jobs_tx);   // the readers end
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A socket server like GLUE Home's, its cache two files, the token "ok".
    fn server() -> u16 {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || for s in l.incoming().flatten() {
            let read: Reader = Arc::new(|k: &str| match k { "a" => Some(b"AA".to_vec()), "slow" => { std::thread::sleep(Duration::from_millis(300)); Some(b"S".to_vec()) } _ => None });
            std::thread::spawn(move || serve(s, |r| r.uri().query() == Some("t=ok"), read));
        });
        port
    }
    fn client(port: u16, token: &str) -> Result<tungstenite::WebSocket<TcpStream>, ()> {
        let s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        tungstenite::client(format!("ws://127.0.0.1:{port}/?t={token}"), s).map(|(ws, _)| ws).map_err(|_| ())
    }
    fn answer(ws: &mut tungstenite::WebSocket<TcpStream>) -> (u32, u8, Vec<u8>) {
        loop {
            if let Message::Binary(b) = ws.read().unwrap() { return (u32::from_be_bytes([b[0], b[1], b[2], b[3]]), b[4], b[5..].to_vec()); }
        }
    }

    #[test]
    fn answers_by_number_and_says_what_isnt_there() {
        let mut ws = client(server(), "ok").unwrap();
        ws.send(Message::Text(r#"{"n":7,"op":"cache","key":"a"}"#.into())).unwrap();
        assert_eq!(answer(&mut ws), (7, 0, b"AA".to_vec()));
        ws.send(Message::Text(r#"{"n":8,"op":"cache","key":"nope"}"#.into())).unwrap();
        assert_eq!(answer(&mut ws), (8, 1, vec![]));
    }

    #[test]
    fn a_cancelled_request_isnt_answered() {
        let mut ws = client(server(), "ok").unwrap();
        ws.send(Message::Text(r#"{"n":1,"op":"cache","key":"slow"}"#.into())).unwrap();
        ws.send(Message::Text(r#"{"n":1,"op":"cancel"}"#.into())).unwrap();
        ws.send(Message::Text(r#"{"n":2,"op":"cache","key":"a"}"#.into())).unwrap();
        assert_eq!(answer(&mut ws).0, 2);
        // The slow one, read meanwhile, never comes.
        let _ = ws.get_ref().set_read_timeout(Some(Duration::from_millis(600)));
        assert!(ws.read().is_err());
    }

    #[test]
    fn without_the_token_no_socket() {
        assert!(client(server(), "wrong").is_err());
    }
}
