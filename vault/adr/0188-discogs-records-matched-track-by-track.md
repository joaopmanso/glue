---
status: accepted
date: 2026-10-31
---
# 0188. Discogs records matched track by track, and by hand on the songs

## Context
After ADR 0187, the user (2026-10-31): "I want to see my discogs collection on Glue to match it on Glue … we should be
able to easily match them automatically." Matching a record by its title as the songs' album (ADR 0187) misses records
named differently in the library, singles named after another track, and compilations. And what it still misses
couldn't be put right by hand.

## Decision
- **GLUE Home reads each record's tracklist** (`/releases/{id}`, once: a record's doesn't change) after the list and the
  covers, at the shared pace, and keeps it on the record:
  - **`tracks`:** `[{ p: position, title, artists (a compilation's), d: seconds or null }]`, headings and index tracks
    left out (`discogs.rs` `tracks_of`);
  - **None:** `[]` when Discogs has none (404). Absent means not read yet.
- **Matched track by track** (`discogsMatch.ts`). A song matches a track when:
  - its title and version are the track's (`norm` and `versionOf`: an "Original Mix" isn't a "Remix");
  - it's by the track's artist or the record's (a compilation with no track artists: on its label);
  - its length is within 8 s of the track's, when both are known.

  A record says how many of its tracks were found ("In GLUE: 3 of 4 tracks"), each track with its song. Without a
  tracklist (yet), the title match of ADR 0187 stands.
- **By hand, remembered on the songs** (`Track.discogs`, `Track.discogsNo`; `lib.linkDiscogs`), synced like any song
  field:
  - **A song chosen for a record** (Choose…: a library search, Add) is that record's, whatever the automatic match says,
    and isn't matched to another.
  - **A song taken off a record** ("Not on it") is never matched to it again.
  - **The panel:** a record's tracks with the songs found for them, its songs (each can be taken off) and the search.

## Alternatives considered
- **Links in a file of their own** (record → songs): song ids are a collection's, so it would be a collection file to
  sync, merge and keep tidy. On the song, it travels and goes with it.
- **A review queue with certainties** (like "No file linked"): a record's tracks either match or don't by these rules,
  and the panel shows exactly which. A certainty would add a number to second-guess.
- **Tracklists on demand only** (when a record is opened): the "In GLUE" counts and the filters need every record's.
  Reading them once in the background costs a request a record, once.

## Consequences
- **A first read of a large collection** takes longer: about a second a record for its tracklist, after the covers.
  The list and the title matches show at once; track matches follow.
- **Two song fields:** `discogs` and `discogsNo` (release ids).
- **Wantlist records match too:** a wanted record you already have digitally shows it.
