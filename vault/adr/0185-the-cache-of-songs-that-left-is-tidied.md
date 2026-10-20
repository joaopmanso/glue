---
status: accepted
date: 2026-10-20
---
# 0185. The cache of songs that left is tidied

## Context
The user (2026-10-20): "why is my appdata library around 30Gb? we need to optimize this asap".

GLUE Home's cache (`%LOCALAPPDATA%\io.github.joaopmanso.gluehome\library`) was 33 GB, 31 GB of it in `d/` (each song's
details: the 1600 × 512 spectrogram and the analysis header, about 500 KB a song). Measured on the desktop:

| What | Details | Size |
|---|---|---|
| "Electronic", songs in it | 8,318 | 4.3 GB |
| "Electronic", songs no longer in it | 41,648 | 20.2 GB |
| "Non-Electronic" | 9,165 | 4.9 GB |
| "My collection", moved into "Electronic" (ADR 0102) | 7,927 | 4.0 GB |

- **The songs no longer there** were written between 2026-09-28 and 2026-10-03, while the collection was being set up:
  the move, the shared collection, songs made again under new ids. Some files had been analysed up to 25 times under
  different ids. Almost none were written after 2026-10-06.
- **Nothing ever removed a song's cache.** A song removed is gone for good: Recently deleted keeps playlists, not songs,
  and a song added again is a new song, analysed again.
- **`follow_moves`** copied a moved collection's cache to the collection it went into and left the original.

## Decision
GLUE Home's service tidies its cache 5 minutes after it starts, then daily (`service.rs` `tidy_cache`). It looks at
each kind kept per song (`s t w d p c`, under `<kind>/<profile>/<collection>/<shard>/<id>.<ext>`):
- **A moved collection** (`movedTo` set, its files followed: `m/<p>/<c>.done`): all of its cache goes.
- **Any other collection:** a file goes when its song id isn't among the collection's songs, read from the collection's
  `tracks/*.json` (every device's songs, in a shared collection).
- **What stays:**
  - a collection whose songs can't all be read, or that has none;
  - a collection with no `collection.json` in this GLUE folder (another GLUE folder's);
  - a file written in the last two days (a song just analysed whose record isn't saved yet).
- **Activity says what it freed:** "Cache tidied: 24.3 GB of songs no longer in GLUE removed (N files)".

## Alternatives considered
- **Removing a song's cache when it's removed:** songs leave in several ways (removal, joins, a shared sync from
  another device, a moved collection), and the cache from before this change would still stay. The sweep catches all
  of them, then and now.
- **Smaller details** (a coarser spectrogram, or details kept only for songs recently opened, made again on demand):
  this would shrink the remaining ~9 GB. But it changes the song page and the verdict re-check (ADR 0166 reads the
  details), so it's left as the user's choice.

## Consequences
- **The desktop's cache:** from 33 GB to about 9 GB at the first tidy after 0.75.0. What remains is about 500 KB per
  song.
- **A song whose record was lost and later recovered** (a damaged shard put right) is analysed again: its cache went
  with it. A shard that can't be read stops the tidy of that collection, so this needs a file that reads as valid but
  is missing songs.
