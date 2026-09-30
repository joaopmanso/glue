---
status: accepted
date: 2026-09-30
---
# 0109. "Not analysed" means one thing everywhere; failures that pass are retried, never kept

Amends [ADR 0103](0103-glue-home-analyses-its-computers-songs.md) (which failures GLUE Home keeps).

## Context
The user's desktop on 2026-09-30:
- **The counts disagreed.** The sidebar said "Not analysed yet 0", and Stats counted 903 songs with no usable
  analysis.
  - The sidebar used `needsAnalysis`, which counted any stored record at the current version as done,
    failures included.
  - Stats counted every song without a summary: failures, songs with no file, and other computers' songs.
- **385 songs had a stored failure,** so nothing ever tried them again:
  - 295 "took too long", from the worker time limit bug fixed in 0.33 (ADR 0107);
  - 2 "allocation failed", from the memory limit fixed in 0.33;
  - 88 m4a files the decoder can't read.

## Decision
- **One function says where a song stands** (`analysisState` in `src/core/library/analysed.ts`):
  - `done`: this computer's analysis at the current version, without an error;
  - `failed`: the file couldn't be analysed (a lasting error);
  - `waiting`: this computer has the file and no current analysis (or only a passing failure);
  - `elsewhere`: only another computer has the file;
  - `nofile`: no computer has a file for it.
- **Everything counts with it:**
  - the sidebar's "Not analysed yet" (waiting), the new "Couldn't analyse" (failed, shown only when there
    are some) and "No file linked" (nofile);
  - their views;
  - the analysis queues (the tab's and GLUE Home's);
  - Stats, whose "not graded" line now says why: waiting, couldn't analyse, no file, on another
    computer.
- **Passing failures are never stored** (`isTransient`: took too long, allocation failed, out of memory, the
  worker stopped).
  - GLUE Home and the tab try such a song again, up to three times per session, then leave it until
    GLUE Home or the tab restarts.
  - Such failures already stored count as `waiting`, so the 297 on the desktop are re-analysed with no
    migration.
- **Lasting failures stay** and show under "Couldn't analyse". "Analyse now" includes them (Try again).

## Alternatives considered
- A migration that deletes the stored passing failures: the same result, but it has to run on every GLUE
  folder and in GLUE Cloud's copy. Reading them as `waiting` needs neither.
- Retrying passing failures forever: a file that times out every time would run the queue in a loop.

## Consequences
- The sidebar, Stats, the analysis bar and the queues agree.
- A song that fails three times in a row for a passing reason waits for the next start, and isn't marked
  failed.
