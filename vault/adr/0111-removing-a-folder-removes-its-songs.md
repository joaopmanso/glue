---
status: accepted
date: 2026-09-30
---
# 0111. Removing a music folder removes its songs; songs left with no file are offered once

Amends [ADR 0100](0100-one-row-per-song-and-own-copies.md) (removing a music folder).

## Context
- The user's desktop showed 485 "No file linked" songs with two music folders and no DJ libraries
  (2026-09-30).
- 484 of them came from F:\preparation and F:\temp, removed the day before. Their files still exist.
- ADR 0100 meant removing a folder to go through removing songs, but `removeFolder` only marked the
  folder's songs as having no file, and left them.
- The song page told every such song that it "came from an imported library".
- The user chose: removing a folder removes its songs, and the existing leftovers are offered once.

## Decision
- **Removing a music folder removes this computer's copies in it**, the same way as removing songs:
  - a song another computer also has stays, with that computer's copy;
  - the confirmation says what goes with them (`removalImpact`, `describeRemoval` in
    `src/core/library/removal.ts`), for example "4 songs, 1 rated, 1 in 1 playlist".
- **Songs left with no file** (`orphans`: no file here or elsewhere, and nothing that could link them again:
  no music folder, DJ library, import path or file key) **are offered once per collection**:
  - a bar says how many there are;
  - "Remove them" makes a backup first (`backups/pre-orphans-….zip`), then removes them;
  - "Keep them" doesn't ask again (pref `orphans.asked.<collection>`).
- **The song page says why a song has no file:** it came from a DJ library, it was added on its own, or its
  music folder was removed.

## Alternatives considered
- Keep the folder's songs, marked as having no file (what happened): the collection fills with songs that
  can't be played, and a folder added again brings them back as duplicates.
- Remove the leftovers without asking: they carry ratings, notes and playlist places the user may want to
  keep.

## Consequences
- Removing a folder is final for this computer's copies, apart from the backup. Adding the folder again
  brings the songs back as new songs.
- The desktop's 484 leftovers go when the user answers the bar, with a backup.
