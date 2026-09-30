---
updated: 2026-09-30
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

## State (2026-09-30, end of day)
- **Live:** site, GLUE Cloud (migrations up to 0010), GLUE Home 0.38.0.
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
    folder inside a music folder isn't added; Stop stops everything and hands the library to the browser (ADR 0122).
- **User's account:** one collection `bf9246de…` (13k songs), profile "404" (`b2df29dc692b488f`). Desktop computer
  `mmJiL_dh0fD6oQEo`, laptop `x6sky9M9_5GxUe0G`, desktop GLUE Home `F59kNS0nd11yw6ly`.
- **The name MCO** is retired from the docs; lowercase `mco` identifiers stay (data depends on them). The
  `joaopmanso/mco` repo is deleted.
- **Probing a real file:** ffmpeg is on the desktop's PATH. Decode the file to f32le, run
  `runJob({ type: 'float', … })` and `classify` (from `src/core/audio`), and print the verdict and the long-term
  spectrum. That's how ADR 0116 was measured; keep the probe out of the repo.

## Waiting on the user
- Hand-test the evening's list:
  - after the collection opens, the Doechii 24/88.2 album should read "Genuine hi-res" (stored verdicts are judged
    again on open);
  - Duplicates' new buttons;
  - "DJ libraries found" shows one Engine DJ library (+ 2 more drives); Add imports all three, × removes the set;
  - after GLUE Home updates to 0.38.0: drop a new folder onto the library, it's analysed by GLUE Home; Stop makes the
    browser take over, Start takes it back. The "2025" music folder (inside "Music Collection", no songs of its own)
    can be removed.

## Next
- **Flaky e2e under load:** playback tests ("Play" not turning to "Pause") fail now and then in the full suite, never
  on their own. The user: "we can deal with the flakiness later".
- **The laptop's sync is slow** (the user: "takes quite some time but has no issues"). Measure it first: how many
  log entries and files a sync reads on the laptop, and where the time goes.
- **Bug:** on a phone's first load the library shows 8 songs, then the whole collection (timing; low priority).
- Events naming a profile (alias).
- M4 step 3: the rekordbox XML export with cues and grid (`vault/features/prepare.md`, `exports.md`).
