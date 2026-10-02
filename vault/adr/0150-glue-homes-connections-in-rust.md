---
status: accepted
date: 2026-10-02
---
# 0150. GLUE Home's connections to other devices are Rust's

## Context
ADR 0147 made GLUE Home's audio work native, and the user asked for streaming to be native too ("does that also have
JavaScript running on the Home app?"). Playing on the same computer already went through Rust (the local link's play
port, ADR 0141). But every other device's connection ran in GLUE Home's hidden service page:
- the WebView's RTCPeerConnection, for the phone, the laptop and the website's other tabs;
- a song's bytes went Rust → `file_read` (1–4 MB through Tauri) → JavaScript → 64 KB data-channel frames;
- songs sent to this computer went the other way, a message at a time through Tauri.

Measured on the laptop (Edge, the same machine, 64 KB frames): browser to browser 8.4 MB/s; webrtc-rs 0.21 to Edge
21–29 MB/s; Edge to webrtc-rs 30 MB/s.

## Decision
- **`crates/glue-rtc`** (no Tauri; the app is a `Host`): the peer connections and data channels with webrtc-rs 0.21
  (pure Rust, so no C++ build on CI), speaking the website's protocol byte for byte (src/core/transfer.ts). Its parts:
  - **'stream' channels:** the session's hello, pings, `put` uploads and `cache` files are answered in Rust, and a
    song's bytes (`get`, `range`, `get-incoming`) are read from disk in Rust as they're sent (each read marks the
    song as playing, so the analysis gives way, ADR 0138). Every other request goes to the app as `rtc-request`.
  - **other channels:** songs sent to this computer are written into the incoming folder in Rust (`.part`, then
    their name).
  - Messages up to 256 KB: RFC 8841's default of 64 KB would make a browser refuse the website's frames (64 KB and
    their request number).
- **The service page keeps** the signaling (one socket per device: a second one would replace the first), the
  sessions' rules (admission, the limit, Disconnect, the set-up and "disconnected" timers), and the library's
  answers. It calls `rtc_answer`, `rtc_ice`, `rtc_close`, `rtc_reply`, `rtc_send_file`, `rtc_error` and `rtc_tell`, and
  listens to `rtc-ice`, `rtc-state`, `rtc-request`, `rtc-receiving`, `rtc-received`, `rtc-served` and `rtc-activity`.
- **Held to the protocol:**
  - `crates/glue-rtc/tests/protocol.rs`: two peers, every request kind, a song in, a short one refused, the relay's
    servers;
  - `scripts/rtc-probe.mjs`: the same against Edge, through `examples/probe.rs`, in CI on Windows;
  - `e2e/home-rtc.ts`: the stand-in the e2e tests use, the same commands and events with the browser's
    RTCPeerConnection;
  - `tests/homeBundle.test.ts`: `home/ui` makes no WebRTC connection of its own.

## Alternatives considered
- **libdatachannel (`datachannel` crate)**: mature C++, but a CMake and OpenSSL build on Windows and macOS CI for
  little gain over the measured webrtc-rs.
- **The signaling in Rust too**: one less hop for each offer, but the queue of other room events (presence, shared
  changes, replaced) is the service page's, and a second socket per device would fight the first. Later, with the
  service page's removal.
- **All requests in Rust**: thumbnails, covers and the analysis state need the library's knowledge (where a song
  is, what's queued), which is JavaScript until the queue moves (ADR 0147's "later").

## Consequences
- No song byte crosses JavaScript in GLUE Home any more; the library's small answers (thumbnails, covers, JSON) still
  go through the service page.
- The website and the phone don't change: the same handshake and messages.
- Relayed connections (TURN) can only be proven from outside the home network: the iPhone on mobile data
  [UNVERIFIED until the user's hand test].
- GLUE Home's binary grows by about 5 MB (webrtc-rs), and CI builds it.
