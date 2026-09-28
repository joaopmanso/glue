---
status: shipped
milestone: M3
updated: 2026-09-28
adrs: [0071, 0072, 0051, 0024, 0082]
---
# Song info and covers

## What it does
Edit a song's title, artist, album, genre, label, year, grouping and comment: in the table, for
several songs at once, or on its page. GLUE keeps the change at once. GLUE Home writes it into the
music file, so every DJ app sees it. Songs show their cover, from their files' tags: in a Cover
column, and on their page.

## Behaviour
- **Editing in the table**
  - F2, or a slow second click on the selected song, edits the cell under it in place.
  - Enter keeps the change, Esc drops it, Tab keeps it and goes on to the next column that can be
    edited (Shift+Tab back).
  - A double-click still opens the song.
- **"Edit info…"** (the song menu; F2 with several selected; the track page's "Edit info" button)
  opens a dialog:
  - For several songs, fields that differ show "(mixed)", and only the fields changed are applied.
  - Genre, label and artist suggest the collection's values.
  - A line says where the change goes (into the files now, when GLUE Home runs, or GLUE only).
- **The rules**
  - A title can't be emptied; other fields can.
  - An edited field is never filled in again from the file or a DJ library, even when emptied.
- **Into the file ([ADR 0071](../adr/0071-song-info-written-through-glue-home.md)):**
  - Only songs in this computer's music folders (or its incoming folder).
  - In Home mode, at once. Otherwise when GLUE Home connects, or when the collection next opens in
    Home mode.
  - Until then, a dot after the title, and a line on the track page, name the fields not in the file
    yet.
  - Songs added one by one, other computers' songs and merged views are GLUE only (merged views
    can't be edited).
  - A failed write keeps the edit, says so, and tries again on the next connect.
- **Nothing is analysed again** after a write: the song's size and date, and its stored analysis,
  follow the file.
- **Covers ([ADR 0072](../adr/0072-covers-from-the-tags.md))**
  - **The Cover column:** 26 px; hovering shows the 320 px picture beside it. It's after Overview,
    and can be hidden or moved like any column.
  - **The track page** shows it in the header.
  - Songs without one show nothing.
  - Songs analysed before covers existed get theirs as they come on screen, from their tags only.

## How it works
- **Editing**
  - `core/library/tags`: `INFO_FIELDS`, `fillInfo` (used by analysis, quick tags and imports).
  - `Track.edited`, `Track.unwritten`.
  - `lib.editInfo`, `lib.writeInfo` (Home mode; after connect and on open), `store/details`
    `restampDetails`.
  - `platform.writeTags`, then `HomeDisk.tags`, then GLUE Home's `POST /fs/tags` (`tags.rs`, lofty
    0.25: a copy, written, flushed, renamed over the file).
  - UI: `ui/library/EditInfo.svelte` (`view.infoFor`), `TrackTable.svelte` (inline editor,
    `.unw` dot), `TrackDetail.svelte` (`#edit-info-btn`, `#info-unwritten`).
- **Covers**
  - `workers/cover.ts` `coverOf(file | url)`: mediabunny `getMetadataTags().images`, SHA-256 name,
    320 and 64 px JPEGs (OffscreenCanvas).
  - The analysis worker returns `art`; `lib.onArt` stores it before the track names it.
  - `lib/covers.svelte.ts`: the cache (`art/<cid>/<hash>-64.jpg`, `-320.jpg` in the browser's
    storage), object URLs (LRU), and older songs through `workers/cover.worker.ts` (three at a time;
    a file, or `platform.fileLink` in Home mode).
  - `ui/library/CoverArt.svelte`.

## Acceptance
- [x] Edit in place, Tab to the next field, Esc drops.
- [x] Several songs, "(mixed)", only changed fields written.
- [x] Kept while GLUE Home is away; written when it runs; no analysis again.
- [x] Covers at analysis, shared by hash, hover, the track page, read again when the cache is gone.
- [ ] The user writes tags on their own files and sees them in rekordbox and Engine DJ.

## Tests
- **Rust:** `tags.rs` writes and reads back per format (MP3, FLAC, AIFF, M4A, WAV, Opus, and covered
  MP3 and FLAC), clears a field, and keeps the duration and the cover.
- **Vitest:** `merge.test` (an edited field stays), `details.test` (`restampDetails`).
- **e2e:**
  - `homemode.spec` "song info…": in place, Tab, Esc, slow click, the write on connect, no analysis
    again, several songs, the track page, a cover read through GLUE Home with byte ranges only;
  - `library.spec` "covers…".
- **Fixtures:** `tests/fixtures/mp3-cover.mp3`, `flac-cover.flac` (made with ffmpeg; a 300 px test
  picture).

## Limits & open questions
- Album artist, track number, BPM and key aren't edited (GLUE doesn't show the first two; the last
  two come from the analysis and Prepare).
- Other computers' songs show no cover yet (their GLUE Home would send them, like thumbnails).
- Editing a cover isn't possible.

## Genres, picked like tags (2026-09-28)
- **A genre picker** instead of typing:
  - the collection's genres (with their songs) and the ones added before, then common ones;
  - type to find; Enter on a new name adds it (kept in `meta.genres`); "No genre" clears it.
- **Opened by:**
  - a slow second click on the selected song's Genre cell (the other cells are edited in place);
  - "Genre…" in the song menu (several songs: the pick goes on all of them);
  - the Genre line on the track page.
- A song has one genre (its file's Genre field); it's set through song info, so GLUE Home writes it
  into the file.
- `lib/genres.svelte.ts` (`GENRE_PRESETS`, `allGenres`, `setGenre`), `ui/library/GenreEditor.svelte`.

## Covers on other devices (2026-09-28, [ADR 0082](../adr/0082-covers-from-glue-home.md))
- A phone (or any device showing another computer's songs) gets their covers from that computer's
  GLUE Home, and keeps them in its own cache. Never through GLUE Cloud.
- GLUE Home has them from the website's hand-over, from its own analyses, or from the song's tags,
  read on request (only the bytes the tags need).
- **Covers looked up (2026-09-28, [ADR 0086](../adr/0086-covers-looked-up-by-glue-home.md)):** songs without a cover in their tags get one from Deezer, iTunes or the Cover Art Archive through a GLUE Home; shown only, never written; "Wrong cover" on the song's page.
- **Other computers' songs (2026-09-28, [ADR 0087](../adr/0087-edits-reach-glue-home.md)):** their info can be edited too; the owner keeps it as its own edit and writes it into the file, through its GLUE Home even with no GLUE tab open.
