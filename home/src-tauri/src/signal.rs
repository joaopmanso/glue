//! The account's signaling room's socket (ADR 0036, 0158): `wss://…/v1/signal`, a WebSocket over TLS, for the engine's
//! room (crates/glue-engine/src/room.rs), which reads it with short waits between its other work.
use glue_engine::room::{Received, Socket};
use std::net::TcpStream;
use std::time::Duration;
use tungstenite::protocol::frame::coding::CloseCode;
use tungstenite::protocol::CloseFrame;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

struct Room(WebSocket<MaybeTlsStream<TcpStream>>);

fn tcp(ws: &WebSocket<MaybeTlsStream<TcpStream>>) -> Option<&TcpStream> {
  match ws.get_ref() {
    MaybeTlsStream::Plain(s) => Some(s),
    MaybeTlsStream::Rustls(s) => Some(s.get_ref()),
    _ => None,
  }
}

impl Socket for Room {
  fn send(&mut self, text: &str) -> Result<(), String> { self.0.send(Message::text(text)).map_err(|e| e.to_string()) }
  fn recv(&mut self, wait: Duration) -> Received {
    if let Some(s) = tcp(&self.0) { let _ = s.set_read_timeout(Some(wait.max(Duration::from_millis(1)))); }
    match self.0.read() {
      Ok(Message::Text(t)) => Received::Text(t.to_string()),
      Ok(Message::Close(f)) => Received::Closed(f.map(|f| u16::from(f.code)).unwrap_or(1005)),
      Ok(_) => Received::Nothing,
      // Nothing yet: tungstenite keeps what part of a message came, for the next read.
      Err(tungstenite::Error::Io(e)) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => Received::Nothing,
      Err(_) => Received::Closed(1006),
    }
  }
  fn close(&mut self, code: u16) {
    let _ = self.0.close(Some(CloseFrame { code: CloseCode::from(code), reason: "".into() }));
    let _ = self.0.flush();
  }
}

/// Connected (15 s at most to reach GLUE Cloud), or why not.
pub fn open(url: &str) -> Result<Box<dyn Socket>, String> {
  let u = tungstenite::http::Uri::try_from(url).map_err(|e| e.to_string())?;
  let host = u.host().ok_or("no host")?.to_string();
  let port = u.port_u16().unwrap_or(if u.scheme_str() == Some("wss") { 443 } else { 80 });
  let addr = std::net::ToSocketAddrs::to_socket_addrs(&(host.as_str(), port)).map_err(|e| e.to_string())?.next().ok_or("no address")?;
  let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(15)).map_err(|e| e.to_string())?;
  let _ = tcp.set_read_timeout(Some(Duration::from_secs(15)));
  let _ = tcp.set_nodelay(true);
  let (ws, _) = tungstenite::client_tls(url, tcp).map_err(|e| e.to_string())?;
  Ok(Box::new(Room(ws)))
}

#[cfg(test)]
mod tests {
  /// GLUE Cloud reached over TLS: a token it doesn't know is refused at the handshake (the network: `--ignored`).
  #[test]
  #[ignore]
  fn reaches_glue_cloud_over_tls() {
    let r = super::open(&format!("{}/v1/signal?token=nope", glue_engine::room::API.replacen("http", "ws", 1)));
    let e = r.err().expect("refused");
    assert!(e.contains("401") || e.contains("403"), "{e}");
  }
}
