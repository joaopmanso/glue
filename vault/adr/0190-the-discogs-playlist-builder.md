---
status: accepted
date: 2026-11-01
---
# 0190. The Discogs playlist builder: from records or tracks, refined, into a playlist to arrange

## Context
After ADR 0189's live-rules auto playlists, the user (2026-11-01): "it's not really what I want, it should be more like
the auto playlist from the collection. let me select 1 or more tracks/albums and create a playlist based on that, allow
me to refine, number of tracks, multiple tracks from same record or not, include compilations, specific artists, etc.
that would create a playlist similar to the ones under playlist, where I can drag and drop songs, remove tracks".

The library's builder (`autoplaylist.ts`) scores by tempo and key, which vinyl tracks don't have.

## Decision
- **A builder of its own** (`src/core/library/discogsBuild.ts`, pure). The state is in `src/lib/discogsBuild.svelte.ts`
  and the dialog in `DiscogsBuilder.svelte`, laid out like the library's builder.
  - **The pool:** each track of the collection's records (its song here, else vinyl; a record without a tracklist,
    the whole record or its songs). With "Also songs from your library", the songs on no record join it.
  - **The seeds first,** then tracks picked one by one, the best few weighted to the top ("Surprise me"). The score is
    against what the seeds have together:
    - styles above all, then genres;
    - the same label, years near;
    - the seeds' artists, or those asked;
    - BPM when both have it.
  - **The rules:**
    - how many tracks;
    - tracks per record (1, 2, any);
    - compilations;
    - artists and styles (Prefer or Only these);
    - labels, formats, years;
    - vinyl, digital or both;
    - avoiding tracks already in the user's Discogs playlists.
  - **Short of tracks:** the rules relax in steps (other years, other styles, more of the same records), each said.
  - **Each track can be swapped** (↻, `replaceOne`) or taken out. **Save** makes a normal Discogs playlist (ADR 0189:
    drag, move, remove), the options kept on it (`auto`).
- **Where it starts:**
  - **The Discogs view:** ticked records › **Build a playlist from these N** (with none ticked, **+ Auto**: the rules
    alone), or a record's menu › **Build a playlist from this record**.
  - **A Discogs playlist:** ticked rows › **Build from these N** (none: **Build a playlist like this**), or a row's
    menu › **Build a playlist from this track**.
- **The live-rules auto playlists** (ADR 0189) aren't made any more; the user's existing ones still show and can be
  saved as playlists. This supersedes ADR 0189's "+ Auto" line; the rest stands.

## Alternatives considered
- **The library's builder with Discogs tracks fed in:** its score is tempo and key. With neither, it would rank by
  rating alone.
- **Keeping live rules as the auto playlist:** the user wants a playlist to arrange, made once, not a list that changes
  by itself.

## Consequences
- **What's on a record decides:** style, label and year, not sound. Records the user hasn't tagged by style on Discogs
  lean on genre and label.
- **The pool is the collection's tracks:** a record whose tracklist isn't read yet counts once, as the whole record.
