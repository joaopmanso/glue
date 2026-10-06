---
updated: 2026-10-06
---
# Handoff: where things stand

Rewritten (not appended) at the end of each session: the current state, what's waiting on the user, and
what's next. How GLUE works is in [SYSTEM.md](../SYSTEM.md); older notes are in [archive/](archive/).

## Standing rules (from the user, also in CLAUDE.md and memory)
- **Deploying:** once checks pass, deploy without asking:
  - push `main`;
  - when `home/` changed, bump its version (`tauri.conf.json`, `Cargo.toml`, `Cargo.lock`): the push publishes it
    (no tag to push);
  - watch CI (GitHub API with the Git Credential Manager token; never print it).
- **The vault** is updated in the same commit as the code.
- **Real fixes, not patches.** The user hand-tests on two computers, the desktop JMansoPC (Rust, runs GLUE Home)
  and the laptop.
- **The user's data** is read only:
  - the GLUE folders (the desktop's `C:\Users\joaop\OneDrive\Documents\MCO`, the laptop's
    `C:\Users\joao.manso\OneDrive - InnoWave\Documents\MCO`), GLUE Home's config and cache, the music;
  - don't restart or touch the running GLUE Home;
  - deleting cloud data needs the user's go-ahead;
  - the old `sync_*` D1 tables stay.
- **"Go on until all batches are done"** (the user, 2026-10-03, again 2026-10-05): the plan below is approved; carry it
  on batch by batch, each released when its checks pass.

## State (2026-10-06)
- **Live:** the site, GLUE Cloud (migrations up to 0011), **GLUE Home 0.54.0**. Nothing uncommitted; `main` is at
  `f19fe4a` (check its CI: the e2e run was still going when this was written).
- **The plan** (approved 2026-10-03, file `C:\Users\joao.manso\.claude\plans\i-have-activated-plan-composed-turing.md`):
  the GLUE window, then GLUE Home's engine in Rust in batches, ending with the hidden service page removed.
  - **W1, the GLUE window** (0.50, ADR 0151): done.
  - **E1, the store in Rust** (`crates/glue-store`, ADR 0152) and **E2, the engine** (`crates/glue-engine`, `/rpc` in
    Rust, ADR 0153): done. They shipped in 0.53 (0.52 was never published: its macOS build failed a test).
  - **E3, the analysis queue** (`queue.rs`, `library.rs`, `analyse.rs`, ADR 0154): done, 0.53.0.
  - **0.53.1:** the GLUE window was white and froze GLUE Home when opened from the settings' "Open GLUE library" or
    the tray (since 0.50). Fixed and checked on the laptop.
  - **E4a, the shared sync** (`sync.rs`, `shared.rs`, `glue_store::merge3`, ADR 0155): done, 0.54.0.
  - **E4b and E5:** next (below).
- **What's still JavaScript in GLUE Home** (`home/ui`, the hidden service page `service.ts`, about 500 lines):
  - the signaling room (`cloud.ts` `stayOnline`);
  - the sessions with other devices (`sessions.ts`) and the offers' glue to Rust's connections (`rtc_answer`…);
  - the answers to other devices' requests (`onRequest` in `service.ts`: thumbs, waves, details, have, art,
    find-art with `lookup.ts`, incoming, cache, analysis, local, folders, get-incoming, move-incoming);
  - `cache.ts` `soon`/`background` (songs analysed for another device, the background thumbnails);
  - identity (`identity.ts`), ICE (`ice.ts`);
  - backups, moves, reminders, updates, verify, tokens and config, the status to the settings window (E5).
  - The engine is reached from there through one Tauri command, `engine_cmd` (`home/ui/engine.ts` wraps it).
- **User's account:** one collection `bf9246de…` (13k songs), profile "404" (`b2df29dc692b488f`). Desktop computer
  `mmJiL_dh0fD6oQEo`, laptop `x6sky9M9_5GxUe0G`, desktop GLUE Home `F59kNS0nd11yw6ly`.
