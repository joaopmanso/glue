---
updated: 2026-10-08
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
- **"Go on until all batches are done"** (the user, 2026-10-03, again 2026-10-05): done on 2026-10-07 (E5, 0.59.0). Each
  batch was released when its checks passed; new work is the user's to choose.

## State (2026-10-07)
- **Live:** the site, GLUE Cloud (migrations up to 0012), **GLUE Home 0.62.0**.
- **The plan** (approved 2026-10-03, file `C:\Users\joao.manso\.claude\plans\i-have-activated-plan-composed-turing.md`):
  the GLUE window, then GLUE Home's engine in Rust in batches, ending with the hidden service page removed.
  - **W1, the GLUE window** (0.50, ADR 0151): done.
  - **E1, the store in Rust** (`crates/glue-store`, ADR 0152) and **E2, the engine** (`crates/glue-engine`, `/rpc` in
    Rust, ADR 0153): done. They shipped in 0.53 (0.52 was never published: its macOS build failed a test).
  - **E3, the analysis queue** (`queue.rs`, `library.rs`, `analyse.rs`, ADR 0154): done, 0.53.0.
  - **0.53.1:** the GLUE window was white and froze GLUE Home when opened from the settings' "Open GLUE library" or
    the tray (since 0.50). Fixed and checked on the laptop.
  - **E4a, the shared sync** (`sync.rs`, `shared.rs`, `glue_store::merge3`, ADR 0155): done, 0.54.0.
  - **E4b step 1, the answers to other devices** (`answers.rs`, `covers.rs`, `names.rs`, `incoming.rs`, ADR 0156):
    done, 0.55.0 (2026-10-06, on the desktop).
  - **0.56.0, between the batches (ADR 0157):** one analysis pipeline inside "songs at a time" (the user's ask,
    2026-10-06): a folder listed once, new songs' tags read in GLUE Home's queue, every read in its places.
  - **E4b step 2, the signaling room and the sessions** (`room.rs`, `sessions.rs`, `ice.rs`, `identity.rs`, ADR
    0158): done, 0.57.0 (2026-10-06, on the desktop). With it, a race fixed: an analysis finishing after its song's
    info was written into the file put the old date back.
  - **0.58.0, between the batches (ADR 0159, the user's ask 2026-10-07):** GLUE Home's first-run guide; the start page
    always offers a GLUE folder (GLUE Home's folder window when it answers); GLUE Home's window opens on the library,
    signed in by GLUE Home as this computer (a single-use code, GLUE Cloud migration 0012).
  - **E5, GLUE Home's service in its engine** (`service.rs`, `reminders.rs`, `verify.rs`, ADR 0160): done, 0.59.0
    (2026-10-07). The hidden service page is gone. **The plan is done.**
- **After the plan (2026-10-07):** "No file linked" froze the whole site (the matching ran whole on the page, again on
  every change); fixed and live. Then the shared songs without copies (ADR 0161, GLUE Home 0.59.1). Then the real
  cause of the desktop's freezes: with GLUE Home running, the page still ran the library's work itself (a full sync,
  its own backup, a walk of the music drive…) and stopped answering after its first sync. Now GLUE Home is the app and
  the page only its screen (ADR 0162, the website only).
- **GLUE Home is Rust** plus two pages (`home/ui`): the settings window (`Settings.svelte`: it asks the engine through
  `engine_cmd` and hears its `status`) and the drag dock. One engine for its whole run (`home/src-tauri/src/engine.rs`).
- **User's account:** one collection `bf9246de…` (13k songs), profile "404" (`b2df29dc692b488f`). Desktop computer
  `mmJiL_dh0fD6oQEo`, laptop `x6sky9M9_5GxUe0G`, desktop GLUE Home `F59kNS0nd11yw6ly`.
- **graphify** (ADRs 0127–0129): the code map; CI publishes it for every push (branch `graphify`), its view at
  https://joaopmanso.github.io/glue/graph/. On both computers uv is in `~/.local/bin` (not on Claude Code's PATH:
  `export PATH="$HOME/.local/bin:$PATH"`).
- **The name MCO** is retired from the docs; lowercase `mco` identifiers stay (data depends on them).

## Waiting on the user
- **GLUE Home 0.61.0 / 0.62.0** (ADR 0164, 0165): Duplicates should look the same, now found and grouped by GLUE Home
  (it compares a few seconds after it analyses new songs; "Check again" compares every song); "Keep · not a
  duplicate" and the other answers show a moment later. No "making fingerprints" line on the page.
- **GLUE Home 0.60.0** (ADR 0163): the desktop's 61 stale clashes go with its first sync (nothing to see). A real one:
  change the same song's title on the laptop and, before it syncs, on the desktop: the desktop's box asks, with GLUE
  Home running, and the answer reaches the laptop.
- **Confirmed by the user, 2026-10-08:** a song's page as a sheet, each view's address, Back and Forward, the
  duplicates' waveforms (desktop and laptop).
- **Confirmed by the user, 2026-10-08:** the page with GLUE Home running no longer freezes (ADR 0162).
- **A recording in the repo's folder** (`glue-log.json`; the 1.2 GB one is deleted): untracked, it holds GLUE Home's
  local key. The user's to delete; never commit it.
- **GLUE Home 0.59.1 and the site** (ADR 0161):
  - on the laptop, "No file linked" shouldn't list the desktop's songs any more (it showed them as the laptop's, with
    no file). Songs already broken are put right when a computer that can tell whose they are opens the collection;
  - "No file linked" opens at once and says how far its matching is, the rest of GLUE usable meanwhile.
- **Confirmed by the user, 2026-10-07:** the hand check after 0.59.0 ("looks good").
- **GLUE Home 0.59.0** (ADR 0160): nothing should look different. Its window's status, Activity, the devices connected,
  Start / Stop / Restart (window and tray), "Check now" for reminders (a reminder sent today may come once more: its
  memory moved into GLUE Home's settings), the native engine check, the analysis while no GLUE tab is open, a change
  synced in from the laptop with no tab open, and the day's backup (`backups/auto` in the GLUE folder). Task Manager:
  GLUE Home's WebView processes should be one fewer.
- **GLUE Home 0.58.0** (ADR 0159), best on a fresh setup (another Windows user, or the laptop):
  - GLUE Home's first run shows its guide; **Make a GLUE folder in Documents**, **Open GLUE library**: the window asks
    for a profile, then the music, with no start page and no sign-in when GLUE Home is connected;
  - on the desktop: closing and opening the window (tray › Open GLUE library) opens on the library, signed in; the
    guide never shows there (set up before);
  - in a browser, signed in, "This computer, with GLUE Home" with GLUE Home running but no GLUE folder: GLUE Home's
    folder window opens from "Choose where to save GLUE's data".
- **GLUE Home 0.57.0** (ADR 0158): nothing should look different. Check that GLUE Home says "Online as …" in its
  window; the phone (and the laptop) still connect to the desktop's GLUE Home, stream, show covers, and appear in
  its window's sessions with Disconnect working (refused for an hour); a song sent from the laptop arrives in TO BE
  SORTED with its waveform; Stop then Start goes offline and back; the iPhone on mobile data (the relay) if possible.
  The window's "This computer" should still name the desktop.
- **GLUE Home 0.56.0** (ADR 0157): add a folder in the GLUE window (or a browser with GLUE Home). Its songs should show
  at once with their file names, then their artist and title a few at a time, then their analyses; the window's
  "Analysing N at a time" and its list should never show more songs than the setting. The 7 Blue Train songs, and
  albums analysed several songs at a time, shouldn't fail any more ("cannot find the file" was a collision of their
  shared cover's files).
- **Settled, 2026-10-06: "GLUE Home freezes while it analyses 50+ songs" was Windows locking the screen** (the
  user). Measured before that: the native analysis doesn't leak (60 hi-res FLACs from the NAS, 12 at a time, 74 s,
  peak 1.5 GB, back to 400 MB after); a 215-song run on the desktop (1.2 GB, 6–7 cores at its height, 80 songs a
  minute) left no GLUE Home window "not responding" (`IsHungAppWindow`, sampled every 2 s). After a run GLUE Home
  sits at about one core for a long while: the background thumbnails for other devices, one song at a time.
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
### Next: the rest of the library's work into GLUE Home (ADR 0162, the user's rule: "GLUE Home IS THE APP")
The user (2026-10-08): "I want to get all of these moved to Rust so that we can move on to the DJ library cue points
and real-time integrations." Done: the clashes (0.60, ADR 0163), the duplicates' matching (0.61, ADR 0164) and groups (0.62, ADR 0165). Left, in
order:
With GLUE Home running the page still does, until each moves into the engine (then the page stops it):
1. ~~Duplicates' groups~~: done (0.62). (Browser alone: a published duplicates file still forces a full sync,
   `dupes.onPublished` → `sync(true)`; give the sync the file instead.)
