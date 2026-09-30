---
status: accepted
date: 2026-09-30
---
# 0121. An optional main music folder: among duplicates, its copy is the best, after lossless

Amends [ADR 0120](0120-one-copy-shown-and-used.md) (which copy is the best).

## Context
The user, 2026-09-30: of four music folders, "Music Collection" is the main one. A song that has a lossless copy
there and in another folder should keep the main folder's copy, so the others can be removed. It's for managing
duplicates, so it isn't mandatory. And "lossless will always take priority": a lossless copy in another folder beats
an MP3 in the main one.

## Decision
- **A collection may have one main music folder** (`meta.mainRoot`, synced with the collection like its other
  settings).
- **Set it from a folder's right-click menu** ("Make it the main folder" / "Not the main folder any more"), or from the
  Duplicates page (a short explanation and a folder menu, shown when there's more than one folder). The sidebar marks
  it "main".
- **The best copy of a duplicate group** (`copyScore`, in `core/library/duplicates.ts`), in order:
  1. genuine before suspect (the verdict's grade);
  2. lossless before lossy;
  3. the main folder's copy;
  4. resolution, or bitrate.
- A copy the user made the best ("Make it the best") still wins.
- Changing the main folder chooses the best copies again, and playlists follow (ADR 0120).

## Consequences
- With "Music Collection" as the main folder, a bulk clean-up keeps its copies and moves or deletes the other folders'
  copies of the same recordings, unless a better-graded or lossless copy is elsewhere.
