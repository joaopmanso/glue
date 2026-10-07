---
status: accepted
date: 2026-10-07
---
# 0162. With GLUE Home running, the page is only its screen: it starts none of the library's work

## Context
ADR 0104 made GLUE Home's engine the library's writer in Home mode, and ADR 0153–0160 moved its work into Rust: the
analysis, the shared sync, the backups, the song info written into files, the service. The page still decided it per
job, and only once its store was attached to the engine (`engineClient.active`), a second or two after the collection
opened. Several jobs never asked at all.

On 2026-10-07 the desktop's page froze a few seconds after opening, every time (the user: "just opening the site and
waiting breaks it"). An Edge network log (5,785 requests to GLUE Home in 24 s) and a reproduction with the user's
collection and sync state showed what the page did, all through GLUE Home's disk, one request at a time, at once:
- **a full shared sync of its own**, started on opening before it was attached (with GLUE Home's engine syncing too:
  61 clashes waiting, most of them both writing the same songs' length and format);
- **its own daily backup** (every file read to zip), which GLUE Home makes since 0.59;
- **a walk of the music drive three folders deep** for DJ libraries (about 4,000 listings);
- the verdicts re-checked, the open-time repairs (`tidyTracks`, `joinCopies`), the song info written into files.

Once its first sync was done the page stopped answering for good. The user: "the page shouldn't run anything if GLUE
Home is running. It's just a UI. GLUE Home IS THE APP. Browser is fallback."

## Decision
- **One question, answered before the collection opens:** `engineClient.runs` (`lib.homeRuns()`): GLUE Home's engine
  answered `hello` in Home mode. The page asks it for this computer before opening a collection (`lib.loadOpts`), so
  it's known first; it stays known while the store is closed and opened again, and turns false when GLUE Home stops
  answering (or Home mode ends), when the page carries on by itself.
- **While it's true the page starts none of the library's work:** no shared sync (`shared.place()`), no analysis of
  its own (`analysisElsewhere.active`), no daily backup, no verdicts re-checked, no `tidyTracks` or `joinCopies`, no song
  info written into files (`writeInfo`), no walking the music folders for DJ libraries (the libraries GLUE Home follows
  are still listed). It shows, and sends what the user does to GLUE Home's engine.
- **What GLUE Home doesn't do yet moves into it next**, and the page stops doing it then: finding duplicates (the page's
  worker still matches fingerprints and publishes its file), following DJ libraries live (`djWatch`, a file date a few
  seconds), finding new DJ libraries in the music folders, re-checking verdicts, the open-time repairs. Until then those
  last three simply don't run with GLUE Home (no new library suggested, older verdicts kept, repairs waiting).
- The engine feed's answer is checked (`changes` an array) before it's used: a failed answer crashed its loop.

## Alternatives considered
- **Waiting for `engineClient.active` in each job:** the race that started the sync, and every new job must remember.
  One question known from the start is the rule.
- **Making the page's jobs cheaper:** they'd still run twice (the page and GLUE Home), and write against each other.

## Consequences
- In Home mode the page's load on GLUE Home is what the user looks at: the files it reads to show, the cache's
  overviews, the songs played.
- A new background job in the page asks `lib.homeRuns()` first.
- Until the remaining jobs are in GLUE Home: no new DJ library is suggested from the music folders with GLUE Home
  running (one can still be imported by hand), and verdicts made by an older rule stay as they were there.
- `e2e/homemode.spec.ts` "with GLUE Home running, it is the app" holds it: no sync request from the page.
