---
updated: 2026-10-02
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

## State (2026-10-02)
- **Live:** site, GLUE Cloud (migrations up to 0011), GLUE Home 0.49.0 (analyses and streams natively, DSD, ADR
  0147–0150).
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
  - **Both computers:** uv (`~/.local/bin`, not on Claude Code's PATH: `export PATH="$HOME/.local/bin:$PATH"`),
    `graphifyy[sql]` 0.9.73 and the git hooks are installed (the laptop since 2026-10-02: there, Windows PowerShell 5
    can't run uv's installer, PowerShell 7 can; `graphify-out/.graphify_python` written by hand).
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
- **The native engine check, second run (0.48):** see the changelog (0.49.1). **Asked of the user:** copy "1-01 Donna
  Lee.mp3" and "Deftones - Nosebleed demo.mp3" to the laptop (Downloads) to find the MP3 difference. After 0.49.1, a
  third run should show almost all "the same" (FLACs with an ID3v2 tag before the stream are now GLUE's own decoder's).
- **The native engine check, first run (2026-10-02, desktop, 1,000 songs):** 111 the same, 0 close, 299 differ, 0 failed
  natively, 14 only native could, 576 skipped, 2.7 s a song. Nearly every "differ" was "d: the header differs" (the
  check didn't say which field); one MP3 (Deftones, "Nosebleed demo") really differs (17% of fingerprint bits: a
  shifted decode?). **Next:** after 0.47 arrives, run it again (100 songs is enough): it names the fields now; send
  the "differ" lines and the "Skipped:" line. If it's the MP3's trim, ask for that file.
- **The native engine check (GLUE Home 0.45.0, ADR 0147), on the desktop:** after it updates, GLUE Home's window ›
  Activity › Native engine check › 1,000 › Check. It analyses those songs again natively (nothing is saved) and gives
  a tally; the ones that differ are listed. Send the tally, and `x/verify.jsonl` (in GLUE Home's cache folder,
  `%LOCALAPPDATA%\io.github.joaopmanso.gluehome\library\x\`) if anything differs or failed. This is the gate for B3 (GLUE Home
  analysing natively, shipped in 0.46 without waiting, as the user asked: "go on until all batches are done"). Run it
  soon after 0.46 arrives, before the queue has analysed much natively (the check skips native results). Also its "a
  song natively" time against the Speed panel's. If songs differ: their results say `engine`, so they can be found
  and analysed again once fixed.
- **GLUE Home 0.46.0** (ADR 0148): analysis should look the same in GLUE Home's window (the Speed panel, songs at a
  time, Pause), faster per song; the 342 ALAC M4As only when they're analysed again (B5).
- **GLUE Home 0.49.0: streaming native** (ADR 0150), the hand test that matters most:
  - the laptop and the iPhone at home (Wi-Fi): songs play from the desktop, waveforms and covers appear, Devices
    connected lists them;
  - **the iPhone on mobile data** (relayed through TURN: only provable from outside);
  - send a song from the laptop to the desktop (TO BE SORTED, analysed);
  - Disconnect in the settings.
  - If something breaks: GLUE Home's log has "rtc" lines.
- **GLUE Home 0.48.0** (ADR 0149): the 342 ALAC M4As and 91 DSF files should be analysed (the queue's "left" goes up
  by about 433 once, then down). Look at a few DSD songs' verdicts: they'll mostly read "Genuine hi-res" (DSD's noise
  shaping), even one made from a CD master; which ones look wrong is what a DSD rule would be tuned on.
- **GLUE Home 0.47.0:** send a song to the desktop (TO BE SORTED should show its analysis), and covers should still
  appear (from tags, and looked up for songs without).
- **Today's three batches (2026-10-02, the laptop's session):**
  - **"Syncing…" on the laptop:** hover the chip after a long "Syncing…": its tooltip says where the time went
    (saving, from and to GLUE Cloud, reading what it wrote, how many in a row). Fix the part it names.
  - **Duplicates** (ADR 0145): new "probable" groups of one recording under release labels ("Album Version",
    "Remastered 2009", "Mono"); mixed groups split ("When We Dance": the edit apart from the long mix). No file linked:
    "INGOT_HM" and "Eazy Baba … PRE_MASTER" now have suggestions.
  - **The library in parts** (ADR 0146): nothing should look different; anything odd in opening, scanning, playing or
    analysing is a regression.
- **GLUE Home 0.43.0** (ADR 0144): after it updates, the 7 songs (John Coltrane's *Blue Train* and two more, NAS "Music
  HR") should be analysed (it tries again after a restart, and GLUE decodes FLAC itself now). The tab's "7 analysing"
  should go. A song that still fails shows in "Couldn't analyse" with why.
- **The laptop** (ADR 0143, website): the desktop's network-folder songs should show without choosing the profile
  again; Chrome's console should have `/hello` errors once on opening, not every 15 s.
- **Alt+Tab's ghosts** (laptop: "GLUE Home service" ×4, "GLUE Home", "GLUE · Global Library…", one untitled):
  Edge's tabs from the e2e test browsers, handed to Windows' Alt+Tab (`msWindowTabManagerPublic`), kept by Explorer
  (running since 2026-09-24). Not reproduced with Edge 154.0.4258.48; test browsers now run with it off (`EDGE_ARGS`).
  - **The user:** restart Explorer (Task Manager › Windows Explorer › Restart) on the laptop and the desktop; the
    ghosts should go and not come back after test runs.
- **Waveforms after jumps** (ADR 0142, website only): drag the scroll bar about 5,000 songs down and again, 3 or 4
  times. Every row on screen should get its waveform as soon as the others, no block left empty.
- **GLUE Home 0.42.2** (ADR 0141): **confirmed** by the user, 2026-10-02: "the playing is great, it's very fast".
  - **If it's still slow:** has F: been idle for 20 minutes or more? It's a hard disk that Windows turns off then
    (power plan "Turn off hard disk after": 20 min), and spinning up is the drive's time, not GLUE's.
  - **Measured:** the WAV (`F:\Music\X (PREVIEW MASTER ONLY).wav`, 52 MB) played through the local link in 0.4 s
    from a test browser of its own.
- **GLUE Home 0.42.1** (ADR 0140): with the NAS folder analysing, songs played start in seconds (the user: a NAS song
  in under 2 s, 2026-10-02).
- **GLUE Home 0.42.0** (ADR 0139): scroll the library to a part not loaded yet (the scroll bar 30–40 % down). The songs
  on screen should stay put while waveforms and covers fill in. Click songs in a row while the NAS folder analyses.
- **GLUE Home 0.41.6** (ADR 0138): with the NAS folder analysing, click several songs in a row. They should play, and
  the direct link should stay. Then compare the Speed panel's MB/s from network folders with before (10 MB/s; the NAS
  gave 47–74 to plain reads).
- **The analysis starving GLUE Home** (ADR 0137): **settled by 0.41.5.** The user confirmed the desktop keeps its
  direct link and the iPhone streams with 24 at a time and network folders at 4.
  - **Measured during it:** GLUE Home's `/hello` answered in 2 to 4 ms. Its analysis process used about a quarter of
    the machine (4 threads busy, the main thread about 11%). The network took 185 Mbit/s of a gigabit link.
  - **So it was the page's impatient link check and its fallback session to its own GLUE Home,** not the processor
    or the network.
  - **The Speed panel:** 6 reading, 2 analysing; a song 31.8 s reading, 16.5 s analysing. The NAS is the limit
    (two NAS folders at 4 each).
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
- **The native engine (ADR 0147), batches after 0.44:**
  - **B2: done (0.45.0).** Gate: the desktop's check (Waiting on the user).
  - **B3: done (0.46.0, ADR 0148).**
  - **B4: done (0.47.0).**
  - **B5: done (0.48.0, ADR 0149)** but streaming decode from disk: a song is still read whole into memory (a
    543 MB FLAC needs about 1.5 GB while it's analysed). Left for when it shows: decoding FLAC/WAV/AIFF straight from
    the file (`decode_flac` already reads ranges) and keeping the samples f32;
  - **B6: done (0.49.0, ADR 0150).** Next, when the GLUE window comes: the queue and the library's answers in Rust,
    then the service page removed.
  - **After the desktop's second check:** fix what its named fields show (suspected: the stored `d/` headers are older
    than their results); the Deftones MP3 (a shifted decode: ask for the file if it's still there).
  - **DSD verdicts:** tune a DSD rule on the user's 91 songs once they're analysed (ADR 0149: noise shaping reads as
    hi-res).
  - **TURN from Rust** is untested from outside the home network (ADR 0150): if the iPhone on mobile data can't
    connect, look at webrtc-rs's TURN (UDP should work; `turns:` over TCP may not be used).
- **The socket** is in (GLUE Home 0.42, ADR 0139). Covers still come over HTTP: the next to move onto it if they show
  in the numbers.
- **From the code map** (function names defined in several files, 2026-10-01; the loaders and copy names are done):
  - done 2026-10-02: one rule for names (ADR 0145), the library in parts (ADR 0146), `sha256`, the ICE cache, the
    worker getters.
  - **performance, measure before changing:** `?perf` on the laptop's first load (the store's open time, the
    rows' cost).
- **Bug, found 2026-10-02 (ADR 0146):** a song of the shared collection can reach another computer without `copies`
  (seen: an unlinked rekordbox record, imported on the desktop just before it shared the collection). There it has no
  import path or DJ library of its own and isn't another computer's either, so the "no file" bar
  (`core/library/removal.ts` `orphans`) offers to remove it. Find who writes the local form into a shared shard
  (around `share` / `makeShared` and the first push), and make `toLocal` treat a song without copies as nobody's here.
  Reproduce: `e2e/shared.spec.ts` "the desktop's DJ library", with the library's fields regrouped (1 run in 7).
- **Flaky:** `shared.spec.ts` "the account's collections", from before 2026-10-02 (2 in 12 on `d403b25`, 4 in 12 on
  `3353c03`; it failed CI on `3353c03`, retry included). Three ways: the desktop's backup read once without waiting,
  0 songs for 30 s after switching collection, the account's box not shown. The first is a poll now (2026-10-02); look at the
  other two (switching collections while a sync runs?).
- **Gluey:** when a feature changes, update its article in `src/help/` and its tour in `src/core/guide/tours.ts`;
  recapture the homepage's media after visible UI changes (`vault/features/homepage.md`).
- **E2E on the laptop** (2026-10-02): the full suite takes about 14 min; `library.spec.ts:2054` (the local link, TO BE
  SORTED) failed under full load in both runs, and `home.spec.ts:19` once; both pass alone and on CI.
- **E2E speed and flakiness:** the full suite takes about 6 min on the desktop. When it slows to 12+ min with random
  failures, or browsers stop starting, check free memory first: on 2026-10-01 Windows' Desktop Window Manager
  (dwm.exe) had leaked 41 GB (a graphics-driver leak; a restart fixed it). Never kill dwm or the user's Edge; ask.
- **"Syncing…" lingers on the laptop** though the sync looks quick (2026-10-02). The chip's tooltip now says where
  the last sync's time went: ask the user for it after a long "Syncing…", then fix that part. Suspects: re-reading
  the pulled files (`reloadFiles`: one at a time, each scanning all 13k songs), the full look every 30 minutes (every
  file read twice), the GLUE folder being in OneDrive (`OneDrive - InnoWave\Documents\MCO`).
- Events naming a profile (alias).
- M4 step 3: the rekordbox XML export with cues and grid (`vault/features/prepare.md`, `exports.md`).
