---
status: accepted
date: 2026-09-29
---
# 0106. Keep the shared collection in GLUE Cloud as a snapshot and a log of changes

Supersedes the pacing in [ADR 0105](0105-pace-cloud-pushes-and-analyse-more-at-once.md). Its other half
(GLUE Home analyses more songs at once) stands.

## Context
- GLUE Cloud stored a shared collection (ADR 0094) as its files, one D1 row per file. A file of songs (a
  shard) holds up to a few hundred songs, and each push rewrote every file it changed, whole. Each file
  cost about 3 rows written (the row, its primary key, the `rev` index).
- A library being analysed changes every shard over and over: about 90,000 rows in a day, against the
  free plan's 100,000 (ADR 0105).
- 0105 paced the pushes (at most once an hour while analysing). The user rejected that, on 2026-09-29:
  - "why are we waiting an hour? it's the same data at the end of the day so just sync it as real time
    as possible. we even have access to a realtime server";
  - "is there a better way to store this information rather than rows on a table?"
  - They agreed to the design below ("go for it").

## Decision
- **The shared collection is a snapshot and a log** (migration `0008_log.sql`, `cloud/src/shared.ts`).
  - **The log** (`shared_log`, `WITHOUT ROWID`, one row per push): an entry holds what changed.
    - From a file of songs, only the songs that changed (a changed song whole, `null` for one gone); any
      other file (a playlist, the collection's settings) whole; a deleted file as deleted
      (`src/store/shared/engine.ts`, `diffFile` / `applyChange`).
    - Gzip + base64, never opened by the Worker.
    - One push is one entry, however many songs, up to 1.8 MB packed; a bigger push is split into several.
  - **The snapshot** (`shared_files`, as before): the collection's files, complete at `floor`.
  - **Ordering:** an entry lands only on the collection's latest revision. The entry and the new revision
    go in one transaction; a push based on an older revision gets `stale`, and the device pulls, merges
    (merge3, as before) and pushes again.
  - **Checkpoints:** after 300 entries past the floor, GLUE Cloud asks the device that pushed to fold the
    log into the snapshot.
    - The device writes the files the log touched (`/touched`), as they are at its revision (`/checkpoint`),
      then moves the floor (`done`), and the log up to it goes.
    - A file already written by a later checkpoint is never overwritten by an earlier one.
    - Each entry sets songs and files to their new values, so replaying the log over a snapshot that is
      part-way newer still ends right.
  - **Pulling:** a device reads the log since its cursor (`/log`). A device behind the floor (a new device,
    or one away for long) reads the snapshot's files first (`/changes`, `/bundle`, as before), then the log.
- **Sync is as real-time as we can make it.** Each change is pushed within seconds: edits 1.5–2 s after
  they're saved, analyses every 25 songs. The signaling room tells the account's online devices at once
  (as before), and they pull. The pacing of 0105 is gone.
- **The quota** is kept per collection (`shared_collections.bytes`, added to on each push, recounted at a
  checkpoint). A push no longer scans every stored file (rows read).
- **Moving over:**
  - What each collection had becomes its snapshot, complete at its current revision (`floor = seq`).
  - A device's sync state from before still works (its cursor is the floor, its agreed copy the snapshot).
  - A GLUE from before the log gets `410` on the old `/push` ("reload this page, or update GLUE Home"), so
    nothing it sends goes around the log.
  - The old `sync_*` tables stay, as decided on 2026-09-29.
- **Tests run the real server code:** `tests/sharedCloud.ts` puts `cloud/src/shared.ts` on an in-memory
  SQLite with the real migrations (`tests/d1.ts`). It's used by the sync engine's unit tests and as GLUE
  Cloud in the shared, phone and GLUE Home end-to-end tests, in place of three hand-written stand-ins.

## Alternatives considered
- **Cloudflare R2 (object storage) for the log:** 1 million writes a month free, but a new service to turn
  on in the account. D1 at about 2 rows a push is enough.
- **A Durable Object holding the collection:** its storage is billed like D1 (rows), and it would open and
  merge the data. The Worker is kept out of the data (10 ms of CPU on the free plan).
- **Relaying changes only through the signaling room, with no storage:** an offline device would miss
  them.
- **Pacing (0105):** rejected by the user.

## Consequences
- A full analysis of a 13,000-song library: about one entry per 25 songs (≈ 520), plus a checkpoint or
  two of the files touched (up to ~1,500 rows each). A few thousand rows in all, instead of about 80,000.
- Edits reach the other devices within a few seconds, analysing or not.
- Two devices changing different songs of one file no longer rewrite each other's whole file.
- Old tabs and GLUE Home before 0.31 can't push to shared collections until they're updated.
