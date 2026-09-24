---
status: shipped
milestone: M2
updated: 2026-09-25
adrs: [0032, 0029]
---
# Tags

## What it does
Label tracks and playlists with any number of tags ("Peak", "Vocal", "Warm up"…). Tags already in
your files or DJ library count straight away; new ones are made by typing them.

## Behaviour
- **Tagging tracks**: the Tags column (click a row's tags), "Tags…" in the selection bar (several
  tracks at once; a tag on only some of them shows dashed, click it to put it on all), the track
  page, or drag tracks onto a tag in the sidebar.
- **Tag editor**: chips with ×, type and press Enter (or comma) to add or make a tag, Backspace in
  the empty box removes the last one, tick tags in the list. Changes save at once.
- **Found tags**: Grouping, rekordbox My Tags (`/* a / b */` in the comment) and `#hashtags` in the
  comment. They stand in until you edit a track's tags ([ADR 0032](../adr/0032-tags.md)).
- **Sidebar › Tags**: every tag with its track count; click to see its tracks; ⋯ renames (merges
  into an existing tag of that name) or deletes it everywhere; "+ Tag" makes one (and puts it on
  the selected tracks, if any). The first 12 are shown, then "Show all".
- **Playlists**: ⋯ › Tags…, or "+ Playlist tags" in the playlist's insights.
- **Filters**: Filter › Tags / Genre, or ▾ in the Tags, Genre, Format and Quality headers, which
  also sorts. "No tags" / "No genre" are values too. Search matches tags.
- **Playlist insights** (Insights button on a playlist, remembered): length, tempo flow, keys and
  harmonic mixes, quality, and a Venn diagram of up to three tags (click tags to choose them).
- **Playlist builder**: see [automatic playlists](auto-playlists.md).

## Tests
- `tests/tagging.test.ts`: tidying, found tags, Venn regions, insights, tag scoring.
- e2e "tags: on tracks and playlists…": editor, several tracks, sidebar drop and view, header
  filters, playlist insights and Venn counts, builder "Only these", overview scrubbing.

## Later
- Write tags back to files / DJ apps (after v1 write-back, ADR 0010).
- Engine DJ, Traktor and Serato imports don't read a Grouping field yet.
