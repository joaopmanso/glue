---
status: accepted
date: 2026-10-07
---
# 0160. GLUE Home's service in its engine: the hidden page removed

## Context
The plan's last batch, E5. Since ADR 0044 GLUE Home ran its service in a hidden WebView window (`home/ui/service.ts`).
Batches E1–E4b (ADR 0152–0158) moved its work into the Rust engine one part at a time: the store, the engine, the
analysis, the shared sync, the answers to other devices, the room and the sessions. What was left in the page:
- its status for the tray and the settings window (assembled from the engine's events, the room, the analysis, what
  devices asked), and its Activity list;
- its timers: the shared sync (25 s, then every minute, and 2 s after an edit), the day's backups, a moved
  collection's cache followed, reminders of events that need music, which computer this is, updates;
- Start / Stop / Restart, and acting on new settings (the room again, the music folders found again);
- the local link's tokens, the website's GLUE folder found at start, songs waiting in the incoming folder;
- the native engine check's loop (`verify.ts`, with `verify_song` in Rust).

A WebView of its own for this costs a renderer process (about 40 MB private, 80–90 MB working set on the desktop,
2026-10-07), and kept GLUE Home's behaviour split between two languages.

## Decision
- **The engine runs GLUE Home's service** (`crates/glue-engine/src/service.rs`): its status (`status_json`, said through
  `Host::status_changed`, at once for the room and at most every 2 s for the busy parts), the events (`Engine::event`
  keeps the last 30), what devices asked (`served`), a song arriving (`receiving`); start (`service_start`: the tokens
  through `Host::new_token`, the GLUE folder through `Host::find_glue`, songs waiting, online, the music folders found,
  the timers); `control` (Start / Stop / Restart); `config_changed`; the timers as the page had them; the day's backups
  (`glue_store::backup::build_backup`, `backups/auto`, 14 kept); a moved collection's cache followed; reminders
  (`reminders.rs`, the website's rule from `src/core/library/events.ts` with its tests, notified through
  `Host::notify`, what was reminded kept in GLUE Home's settings, `reminded`); updates through `Host::auto_update`
  (the updater from Rust), when nothing is being sent.
- **The native check is the engine's** (`verify.rs`): the comparison moved from GLUE Home's `analysis.rs`, the sample's
  loop from `verify.ts`; its state is part of the status.
- **GLUE Home keeps one engine for its whole run** (`engine::current`): its GLUE folder changes in place
  (`Engine::set_glue`, the stores let go, the songs looked through again) instead of a new engine being made, so the
  service, the room and the sessions carry on.
- **GLUE Home's host:** the status goes to every window (`status`) and to the tray (`tray_status`); a change to the
  settings file (`set_config_impl`, whoever writes it) is handed to the engine (`config_changed`); the tray's Start /
  Stop / Restart call `control`; the connections hand what they answered and a song arriving to the engine.
- **The settings window** asks the engine for the status (`serviceStatus`) and hears it (`status`); Start / Stop /
  Restart, Check now, Disconnect and the native check are engine commands. `service.html`, `service.ts`,
  `backups.ts`, `moves.ts`, `reminders.ts`, `verify.ts` and the commands only the page used are gone.
- **Kept out:** `tests/homeBundle.test.ts` fails when GLUE Home's pages reach the website's store, shared sync, ICE,
  platform layer or `src/lib`; CI fails when `home/dist` has a `service.html`.
- **The e2e tests:** the test engine starts the service with GLUE Home's first settings, says its status and
  notifications as notes, and gets later settings as `config_changed`. GLUE Home's background (the stand-ins for its
  room's socket and its connections) runs in a page of its own, `__e2e/home.html` (`e2e/home-public/`, never shipped),
  away from the settings window, as GLUE Home's run in Rust away from its windows; the tests of the window itself open
  it (`index.html`).
- **The status is said at once only when it matters** (the room's state or text, a song starting or ending to arrive);
  the rest (sessions coming and going, their activity, a song's progress every MB, the analysis) within 2 s.

### Found on the way: a start overtaken by Stop
A start of the room still waiting for its access token when Stop came (a second "Connect" then Stop, in quick
succession) went on and said "Online" over "Stopped". The room's loop now checks it is still the latest start before
it opens the socket and before it says anything (`room_say`), as it did only between messages before.

## Alternatives considered
- **The service in GLUE Home's crate (`home/src-tauri`):** the e2e tests can't run it; in the engine, the test binary
  runs the same code.
- **Keeping the page for the status only:** a renderer for a few labels, and two places for one state.

## Consequences
- **GLUE Home is Rust and its two windows** (settings, drag dock) plus the GLUE window; nothing runs in a hidden page.
- **The plan (W1, E1–E5) is done.**
- **Memory:** one WebView renderer fewer (about 40 MB private).
