---
updated: 2026-10-01
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
  - the GLUE folder `C:\Users\joaop\OneDrive\Documents\MCO`, GLUE Home's config and cache, the music;
  - don't restart or touch the running GLUE Home;
  - deleting cloud data needs the user's go-ahead;
  - the old `sync_*` D1 tables stay.

## State (2026-10-01)
- **Live:** site, GLUE Cloud (migrations up to 0011), GLUE Home 0.41.4.
- **Confirmed by the user on the desktop, the laptop, Edge and the phone** (ADRs 0108–0115):
  - one id per computer;
  - one meaning of "not analysed", GLUE Home's analyses on screen, folders taking their songs;
  - the account's collections;
  - profiles as every device's aliases;
  - any browser on the computer using GLUE Home.
- **The evening's bug list, shipped, not hand-tested yet:**
  - the library: its place kept, name links, unreadable songs only in "Couldn't analyse", playlist numbers always
    shown, "Lower quality", the phone's count, the Overview's background;
  - quality: a quiet top end is still hi-res, and upsamples that passed are caught (ADR 0116);
  - duplicates: versions kept apart, "Keep · not a duplicate", "Mark as duplicates" (ADR 0117);
  - content beyond a wall without frequent drop-outs is "Lossless" (ADR 0119, superseding 0118); the analysis bar
    shows GLUE Home's queue; Duplicates' buttons no longer overlap;
  - songs that failed on the desktop leave the library on every device; Overviews and covers load for the rows on
    screen, newest first;
  - only the best copy shows and is used (playlists rewritten), Duplicates filters by type and certainty with a bulk
    removal that sets aside doubtful groups (ADR 0120); GLUE Home builds once per change (no tags);
  - an optional main music folder decides the best copy among equals (ADR 0121);
  - a found DJ library is listed once (it was four times: the same m.db reached by several ways), and × takes one off
    the list; Engine DJ's databases on C:, F: and G: are one entry ("+ 2 more drives"), imported together;
  - GLUE Home 0.38.0: a dropped folder is found by GLUE Home (it was searched for per song and never analysed); a
    folder inside a music folder isn't added; Stop stops everything and hands the library to the browser (ADR 0122);
  - GLUE Home 0.39.0: network folders that come and go (a tester, jbvidigal, on a Mac with all music on Wi-Fi shares):
    away folders' songs wait instead of going missing or failing; errors say what's wrong (ADR 0123);
  - "No file linked" matches songs with no file to the library's, with a certainty, and links them in bulk; links
    survive Engine DJ's next read (ADR 0124);
  - GLUE Home 0.40.0: a song dragged onto the library is found by GLUE Home (in a music folder it's that folder's
    song) and analysed; the tab analyses what only it can read; the "waiting" count no longer cycles (ADR 0125);
  - Gluey, batch 1 of 3 (ADR 0126, `vault/features/guide.md`, the plan in `~/.claude/plans/warm-stargazing-raccoon.md`):
    the first tour once per person, the offer for people from before him, his corner button, "Take the tour again";
  - Gluey, batch 2 (GLUE Home 0.40.1): the help centre (18 articles, `#/help`), a tour per feature, first-visit
    tips;
  - batch 3: the new homepage, with media recaptured (`scripts/demo/`).
