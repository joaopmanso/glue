---
status: accepted
date: 2026-09-27
---
# 0071. Song info is edited in GLUE and written into the music files by GLUE Home

## Context
The user's list (2026-09-27): edit songs' metadata, in the table in place, several songs at once, and
on the track page. The user chose "File via GLUE Home": the edits go into the files, so every DJ app
sees them. Until now GLUE never wrote a tag:
- a track's info came from the file's tags, or from an imported DJ library;
- it only filled fields that were empty, so an edit in GLUE would already stay put.

A web page can write a file it has a handle for, but only by rewriting all of it. It has no tag
writer for five containers either. GLUE Home already writes inside the music folders it knows
(ADR 0051, 0070).

## Decision
- **The fields:** title, artist, album, genre, label, year, grouping, comment: the ones GLUE shows
  and fills in (`INFO_FIELDS`, `core/library/tags`). Album artist and track number wait until GLUE
  shows them.
- **In GLUE at once** (`lib.editInfo(ids, patch)`):
  - only the fields given change; a title can't be emptied;
  - the track keeps `edited` (fields never filled in again from the file or a DJ app, even when
    emptied; `fillInfo`);
  - and `unwritten`: those not in the file yet. Only songs in this computer's music folders (or its
    incoming folder) have these. Songs added one by one, other computers' songs and merged views
    stay GLUE only.
- **Into the files, by GLUE Home** (`POST /fs/tags {root, path, tags}`, `tags.rs`, the `lofty`
  crate):
  - The songs:
    - only a music folder or the incoming folder GLUE Home knows;
    - paths checked as for every `/fs/*` call.
  - What it writes:
    - every tag the file has, plus its main one when it has none;
    - an empty value removes the field;
    - the other fields and the cover stay.
  - Written into a copy next to the file (`.glue-tmp-…`), flushed, then renamed over it: never half
    written.
  - The reply is the file's new size and date.
- **Nothing is analysed again:**
  - the website puts the new size and date on the track;
  - and on its stored analysis (summary and details, `restampDetails`), when they were the old
    file's.
- **When:**
  - at once in Home mode;
  - otherwise when GLUE Home connects, or when a collection opens in Home mode (`lib.writeInfo`).
  - A song whose write failed stays unwritten: a notice, and another try on the next connect. An
    older GLUE Home is told to update.
- **Screens:**
  - the table:
    - F2 on a song, or a slow second click on the selected song's cell;
    - edits in place; Enter keeps, Esc drops, Tab goes on to the next column;
  - "Edit info…" in the song menu (F2 with several selected): a dialog, "(mixed)" where they differ,
    only changed fields applied;
  - "Edit info" on the track page;
  - a dot after the title, and a line on the track page, while an edit isn't in the file yet.

## Alternatives considered
- **Writing tags in the browser** through its file handles:
  - a tag writer per container in TypeScript;
  - a whole-file rewrite per edit;
  - a write permission prompt per folder;
  - and nothing for songs reached through GLUE Home. No.
- **Keeping edits in GLUE only:** the DJ apps would never see them; the user chose the files.
- **Writing only the main tag:** a file with ID3v1 and ID3v2, or APE, would show the old value in
  some apps.

## Consequences
- GLUE changes files' tags, only on the user's edit and only through GLUE Home. The audio is never
  touched; the Rust test checks the duration and the cover stay, in MP3, FLAC, AIFF, M4A, WAV and
  Opus.
- **DJ apps** see a changed file the next time they read its tags:
  - rekordbox: "Reload Tag";
  - Engine DJ: when it re-reads the file.
  - **[UNVERIFIED]:** which apps notice by themselves.
- **Races:** a scan or an analysis that read the file just before a write can leave the old size on
  the track. The next scan sees the change and analyses the song again: slower, never wrong.
- **Tests:**
  - Rust: write and read back per format, clear a field, no temporary file left, the cover kept;
  - Vitest: an edited field isn't filled in again by an import; the stored analysis follows the file;
  - e2e (fake GLUE Home):
    - an edit in place kept while GLUE Home is away, then written when it runs;
    - no analysis again;
    - several songs at once with "(mixed)";
    - the track page's Edit info.
