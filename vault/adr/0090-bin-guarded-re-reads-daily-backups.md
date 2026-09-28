---
status: accepted
date: 2026-09-28
---
# 0090. A bin for playlists, guarded DJ-library re-reads, daily backups

Follows [ADR 0089](0089-edits-only-against-their-own-collection.md). It is phase 0 ("safety first")
of the plan for one shared collection (handoff 2026-09-28, "The user's fifth list").

## Context
When every playlist was deleted on 2026-09-28, nothing could bring them back:
- there was no bin;
- the daily backups planned in [mco-folder-backups](../features/mco-folder-backups.md) were never
  built;
- GLUE Cloud keeps only each device's latest copy.

The investigation also showed a second way to lose playlists. A DJ library that GLUE follows live
(ADR 0063, 0065) is read again whenever its file changes, and any playlist missing from a read was
deleted from GLUE at once. A read taken while Engine DJ is saving, or with a library's drive
unplugged, could delete almost all of them.

## Decision
- **Bin:**
  - `CollectionStore.deleteList` first keeps the list and everything inside it:
    `GLUE/bin/<pid>/<cid>/<ms>-<id>.json`, written at the next save before any file is removed.
  - It works whatever deleted the list: the user, edits from another device, GLUE Home, a DJ
    library.
  - **Recently deleted** (the sidebar, and the Playlists menu) lists the last 30 days. Restore puts
    a list back with its contents, under its old parent if that's still there, else at the top.
    Older entries are removed as they're found.
- **DJ-library re-reads:**
  - A playlist missing from a read is kept, and noted on the Source (`pendingGone`). GLUE's copy
    goes only if a read at least a minute later still lacks it, and then into the bin.
  - A read with less than half the playlists of the last one (with at least 4 before) is ignored
    whole. The last good read stays, so the next read is compared with it, not with the bad one.
    The library isn't marked as read, so it's read again at the next look, and GLUE says so once.
- **Daily backups:**
  - `autoBackup` writes `GLUE/backups/auto/<date>-<pid>.zip` once a day per profile: its data, not
    the songs GLUE keeps copies of. The last 14 of each profile are kept.
  - The open tab makes it 20 s after a collection opens. GLUE Home makes it when no tab holds the
    lease: 45 s after starting, then hourly, through its local link.
  - Restore is the existing "Restore a backup" (ADR 0026).

## Consequences
- A deletion, by anyone, can be undone for 30 days, and the GLUE folder can be rolled back up to 14
  days.
- A playlist really deleted in the DJ app leaves GLUE about a minute later (on the next read), not
  at once.
- Backups take a little space in the GLUE folder: the JSON zipped, roughly a few MB for 8k songs.
