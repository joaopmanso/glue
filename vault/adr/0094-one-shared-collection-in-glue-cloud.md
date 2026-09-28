---
status: accepted
date: 2026-09-28
---
# 0094. One shared collection in GLUE Cloud, the same on every device

Supersedes, once every device has moved over (phase 4 of the plan):
- [ADR 0040](0040-cloud-sync-and-merged-collections.md)'s per-device copies, "last change wins";
- [ADR 0042](0042-merged-collection-in-the-local-library.md)'s overlay merged on the fly;
- [ADR 0043](0043-batched-sync-and-progressive-loading.md)'s per-device snapshots.

This is phase 2 of the [plan](../product/plan-shared-collection.md).

## Context
The user (2026-09-28): "A collection is something that should be the same no matter the device
that's browsing it. It merely gets more or less items along the way." Chosen with them: one copy in
GLUE Cloud; ask when changes clash; a computer is its GLUE Home (ADR 0091).

Before this, each device uploaded its own copy and every viewer merged the copies its own way. Views
differed, DJ libraries and duplicates never crossed, and one bad merge deleted every playlist
(ADR 0089).

## Decision
- **GLUE Cloud** (migration 0006, `cloud/src/shared.ts`) keeps each shared collection as the files
  the GLUE folder has: `collection.json`, `tracks/<xx>.json`, `analysis/<xx>.json`,
  `lists/<id>.json`, `sources/<id>.json`, `events.json`. They are stored gzip + base64, one row
  each, never opened by the Worker.
- **Revisions:** every push takes the collection's next revision (`UPDATE … RETURNING seq`), and each
  file it writes carries it.
  - `changes?since=` lists what changed after a device's cursor (an indexed query, metadata only).
  - `bundle` sends contents, many at a time.
- **A push lands only on the revision it was based on** (a conditional upsert, `WHERE rev = base`; 0
  for new). The others come back as `stale`: the device pulls them, merges three ways (base, its
  own, the cloud's) and pushes again. The Worker never merges.
- **Deletions are tombstones** that keep their last contents for 30 days (`bin`).
- **After a push,** the signaling room tells the account's online devices (`{type: 'shared',
  collection, seq}`), and they pull at once. Otherwise they check now and then.
- **What stays per computer lives inside the shared records,** written only by that computer:
  - where a song's file is: `copies[computer]` (music folder, path, size, date, status, info not yet
    written into the file);
  - each computer's analysis of its copy;
  - its music folders (`rootsBy[computer]`);
  - the DJ libraries it follows (`Source.computer`).

  Loading turns this computer's entries into today's fields (`rootId`, `relPath`, `status`…), so
  the store and the UI stay as they are. Songs only on other computers become `remote` rows
  pointing at a computer that has them (the Phase 2 projection, `src/core/shared/project.ts`).
- **Merging** (`src/core/shared/merge3.ts`, pure):
  - track and list fields merge field by field;
  - playlist items merge three ways;
  - per-computer parts are that computer's;
  - collection tags and genres merge as unions;
  - a real clash (both changed the same thing differently) keeps the cloud's value and records the
    clash for the prompt (phase 3).
- **One engine** (`src/store/shared/engine.ts`, no DOM) pulls and pushes through an adapter. A GLUE
  tab and GLUE Home's service page use the same code; the lease (ADR 0087) decides which runs.
- **Local-only collections don't touch any of this** (ADR 0092).

## Consequences
- Every device shows the same collection. Adding a device adds songs to it, not a copy of it.
- The Worker stays simple and cheap: row reads and writes, no merging.
- Limits [UNVERIFIED D1 free tier]: about 1.2k rows and 4 MB for 8k songs, about 2.5k rows and 20 MB
  for 50k. Pushes of analyses are held back so the daily write limit isn't reached.
- Delivered in steps: 2a the cloud side (this commit), 2b the pure projection, merge and engine,
  2c the site using it for new shared collections, then moving existing ones over (phase 4).