2. **Following DJ libraries live** (`djWatch`: a file's date every 5 s, read again when it changed).
3. **Finding new DJ libraries** in the music folders (`findLibraries`, 3 folders deep): off with GLUE Home now.
4. **Re-checking verdicts** (`recheckVerdicts`) and the open-time repairs (`tidyTracks`, `joinCopies`): off with
   GLUE Home now.
5. ~~The 61 clashes~~: done in 0.60.0 (ADR 0163: a computer never clashes with itself; GLUE Home's clashes in the tab).

### Working notes (GLUE Home in Rust)
- **How a batch is held to the website:** recorded goldens, replayed in Rust byte for byte:
  - the store: `GOLDEN=1 npx vitest run tests/store.golden.test.ts`, replayed by `crates/glue-store/tests/golden.rs`;
  - the sync: `GOLDEN=1 npx vitest run tests/sync.golden.test.ts`, replayed by `crates/glue-engine/tests/sync_golden.rs`.
    Packed (gzip) texts are recorded unpacked: gzip's header names the system, and Linux's CI differed.
  - the analysis: `tests/golden` (ADR 0147).
- **The e2e tests run the real engine:** `glue-engine-test` (`crates/glue-engine/src/bin/test.rs`), built by
  Playwright's global setup (`e2e/engine-build.ts`), run by `e2e/fakeHome.ts`. Its protocol is in the binary's header
  comment: `{ask, rpc|cmd}` → `{ask, ok|err}`; `{set: {config | lease | folders | known…}}`; notes (`event`,
  `analysis`, `config`, `search`, `tags`, `room`, `status`, `notify`…); and calls back to the test (`{call, cloud|web|page}` →
  `{reply}`). The room and the connections are the test's GLUE Home page's (`__e2e/home.html`, ADR 0158, 0160): notes `ws` and `peer`, calls
  `page`, and GLUE Cloud calls `fake.cloud` returns `null` for, answered by the page over the FakeHome's `/engine`
  (`{reply}`, `{ws}`, `{rtc}`), so a test's `routeWebSocket` and routes on GLUE Home's page stand in for GLUE Cloud. It
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
- **Edge 154.0.4258.62 (updated 2026-10-07):** its automatic tab freeze is now off for test browsers (2026-10-08, it
  froze background pages under load); `e2e/shared.spec.ts` "cloud sync…" passed in the full runs since. Before: it failed locally in Edge since (the desktop's
  song loses its play button after the laptop's rating) and passes in Chrome (`PW_CHANNEL=chrome`); the website and the
  test were unchanged. Find what Edge does differently there. ("The account's collections" is the older flaky one below.)
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
- **Edge's "local network" issues:** every request to 127.0.0.1 adds one to DevTools' Issues (Local Network Access);
  with the page doing nothing in Home mode there are far fewer. Look whether `targetAddressSpace: 'local'` on the
  local link's fetches quiets them.
- **Shared songs without copies (ADR 0161):** fixed by explanation, not caught in the act. If `e2e/shared.spec.ts`
  "the desktop's DJ library" ever fails that way again (about 1 run in 7 before), look for another writer of the
  computer's own form.
- **Flaky under a full local run:** `library.spec.ts` "the player…": after the reload the player shows the queue's next song
  (Fixture AAC) though the saved queue had Fixture MP3 current (checked just before the reload). 0 in 10 with five at once;
  about 1 full run in 3. Not yet understood.
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