- **graphify** (ADRs 0127–0129): the code map; CI publishes it for every push (branch `graphify`), its view at
  https://joaopmanso.github.io/glue/graph/. On both computers uv is in `~/.local/bin` (not on Claude Code's PATH:
  `export PATH="$HOME/.local/bin:$PATH"`).
- **The name MCO** is retired from the docs; lowercase `mco` identifiers stay (data depends on them).

## Waiting on the user
- **GLUE Home 0.53.1 / 0.54.0** (updates itself within 6 hours, or the settings' update check):
  - **the GLUE window**, opened both ways (the tray, and "Open GLUE library" in the settings): it should show GLUE, not a
    white page. Then the 0.50 checklist: drop a folder or a song on it; export to rekordbox (the file in Downloads);
    sign in (once, the window's own: Google's popup, or email); play; "Open the library in" › My browser goes back to
    the browser;
  - **the engine in Rust** (0.53, ADR 0152–0154): nothing should look different. Edits (a rating, a playlist, removing
    songs), the analysis (its speed, Stop, Analyse now, a folder found by itself, a network folder waiting); anything
    odd is a regression. The first open of a shared collection whose parts were written under another id makes
    `backups/pre-repair-…zip` first (as before);
  - **the shared sync in Rust** (0.54, ADR 0155): a change on one computer still reaches the other; the desktop's
    numbers in the account's list; a collection deleted on one computer put away on the other with a backup.
- **Confirmed by the user, 2026-10-03** (0.49.3): native analysis "over 100 songs per minute", the check "looks great",
  the phone streams and uploads. Still to see: the iPhone on mobile data (the relay). The three test songs in the
  laptop's Downloads are the user's: delete them when done.
- **Older, not hand-tested yet** (details in the changelog by version):
  - 0.48.0: the 342 ALAC M4As and 91 DSF files analysed; a few DSD verdicts looked at (they mostly read "Genuine
    hi-res": DSD's noise shaping), to tune a DSD rule on;
  - 0.47.0: a song sent to the desktop shows its analysis in TO BE SORTED; covers still appear;
  - 2026-10-02's batches: "Syncing…" on the laptop (the chip's tooltip says where the time went: ask for it),
    Duplicates' release-label groups (ADR 0145), the library in parts (ADR 0146);
  - 0.43.0: the 7 songs of NAS "Music HR" analysed, or in "Couldn't analyse" with why (ADR 0144);
  - the laptop's network-folder songs without choosing the profile again (ADR 0143);
  - Alt+Tab's ghosts: restart Explorer on both computers; they shouldn't come back after test runs;
  - waveforms after big scroll jumps (ADR 0142); a new big folder's "Reading tags…" in steps of 200, the Speed panel
    (ADR 0135, 0136); network folders dropped on Windows and on jbvidigal's Mac (ADR 0134); sessions and "Most at
    once" (ADR 0133); a song on two computers is one row (ADR 0130); the first screen's waveforms on the laptop (ADR
    0131); the evening list of 2026-10-01 (hi-res verdicts on open, Duplicates' buttons, DJ libraries listed once,
    Stop/Start handing the library over, "No file linked" in bulk, a dropped song analysed by GLUE Home).

