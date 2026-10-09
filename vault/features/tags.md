---
status: shipped
milestone: M2
updated: 2026-10-09
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
- **Tags narrow (2026-10-09, the user: "lossless -> dubstep --> chill"):** in the Tags column's filter and Filter ›
  Tags, the songs shown have every tag ticked, and only the tags those songs have are offered (`view.tagAny` false,
  `FilterList` counts over the songs left). **Any of them** (shown once two are ticked) switches to the songs with any.
  The sidebar's tag › **Show only it here** adds tags the old way (any of them, every tag offered:
  `view.toggleAnyTag`). The chips above the table join tags with "and" / "or".
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

## Right-click (2026-09-26, [ADR 0067](../adr/0067-one-context-menu.md))
- **A tag in the sidebar:** Show its songs, Show only it here, put it on or take it off the selected
  songs, Rename…, Delete….
- **A tag chip in a row:** "Show only tag ‹name›". A song's menu has Tags….

## The pop-up fits the window (2026-09-28)
- With many tags (a library's Grouping, #hashtags and My Tags add up), the pop-up ran past the
  bottom of the window and its box didn't cover what was cut off.
- Now it's at most the room there is (520 px). It opens above what opened it when there's more room
  there. Its chips and its list scroll inside.
