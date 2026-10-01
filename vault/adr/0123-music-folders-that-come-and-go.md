---
status: accepted
date: 2026-10-01
---
# 0123. Music folders that come and go (network folders): their songs wait, nothing about them changes

Amends [ADR 0071](0071-song-info-written-through-glue-home.md) (song info written into files), [ADR 0103](0103-glue-home-analyses-its-computers-songs.md)
and [ADR 0109](0109-one-meaning-of-not-analysed.md) (passing failures), and
[ADR 0122](0122-stop-stops-everything-dropped-folders-found.md).

## Context
A tester's Mac, GLUE Home 0.38, 2026-10-01:
- every song is in network folders reached over Wi-Fi, which sometimes don't connect or mount;
- a popup kept saying "GLUE Home couldn't write the info into 47 songs' files: … needs GLUE Home 0.12 or later";
- GLUE Home said 3 songs were waiting to go into the library.

What the code did with a folder that isn't there:
- **Writing song info:** GLUE Home answered "that folder isn't there" (404), which the website took for a GLUE Home
  older than 0.12. It said so every time it tried.
- **The tab's analysis:** a file not found was marked **missing**, saved and synced. A share that's down turned every
  song looked at into "missing", on every device.
- **GLUE Home's analysis:** each song was a failure, retried 3 times a session, then left until a restart. Before
  that, each one searched every drive for the folder (ADR 0122).
- **A rescan** of the empty folder a Mac leaves where a share was mounted would mark all its songs missing.
- A read that drops mid-file could be decoded from a part and kept as "couldn't analyse".

## Decision
A music folder that can't be reached (missing, not allowed, or empty) is **away**, not gone: its songs wait, and
nothing about them changes.
- **Reachable** means its listing works and isn't empty (`platform.folderReachable`; GLUE Home: `/fs/list`).
- **Song info:** `writeUnwritten` asks once per folder (`reachable`) and skips the songs of an away folder; they stay
  unwritten.
  - The tab says it once per visit ("“X” isn't reachable right now…") and tries again every 3 minutes.
  - GLUE Home's own writes skip them the same way.
- **The tab's analysis:** a file not found in an away folder leaves the song as it is (not missing), said once.
- **GLUE Home's analysis:**
  - a folder set in its settings whose path doesn't exist throws `FolderAway`. Its songs are left for the next look,
    with no try counted, no failure and no drive search;
  - its window says "N wait for a music folder that isn't reachable right now".
- **A short read** (fewer bytes than the file has) and a browser `NotReadableError` are passing failures
  (`isTransient`): tried again, never kept.
- **A rescan that finds no songs where there were some** isn't applied. It says the folder looks empty or isn't
  reachable.
- **What's said is what's wrong:**
  - GLUE Home says why it can't reach a folder: not there (network, drive, moved), or not allowed (macOS privacy
    settings);
  - "needs GLUE Home 0.12" only shows for a GLUE Home older than that;
  - GLUE Home's window says why analysed songs still wait to go into the library (stopped, a GLUE tab that writes
    the library itself, or the error).

## Consequences
- A song deleted while its folder is away stays as it was until a rescan with the folder there.
- An empty music folder that had songs can't be emptied by a rescan; remove the folder instead.
