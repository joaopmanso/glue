---
status: accepted
date: 2026-10-06
---
# 0158. GLUE Home's signaling room and sessions in Rust

## Context
The plan's E4b, step 2 (after the answers, ADR 0156). GLUE Home's hidden service page still held everything that
connects it to the account's other devices except the connections themselves:
- the signaling room (`home/ui/cloud.ts` `stayOnline`: an access token for GLUE Home's credential, the WebSocket to
  GLUE Cloud's `/v1/signal`, a ping every 30 s, a new token at 50 minutes, backoff, the close codes);
- the offers: the session rules (`sessions.ts`: one per device's tab, "Most at once", Disconnect refusing for an
  hour), ICE servers (`ice.ts`), candidates relayed both ways (those before the answer held), connections let go
  when not open in 30 s or disconnected for 15 s, a `bye` with why;
- what's told to every session (`made`, `incoming`), songs received (analysed, listed in the settings);
- which computer this is (`identity.ts`, ADR 0108) and a browser here attaching (the local link's `/attach`).

## Decision
- **The engine holds the room** (`crates/glue-engine/src/room.rs`), as `stayOnline` and service.ts did:
  - the host gives a `Socket` (`Host::open_socket`: GLUE Home's is tungstenite over TLS, `home/src-tauri/src/signal.rs`,
    read with short waits between the room's other work) and an access token (`Host::access_token`, kept 40
    minutes as before);
  - offers are answered through a `Peers` trait (`Host::peers`: GLUE Home's is glue-rtc's server, `rtc::Conns`); the
    connections' events (candidates, states, activity, songs received) reach the engine on one thread of their own,
    in order, outside the connections' runtime;
  - the room's state and the sessions go to GLUE Home's window (`Host::room_changed`, `engine-room`);
  - a `shared` message starts a sync (`sync_soon`), as the service page's did.
- **The session rules and ICE** are `sessions.rs` (`admit`, `max_of`, `session_key`, with sessions.ts's tests) and
  `ice.rs` (src/core/ice.ts: cached until an hour before the credentials end, public servers when GLUE Cloud can't be
  reached).
- **Identity** is `identity.rs` (`computers_here`, `who_am_i`, `learn_computer`, `attach`). One change from the
  TypeScript: any error asking `/v1/computer` changes nothing. In TypeScript, a failed access token threw (nothing
  changed), but GLUE Cloud answering `/v1/computer` with an error read as "no companion", which could clear the
  computer; GLUE Cloud's "no companion" is an answer (`{computer: null}`), not an error.
- **Songs received** are analysed by the engine (`analyse_incoming`, `analyse_waiting` for those that arrived while
  GLUE Home was off), listed in the settings and told to every session; GLUE Home's own command is gone.
- **The room doesn't need a GLUE folder:** without one chosen, GLUE Home's engine runs over an empty folder of its own
  (`no-glue-folder` in its app data), so it's online and takes songs sent to it, as before. A tab's requests and the
  library's answers still refuse ("No GLUE folder chosen"); when a folder is chosen, the room moves to the new engine.
- **The service page** keeps the status for the tray and the settings window and E5's timers; it starts and stops the
  room (`roomStart`, `roomStop`), passes Disconnect (`roomDisconnect`), and shows the room's state. `cloud.ts` keeps
  only the pairing; `sessions.ts`, `ice.ts`, `identity.ts`, `cache.ts` and the commands `rtc_answer`, `rtc_ice`,
  `rtc_close`, `rtc_tell`, `analyse_incoming` are gone.
- **The e2e tests** keep their stand-ins for GLUE Cloud's room (`routeWebSocket`) and GLUE Home's connections
  (`e2e/home-rtc.ts`): the test engine asks the service page to hold its socket and make its connections (notes `ws`,
  `peer` and calls `page`, answered over the FakeHome's `/engine`), and to ask GLUE Cloud what the FakeHome's
  `fake.cloud` doesn't answer (the test's routes stand in). The connections' events go back to the engine in order.
  `crates/glue-engine/tests/room.rs` drives the room with a socket and connections stood in for: offers, early
  candidates, full and refused, the same tab replacing its own, failed connections, removed and replaced.

### Found on the way: an analysis landing after its file's tags were written
The e2e test of a shared collection with no tab open (homemode.spec, flaky under load since 0.54) failed every time
with the room in Rust: its timing changed. An analysis is stamped with the song's recorded date; when song info was
written into the file while it ran (a sync brought an edit), `restamp` moved what was in the cache, but this
analysis wasn't there yet, and putting it into the library wrote the old date back over the new one (and that went
to GLUE Cloud). Now an analysis that lands after its file was restamped is restamped too (the same audio), and an
analysis is never put back over a song record that moved on: that song is analysed again.

## Alternatives considered
- **glue-rtc linked into the test engine, the room relayed to the test in Node:** the e2e phone test would talk to
  webrtc-rs for real, but every test's room stand-in (on the service page, `routeWebSocket`) would have to move to
  Node, and the test engine would build webrtc-rs. glue-rtc is held to browsers by its own tests
  (`crates/glue-rtc/tests`, `scripts/rtc-probe.mjs`); the stand-in in the page keeps the tests as they were.
- **The room in GLUE Home's crate instead of the engine:** the room needs the engine's parts (sync, identity, the
  analysis of songs received, the made batch); the test engine would have had to copy it.

## Consequences
- **What's JavaScript in GLUE Home now** is E5's: backups, moves, reminders, updates, verify, tokens and config, the
  status to the settings window.
- **GLUE Home reconnects as before** (1, 2, 4… 60 s), and renews its token at 50 minutes without saying it's offline.
- **The e2e service page polls the test engine's notes every 100 ms** (it was 250): the room's messages and the
  connections' answers go that way.
