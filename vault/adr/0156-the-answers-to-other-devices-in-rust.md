---
status: accepted
date: 2026-10-06
---
# 0156. GLUE Home answers the account's other devices in Rust

## Context
The plan's E4b (after E4a, ADR 0155) moves the rest of GLUE Home's cloud side out of the hidden service page. Since
0.49 GLUE Home's connections are Rust's (crates/glue-rtc, ADR 0150), but each request they didn't answer themselves
(`ping`, `put`, `cache`) went to the service page as an `rtc-request` event, which answered it in JavaScript
(`service.ts` `onRequest`, `cache.ts`, `lookup.ts`) and sent the answer back through three commands (`rtc_reply`,
`rtc_send_file`, `rtc_error`). The answers' parts were already the engine's: the songs' paths, the analysis queue, the
cache files. E4b is done in two releases: the answers and their helpers first (this ADR, 0.55); the signaling room and
the sessions next, with identity and ICE, which serve the signaling.

## Decision
- **`Engine::answer`** (`crates/glue-engine/src/answers.rs`) answers each request: data and bytes, or a song's file
  (sent from disk by the connection), and what to say to every session afterwards (a song moved out of the incoming
  folder). Every kind the service page answered, the same way:
  - `get` and `range` (a song, whole or in parts of 8 MB at most; where it is looked up once a minute; a music folder
    found by name is remembered in the settings);
  - `thumbs` (mini spectrograms or waveforms, a waveform made again from the kept analysis when it's missing; a song
    without is analysed next), `details` (made now, first in line, "pending" after 12 s), `have`;
  - `art` (kept, or read from the song's tags now), `find-art` (`covers.rs`, below);
  - `incoming`, `get-incoming`, `move-incoming` (`incoming.rs`: the incoming folder's list and moves, with the naming
    rules GLUE Home's own commands now use too), `folders`, `local` (`Host::local_link`), `analysis`.
  - Songs analysed for another device run one at a time, a song page's first (`soon`); the background thumbnails
    (`background`) wait while GLUE Home sends or receives for a device (`Host::serving`), analyses for one, or
    analyses the library, and until the library's analysis has looked once (`analysis_busy`): started sooner than the
    service page's, they analysed a song first, and the queue then took it for analysed, not counted (the e2e test
    of GLUE Home analysing with no tab open saw 4 songs done of 5).
- **GLUE Home's connections call it** (`home/src-tauri/src/rtc.rs`): each request on a thread of its own, answered
  through glue-rtc's `reply`, `send_file` or `error`, counted for the settings window (`rtc-served`). The three reply
  commands, `cover_hash`, `cover_from_image`, `wave_from_details`, `web_get` and `incoming_move` are gone; `rtc_busy`
  tells the service page when updates must wait.
- **The cover look-up** (`covers.rs`, `names.rs`) is `coverSearch.ts`, names.ts's `bare` and `lookup.ts` in Rust:
  the same keys (they name what's kept, `f/<hash>.txt`), addresses and picks, held to the website's by
  `tests/golden/covers.json` (recorded by `tests/covers.golden.test.ts`, replayed by
  `crates/glue-engine/tests/covers_golden.rs`): names in several scripts, JavaScript's order (lowercase, then NFKD),
  its ASCII-only `\b`, `??` and string lengths in UTF-16 units. The services are asked through `Host::web_get`, with
  web.rs's rules.
- **The tests:** `crates/glue-engine/tests/answers.rs` (a real song analysed when asked, its parts, cover and file; the
  incoming folder; the cover look-up once and refused for good); the e2e stand-in for GLUE Home's connections
  (`e2e/home-rtc.ts`) asks the test engine's `answer` command, as rtc.rs does, and the fake GLUE Home keeps what the
  engine reads on disk (songs received, incoming analyses, what other devices put), answers the cover services the
  engine asks (`fake.web`), and reads its folders' files to send. Every test that runs GLUE Home's pages gives it a
  test engine now (`homeDisk`); one that stands GLUE Home's local link in itself wires only the engine
  (`wire(page, { link: false })`: the stand-in reaches it on `__enginePort`).

## Alternatives considered
- **A request handler inside glue-rtc:** the crate knows connections, not libraries; the engine has the stores, the
  queue and the cache, and both GLUE Home and the test engine already reach it.
- **Moving the signaling in the same release:** the answers are self-contained and testable on their own; the
  signaling changes how the e2e tests stand in for GLUE Cloud's room, a release of its own.

## Consequences
- **The service page no longer answers other devices**: it keeps the signaling room, the sessions' rules, songs
  received, identity, ICE and E5's parts (backups, moves, reminders, updates, verify, the status).
- **The answers run in parallel threads** instead of the page's single thread: a slow `details` (an analysis) holds up
  nothing.
- **The e2e tests' GLUE Home answers from disk:** a test that sends songs to it, or plays its songs, gives it real
  folders (`homeDisk`); never a real drive's path.