## Next
### E4b: the rest of the cloud side in Rust (0.55.0, ADR 0156)
What `service.ts` still does with other devices moves into the engine, so the service page keeps only E5's parts.
Suggested in two steps, each released and tested on its own:
1. **The answers and the helpers** (signaling stays in JavaScript for now):
   - Rust's connections (`crates/glue-rtc`, host `home/src-tauri/src/rtc.rs`) answer the requests themselves instead of
     emitting `rtc-request` to the service page: thumbs, waves, details (with `PENDING` and `cache.soon`), have, art
     and find-art (port `home/ui/lookup.ts`, `web_get`'s rules in `web.rs`), incoming, cache, analysis
     (`engine.analysis_ask`), local, folders, get-incoming, move-incoming;
   - `cache.ts` `soon`/`background` into the engine (the background's "busy" means a session is serving or receiving:
     Rust knows that now);
   - identity (`identity.ts` `whoAmI`, `/v1/computer`, `/v1/computer/attach`) and ICE (`/v1/turn`, cached as
     `src/core/ice.ts` does) through `Host::cloud`.
2. **The signaling room and the sessions:** `stayOnline` (tungstenite is already a dependency: the access token, ping
   every 30 s, renew at 50 min, backoff 1–60 s, close codes 4000 replaced / 4001 removed / 4002 renew), the session
   rules (`sessions.ts`: `admit`, `maxOf`, `sessionKey`, the refusals for an hour), the offers handed to glue-rtc, a
   `shared` push starting a sync, `presence`.

**The e2e tests need the same move.** Today the service page's signaling is intercepted with Playwright's
`routeWebSocket`, and GLUE Home's connections are stood in by the browser's (`e2e/home-rtc.ts` via `tauri-mock.ts`).
Once Rust opens the socket and answers offers:
- relay the room through the test engine's JSON-lines protocol, like `fake.cloud`: the engine says
  `{"call": n, "ws": …}`, `e2e/fakeHome.ts` hands it to the test's existing `room(me)` function with a duck-typed
  socket (`send`, `onMessage`, `close`);
- link `glue-rtc` into the test engine so a phone test's browser talks to webrtc-rs for real (glue-rtc is already
  checked against Edge: `scripts/rtc-probe.mjs`). The tests to move: `phone.spec.ts`, `computers.spec.ts`,
  `library.spec.ts` (send songs, hand-over, the local link), `identity.spec.ts`, `home.spec.ts`.