- **graphify** (ADRs 0127, 0128, CLAUDE.md "graphify"): a code map for coding sessions.
  - **CI** publishes it for every push to `main` (branch `graphify`); `node scripts/graph.mjs fetch` gets it, and a
    session-start hook does that on a computer without one.
  - **The desktop:** uv (`~/.local/bin`, not on Claude Code's PATH: `export PATH="$HOME/.local/bin:$PATH"`),
    `graphifyy[sql]` 0.9.73 and the git hooks are installed.
  - **The docs part** is refreshed by every session that changes docs (ADR 0129, CLAUDE.md "After working");
    `vault/log/` isn't in it.
  - **Its view:** https://joaopmanso.github.io/glue/graph/ (and `graphify-out/graph.html` locally).
- **User's account:** one collection `bf9246de…` (13k songs), profile "404" (`b2df29dc692b488f`). Desktop computer
  `mmJiL_dh0fD6oQEo`, laptop `x6sky9M9_5GxUe0G`, desktop GLUE Home `F59kNS0nd11yw6ly`.
- **The name MCO** is retired from the docs; lowercase `mco` identifiers stay (data depends on them). The
  `joaopmanso/mco` repo is deleted.
- **Probing a real file:** ffmpeg is on the desktop's PATH. Decode the file to f32le, run
  `runJob({ type: 'float', … })` and `classify` (from `src/core/audio`), and print the verdict and the long-term
  spectrum. That's how ADR 0116 was measured; keep the probe out of the repo.

## Waiting on the user
- **Analysis on the desktop** (GLUE Home 0.41.2, ADR 0135):
  - the tab's "left" and GLUE Home's window should match;
  - a new big folder's "Reading tags…" should move in steps of 200;
  - with the NAS folder and local folders both waiting, the processor should go well above 60%;
  - the NAS folder alone is network-bound (about 1,500 hi-res songs an hour).
  - The network cap is the user's now (0.41.3, ADR 0136): "From each network folder at a time", with the speed and a
    suggestion in GLUE Home's window (0.41.4: a panel, Activity › Speed). Ask what it shows with the NAS and local folders
    analysing.
- **Network folders** (GLUE Home 0.41.1, ADR 0134):
  - **Windows:** drop a network folder. The page says "Looking for…", then "Choose … in GLUE Home's window" after
    about 5 s.
  - **The Mac (jbvidigal):** + Folder on "Música" should scan; anything unreadable is named in the message.
  - **Open:** whether GLUE Home analyses that Mac's songs (they seemed to be analysed in the browser). If not, ask for
    the Activity text in GLUE Home's window ("which computer this is isn't known yet"?).
- **Sessions** (GLUE Home 0.41.0, ADR 0133): after the desktop updates, GLUE Home's window › Service › Devices
  connected should list the laptop's and phone's tabs.
  - **Real time:** a song not analysed yet on the desktop should get its waveform on the laptop as soon as the
    desktop analyses it, with no scrolling.
  - **Full:** with "Most at once" at 1, a second device is told it's full.
  - **Sending songs** from the laptop goes over the session.
- **GLUE Home 0.40.2 on the desktop** (ADR 0132): the desktop's GLUE Home was at its limit of connections. Update
  it, or Stop and Start it. Then the laptop should connect again: waveforms on the first screen, and songs play.
  The iPhone's song pages should open.
- **The first screen's waveforms on the laptop** (ADR 0131, not hand-tested yet): open the collection fresh on
  the laptop (desktop on). The first screen's Overviews and covers should fill in as soon as the desktop answers,
  without scrolling.
- **A song on two computers is one song** (ADR 0130, not hand-tested yet):
  - **the reported song:** open the collection on the desktop. The song sent from the laptop should be one row
    showing both computers, no longer in Duplicates;
  - **older pairs:** the first open may also join older pairs (the same file in both computers' music folders).
    With more than 10, a backup is made first (`backups/pre-join-copies-…zip`). The console says how many joined;
  - **a new send:** send another song from the laptop; on the desktop it should go straight onto the laptop's song.
- **The laptop: graphify's CLI** (to read the graph that CI publishes and the session-start hook fetches):
  1. uv: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`;
  2. `uv tool install "graphifyy[sql]==0.9.73"`;
  3. optional, to rebuild locally after each commit: `graphify hook install`, then take out the
     `graphify-out/graph.json merge=graphify` line it adds to `.gitattributes`.
- **Browse the code map** at https://joaopmanso.github.io/glue/graph/ after this push's deploy.
- Hand-test the evening's list:
  - after the collection opens, the Doechii 24/88.2 album should read "Genuine hi-res" (stored verdicts are judged
    again on open);
  - Duplicates' new buttons;
  - "DJ libraries found" shows one Engine DJ library (+ 2 more drives); Add imports all three, × removes the set;
  - after GLUE Home updates to 0.38.0: drop a new folder onto the library, it's analysed by GLUE Home; Stop makes the
    browser take over, Start takes it back. The "2025" music folder (inside "Music Collection", no songs of its own)
    can be removed.
  - jbvidigal (Mac, 0.39.0): the "needs 0.12" popup should be gone; if a share is down, one calm line instead. If
    GLUE Home's window still shows songs waiting to go into the library, it now says why; ask for that line.
  - "No file linked" on the Engine DJ import: link the sure ones (95 %+) in bulk, check a few doubtful ones.
  - After GLUE Home 0.40.0: drag a song from a music folder onto the library; it should show as that folder's and be
    analysed by GLUE Home. "Odessa" (added on its own before the fix) can be removed and dropped again.

## Next
- **From the code map** (function names defined in several files, 2026-10-01; the loaders and copy names are done):
  - **"the same name"** is judged five ways, with different rules: `duplicates.ts` and `relink.ts` `plain`,
    `dupes.svelte.ts` `norm`, `shared/match.ts` `norm`, `coverSearch.ts` `norm`. So Duplicates, No file linked and
    joining a collection can disagree. Make one in `core/library`; it changes matching, so test against the user's
    collection;
  - **`library.svelte.ts`** (1,542 lines; `Library` is the graph's top hub, 147 edges): split by concern (scanning
    and music folders, imports, the analysis queue, Home mode) behind the same `lib` API;
  - **smaller:** `getWorker` in `analysis.ts` and `parseWorker.ts`; `iceServers` in `home/ui/ice.ts` and
    `src/lib/ice.ts`; `sha256`/`hex` in the cloud, the sync engine and the cover worker.
  - **performance, measure before changing:** `?perf` on the laptop's first load (the store's open time, the
    rows' cost).
- **Gluey:** when a feature changes, update its article in `src/help/` and its tour in `src/core/guide/tours.ts`;
  recapture the homepage's media after visible UI changes (`vault/features/homepage.md`).
- **E2E speed and flakiness:** the full suite takes about 6 min on the desktop. When it slows to 12+ min with random
  failures, or browsers stop starting, check free memory first: on 2026-10-01 Windows' Desktop Window Manager
  (dwm.exe) had leaked 41 GB (a graphics-driver leak; a restart fixed it). Never kill dwm or the user's Edge; ask.
- **The laptop's sync is slow** (the user: "takes quite some time but has no issues"). Measure it first: how many
  log entries and files a sync reads on the laptop, and where the time goes.
- **Bug:** on a phone's first load the library shows 8 songs, then the whole collection (timing; low priority).
- Events naming a profile (alias).
- M4 step 3: the rekordbox XML export with cues and grid (`vault/features/prepare.md`, `exports.md`).
