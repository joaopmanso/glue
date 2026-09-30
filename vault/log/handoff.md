---
updated: 2026-09-30
---
# Handoff: where things stand

Rewritten (not appended) at the end of each session: the current state, what's waiting on the user, and
what's next. How GLUE works is in [SYSTEM.md](../SYSTEM.md); older notes are in [archive/](archive/).

## Standing rules (from the user, also in CLAUDE.md and memory)
- **Deploying:** once checks pass, deploy without asking:
  - push `main`;
  - tag `home-v<version>` when `home/` changed;
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
- **Live:** site, GLUE Cloud (migrations up to 0010), GLUE Home 0.37.1.
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
  - duplicates: versions kept apart, "Keep · not a duplicate", "Mark as duplicates" (ADR 0117).
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
  - Duplicates' new buttons.

## Next
- **Bug:** on a phone's first load the library shows 8 songs, then the whole collection (timing; low priority).
- Events naming a profile (alias).
- M4 step 3: the rekordbox XML export with cues and grid (`vault/features/prepare.md`, `exports.md`).
