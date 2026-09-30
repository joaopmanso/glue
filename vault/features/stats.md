---
status: shipped
milestone: M3
updated: 2026-09-30
adrs: [0067, 0109]
---
# Stats

## What it does
Numbers and simple charts for the whole collection, or for anything in the sidebar (a playlist or
folder, a tag, a music folder, a DJ library or one of its playlists, a device, a Library entry), or
for the selected songs.

## Behaviour
- **Opened from:**
  - the chart button next to the collection's name (`#stats-btn`);
  - "Stats…" in the right-click (and ⋯) menus of:
    - Library entries, playlists and folders, tags, music folders;
    - DJ libraries and their playlists;
    - devices (in a merged collection);
    - several selected songs.
- **Shows:**
  - **tiles:** songs, playtime (with how many have no length), size on disk, artists, albums, labels,
    genres; for the whole collection, playlists and folders;
  - **quality:** a bar of GLUE's verdicts (good, info, caution, suspect, not analysed); the lossless
    share; formats;
  - **tempo:** songs per 5 BPM, the range and the median (GLUE's BPM, else the DJ library's); keys
    (in the notation chosen);
  - **top 10** genres, artists and labels (the same name in any case counts once);
  - **years of release** (and per decade); songs **added to GLUE** per month;
  - rated, tagged, and without a file here.
- Esc, ×, or a click outside closes it.

## How it works
- `core/library/stats.ts` `stats(StatTrack[])`: pure.
- `lib/view` `tracksFor(sel)`: a sidebar entry's songs (also what the table shows, before filters and
  search).
- `ui/library/StatsDialog.svelte` (`view.statsFor`), mounted in `App.svelte`.

## Acceptance
- [x] The collection from its button; a playlist, a Library entry and the selection from their menus.
- [x] The numbers match the songs (unit tests).

## Tests
- Vitest `tests/stats.test.ts`.
- e2e `library.spec` "stats…".

## Limits & open questions
- No charts over time beyond "added per month" (plays aren't known to GLUE).
- Events (Batch 7) will get "Stats…" too.

## Why songs aren't graded (2026-09-30, [ADR 0109](../adr/0109-one-meaning-of-not-analysed.md))
- `Stats.ungraded`: waiting, couldn't analyse, no file, on another computer (`#stat-ungraded`), counted with
  `analysisState`, as the sidebar counts them.