### E5: the rest, and the service page removed (0.56.0)
Backups (`backups.ts`, `glue_store::backup` has the zip already), moves (`moves.ts`), reminders (`reminders.ts`, its
memory in GLUE Home's settings, notifications from Rust), updates (`updates.ts`, the updater from Rust), verify
(`verify.ts`), tokens and config (`patchConfig` atomic in Rust), the status and events straight to the settings
window. Then remove the `service` window and its modules; `tests/homeBundle.test.ts` checks `home/ui` reaches none of
`src/store`, `src/core/shared`, `src/core/ice`; CI checks `home/dist` has no `service.html`. Note the memory GLUE Home
uses with and without the service WebView in the changelog.

### Working notes for these batches
- **How a batch is held to the website:** recorded goldens, replayed in Rust byte for byte:
  - the store: `GOLDEN=1 npx vitest run tests/store.golden.test.ts`, replayed by `crates/glue-store/tests/golden.rs`;
  - the sync: `GOLDEN=1 npx vitest run tests/sync.golden.test.ts`, replayed by `crates/glue-engine/tests/sync_golden.rs`.
    Packed (gzip) texts are recorded unpacked: gzip's header names the system, and Linux's CI differed.
  - the analysis: `tests/golden` (ADR 0147).
- **The e2e tests run the real engine:** `glue-engine-test` (`crates/glue-engine/src/bin/test.rs`), built by
  Playwright's global setup (`e2e/engine-build.ts`), run by `e2e/fakeHome.ts`. Its protocol is in the binary's header
  comment: `{ask, rpc|cmd}` → `{ask, ok|err}`; `{set: {config | lease | folders | known…}}`; notes (`event`,
  `analysis`, `made`, `config`, `search`, `tags`…); and calls back to the test (`{call, cloud}` → `{reply}`). It
  analyses real files: a test's GLUE Home songs and GLUE folder go on disk (`e2e/homeDisk.ts`). `new FakeHome(dirs,
  { engine: true })` sends a tab's `/rpc` to the engine; without it, a GLUE Home from before the engine.
- **Windows and WebView2:** never build a window inside a synchronous command or an event handler on the main thread:
  it deadlocks (a white window, GLUE Home frozen; 0.53.1). `open_glue` builds it on a thread of its own.
- **Reproducing on the laptop:** GLUE Home isn't installed there. A test copy can run with a throwaway library: check
  out the version in a `git worktree` (scratchpad), serve its pages (`npx vite --config home/vite.config.ts --port 5176`),
  build with `CARGO_TARGET_DIR` set to a separate folder, write `%APPDATA%\io.github.joaopmanso.gluehome\config.json`
  pointing at the throwaway GLUE folder, and drive it with Windows UI Automation. Afterwards remove that config folder,
  `%LOCALAPPDATA%\io.github.joaopmanso.gluehome`, the registry key `HKCU:\Software\Classes\gluehome` (PowerShell
  `Remove-Item`; `reg.exe` is blocked), the worktree and the build folder. Stop only the test copy, by its path.
- **Rust on the laptop:** `export RUSTUP_HOME=/c/Work/rust/rustup CARGO_HOME=/c/Work/rust/cargo
  PATH="/c/Work/rust/cargo/bin:$PATH"`. CI runs each crate's tests and `clippy -D warnings` (`.github/workflows/home.yml`).
- **Editing files with backslashes or tabs:** a Bash heredoc into Python mangles `\n`, `\t` and `\\`. Write the script
  with the Write tool, or use the Edit tool for such lines.

### Other work
- **The nightly e2e run fails since 2026-10-03:** `stems.spec.ts` (stem separation) runs out of its 14 minutes on CI's
  machine (and `library.spec.ts` "No file linked" failed once on 2026-10-04). Not from the engine work; look at the
  stems test's time on CI (`STEMS=1`).
- **After the desktop's second check:** fix what its named fields show (suspected: the stored `d/` headers are older
  than their results); the Deftones MP3 (a shifted decode: ask for the file if it's still there).
- **DSD verdicts:** tune a DSD rule on the user's 91 songs once they're analysed (ADR 0149).
- **TURN from Rust** is untested from outside the home network (ADR 0150): if the iPhone on mobile data can't
  connect, look at webrtc-rs's TURN (UDP should work; `turns:` over TCP may not be used).
- **Streaming decode:** a song is still read whole into memory for its analysis (a 543 MB FLAC needs about 1.5 GB);
  decoding FLAC/WAV/AIFF from the file (`decode_flac` already reads ranges) when it shows.
- **Bug, found 2026-10-02 (ADR 0146):** a song of the shared collection can reach another computer without `copies`;
  there the "no file" bar offers to remove it. Find who writes the local form into a shared shard (around `share` /
  `makeShared` and the first push), and make `toLocal` treat a song without copies as nobody's here. Reproduce:
  `e2e/shared.spec.ts` "the desktop's DJ library", with the library's fields regrouped (1 run in 7).
- **Flaky:** `shared.spec.ts` "the account's collections" (from before 2026-10-02): 0 songs for 30 s after switching
  collection, or the account's box not shown.
- **"Syncing…" lingers on the laptop:** ask for the chip's tooltip after a long "Syncing…", then fix the part it names
  (suspects: `reloadFiles` one file at a time, the full look every 30 minutes, the GLUE folder in OneDrive).
- **The socket** (ADR 0139): covers still come over HTTP; the next to move onto it if they show in the numbers.
- **Performance, measure before changing:** `?perf` on the laptop's first load.
- **E2E:** the full suite takes 12–16 min on the laptop. When it slows a lot with random failures, check free memory
  first (dwm.exe leaked 41 GB once); never kill dwm or the user's Edge.
- **Gluey:** when a feature changes, update its article in `src/help/` and its tour in `src/core/guide/tours.ts`.
- Events naming a profile (alias). M4 step 3: the rekordbox XML export with cues and grid (`vault/features/prepare.md`).
