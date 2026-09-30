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

## State (2026-09-30)
- **Live:** site, GLUE Cloud (migrations up to 0010), GLUE Home 0.37.0. Everything the user listed on
  2026-09-30 is done, and the user confirmed it works on the desktop, the laptop, Edge and the phone:
  - one id per computer and the repair (0108);
  - one meaning of "not analysed" (0109), GLUE Home's analyses on screen (0110), folders removing their songs
    (0111);
  - the account's collections, one box each with its computers (0112);
  - profiles as the account's aliases, every device's (0113, 0114);
  - any browser on the computer using GLUE Home (0115).
- **User's account:** one collection `bf9246de…` (13k songs; the extra `c8f50116…` was to be deleted by the
  user), profile "404" (`b2df29dc692b488f`). Desktop computer `mmJiL_dh0fD6oQEo`, laptop `x6sky9M9_5GxUe0G`,
  desktop GLUE Home `F59kNS0nd11yw6ly`.
- **MCO:** the name was retired from the docs; lowercase `mco` identifiers stay (data depends on them). The old
  `joaopmanso/mco` redirect repo was to be deleted by the user (the token here can't delete repos).

## Waiting on the user
- Delete `joaopmanso/mco` on GitHub (Settings › Danger zone), if not done yet.
- Pick a profile per device and delete the extra ones on "Who's using GLUE?".

## Next
- **Bug:** on a phone's first load the library shows 8 songs, then the whole collection (timing; low priority).
- Events naming a profile (alias).
- M4 step 3: the rekordbox XML export with cues and grid (`vault/features/prepare.md`, `exports.md`).
