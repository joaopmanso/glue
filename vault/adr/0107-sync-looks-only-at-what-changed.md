---
status: accepted
date: 2026-09-29
---
# 0107. The shared sync looks only at the files that changed, and keeps its agreed copies file by file

## Context
- On GLUE Home 0.31/0.32 the user's GLUE Home crashed twice while analysing, and so did their Chrome
  (2026-09-29: "you need to start looking for a memory leak, likely started on v30 or 31… the initial change
  that had more than 4 song analysis was working fine").
- Measured (`tests/syncCost.test.ts`, a 13,000-song library of 513 files, ~10 MB): one push of 25 changed
  songs read **21 MB** and wrote **22.6 MB**, and parsed all of it as JSON.
  - Every push read every file of the collection, to compare it with the agreed copy.
  - The agreed copies of every file were one JSON file (`cloud/shared/<cid>.json`), read whole at each
    sync and rewritten whole after each entry pushed.
- ADR 0106 made pushes real time: every 25 analysed songs, every edit. That meant hundreds of MB of garbage
  every few seconds, next to 12 analyses (ADR 0105). 0.30 was fine only because it pushed at most hourly
  while analysing.
- The same cost fell on a tab doing its own sync (a browser without GLUE Home, or with GLUE Home down), 1.5 s
  after every save.
- Also found: since GLUE Home 0.3.1, a song's 2-minute limit was never cancelled when the song finished.
  Two minutes after any song started, every worker of the pool was ended, and the songs running on it
  failed ("took too long") or hung. With 12 at a time (0.30) that happened all the time.

## Decision
- **The agreed copy of each file is its own file** (`cloud/shared/<cid>/<path>`); `cloud/shared/<cid>.json`
  holds only the cursor and the clashes waiting. A file's agreed text is read when that file is looked at,
  and written when it changes. The old single file is split once, the first time it's read.
- **A sync is told which files may have changed** (`syncShared(place, changed)`):
  - GLUE Home: what its stores wrote since the last sync (`engine.takeWritten`, from `CollectionStore.onWrote`).
  - A tab: what the open collection's store wrote, and the files a settled clash wrote.
  - Every file is looked at on the first sync, every 30 minutes, when the duplicates are published (they're
    written around the store), and after a GLUE tab from before the engine held the lease. A failed sync
    puts back what it was to look at.
- **Pulling reads only the files an entry touches** (and their agreed copies), never the whole collection.
  The files a merge wrote go up in the same sync; files taken as they came don't.
- **Comparing songs ignores the order of their fields**, so two stores writing a song's fields in another
  order never send it back and forth.
- **A song's time limit ends only its own worker** (`AnalysisPool.analyze(file, mtime, limit)`), and is
  cancelled when the song finishes. Ending a worker ends what it was doing at once, never leaving it waiting.

## Alternatives considered
- Hashes of each file kept in memory, to skip unchanged files without reading them: every file would still
  be read to hash it.
- File dates from the disk: GLUE Home's local link doesn't give them cheaply, and the browser's handles only
  file by file.
- Keeping the agreed copies in memory between syncs: GLUE Home would hold a second copy of the whole
  collection all the time.

## Consequences
- One push of 25 songs on the 13,000-song library: 1.3 MB read, 0.66 MB written (was 21 MB, 22.6 MB). Taking
  it in on another device costs the same. `tests/syncCost.test.ts` holds it under 2 MB.
- A full look (at the first sync, and every 30 minutes) still reads every file, but writes only the cursor.
- The GLUE folder has a folder of agreed copies next to each collection's sync state (about the
  collection's size, as the single file was).
