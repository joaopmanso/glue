---
status: accepted
date: 2026-09-26
---
# 0059. Indexes over the collection, rebuilt by per-kind change counters

Phase 1's first step ([ADR 0057](0057-keep-the-stack-fix-the-architecture.md)).

## Context
The user's `?perf` report (2026-09-26) showed a 1.7 s click and a 1.1 s form submit. The same
library, opened from a copy of their GLUE folder and clicked through step by step (`PERF_FOLDER`,
below), gave:

| Step | Time |
|---|---|
| Opening the Auto playlist builder | 2.2 s |
| Generating a playlist | 0.67 s |
| Opening Duplicates | 0.8 s |

The causes were all the same kind: a question about one track answered by a scan of everything.
- **"What do the DJ apps say about this track?"** Every import's track list was searched with
  `find()`, for every track. That's about 100 million comparisons per candidate list, and the Auto
  dialog recomputed the list on every library change.
- **"Which playlists is it in?"** Every playlist's items were searched, three times per row of the
  Duplicates view.
- **The row list** rebuilt the DJ values of every import on every call.

## Decision
- **The store counts changes by kind:** `CollectionStore.rev = { tracks, analysis, lists, sources }`,
  bumped by every `put*` and `delete*`.
- **What's shown but not saved goes through store methods too.** Other devices' songs (ADR 0042) and
  TO BE SORTED (ADR 0051) use `putShown`, `dropShown`, `showItems` and `touchTracks`. They bump the
  counters but, as before, don't count as the user's edits (nothing to sync).
- **Indexes** are pure functions in `src/core/library/indexes.ts`:
  - `djValues(sources)`: per track, the first import that has a BPM, key or rating;
  - `listsByTrack(lists)`: the playlists each track is in.
- **`lib.memo`** keeps each index with the store and counter it was built from, and rebuilds it only
  when that counter moved:
  - `lib.djIndex()` / `lib.djOf(id)` (imports);
  - `lib.listsContaining(id)` (lists).
  They're read by the row list, the automatic playlists and the Duplicates view.
- **The Duplicates view draws 40 groups, then 60 more** each time its end comes near. A track's
  "show duplicates" draws down to its group first.
- **Measuring on a real library:** `PERF=1 PERF_FOLDER=<GLUE folder> npx playwright test e2e/perf.spec.ts -g "real"`
  copies the folder's JSON files (no audio, no cloud copies) into a test browser. It clicks every view,
  list, tag, sort and search, a track page and the Auto dialog, and lists the slowest steps with the
  long frames they caused. The folder itself is only read.
- **The `?perf` report** keeps only real clicks and keys (not mouse movement), notes where the page
  was at each long frame, and matches each long frame with the interaction it answered.

## Alternatives considered
- **One `$state` signal per track (SvelteMap):** 50k signals, and the store is shared with pure code
  that runs outside Svelte.
- **Indexes kept up to date change by change:** more code. A rebuild in one pass takes 5 ms at 8.8k
  tracks, and the counters make it rare. The row index (next step) does update per track, because
  it changes all the time.

## Consequences
On the user's library (8.8k tracks, headless Edge):

| Step | Before | After |
|---|---|---|
| Opening the Auto builder | 2,176 ms | 103 ms |
| Generating an auto playlist | 673 ms | 143 ms (candidates 558 → 9 ms) |
| Opening Duplicates (421 groups) | 797 ms | under 100 ms |
| A row-list computation | 4 ms | 2 ms average |

- **Any new code that changes the store's Maps must go through a store method**, or the counters
  (and every index) go stale.
- **Bug fixed along the way:** when analysed songs had no fingerprint and their files couldn't be
  read, the duplicate scan and the fingerprint filling started each other over and over, re-reading
  every fingerprint each time. Now they only rescan when a fingerprint was made.
