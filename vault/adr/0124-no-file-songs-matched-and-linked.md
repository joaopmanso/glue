---
status: accepted
date: 2026-10-01
---
# 0124. Songs with no file are matched to the library's songs, with a certainty, and linked in bulk

Amends [ADR 0063](0063-dj-libraries-browsed-live.md) (a DJ library read again) and
[ADR 0111](0111-removing-a-folder-removes-its-songs.md) (songs with no file).

## Context
The user, 2026-10-01: an Engine DJ import's playlists name old duplicates that have since been removed. They show
under "No file linked", though most of those songs are in the library. Title, artist, album and length are known,
so the match can be found. As with duplicates, a percentage should let many be linked at once.

An import already matches a record to a song by its path, or by the same file name and size. A removed duplicate
usually has neither (another folder, "(1)" in its name, another format).

## Decision
- **Matching** (`core/library/relink.ts`): each song with no file is compared with the library's songs that share
  a title word or a file name (each duplicate group by its best copy).
  - Points for: the same or similar title (read from "Artist - Title" when the import only had a file name), the
    same file name (without " (1)" or "copy"), the same or similar artist, length (±1.5 s best; more than 6 s
    apart counts against), album and size.
  - A different version (instrumental, remix, live…) caps it at 40 %.
  - Two candidates within 3 points of each other lower the best by 10.
  - At most 3 candidates are kept, from 50 %.
- **"No file linked" is a page** (`RelinkView`):
  - each song with no file, its best match and its certainty, and why ("same title · same artist · same length");
  - another candidate can be chosen;
  - "Link" one, "Not this one" (`meta.relinkNo`, never offered again);
  - a certainty filter (80, 90, 95, 99 %), "Tick all shown" and "Link N…". A bulk link leaves out matches that may
    be wrong (another version, another artist, another song as good) unless they're included;
  - the songs with no match are listed below, and "Show them as a list" gives the usual table.
- **Linking** (`store/merge.ts` `linkRecords`):
  - the song with no file folds into its match (`absorbTracks`: playlist places, rating, notes, tags, Prepare, the
    DJ libraries' records and cues);
  - its record's path is kept on the match (`Track.aka`, per computer in a shared collection), so the next read of
    the DJ library (Engine DJ is followed live) takes the record for that song instead of making the song with no
    file again.

## Consequences
- Thousands of removed duplicates can be linked with a filter, a tick and a confirmation.
- A link made by mistake isn't undone by itself. The song keeps the record (`aka`) until it's removed from the
  library.
