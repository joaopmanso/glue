---
status: accepted
date: 2026-10-08
---
# 0167. DJ libraries in GLUE Home: read, brought in and followed in Rust

## Context
With GLUE Home running the page is only its screen (ADR 0162), but DJ libraries were still the page's:
- it followed them live (`djWatch`: a file's date every 5 s through GLUE Home's disk, the whole file sent over the
  local link and parsed in a worker when it changed, then brought in with `applyImport`);
- an import from where a library is (Add, GLUE Home's dialog) was read and parsed by the page;
- finding libraries in the music folders was off, since walking them through the local link was the page's library
  work.

So a library only followed while a GLUE tab was open, and every change crossed the local link whole. The user wants
DJ libraries in GLUE Home first, as the base for cue points and real-time integrations.

## Decision
- **`crates/glue-interop`**: the website's parsers line for line (rekordbox XML, Traktor NML, Apple Music XML, Serato
  database V2 and crates, Engine DJ's `m.db`, M3U), with JavaScript's behaviour where it shows:
  - `Number()`, `String()`;
  - `decodeURIComponent` throwing;
  - `TextDecoder` dropping a byte-order mark;
  - Windows-1252 and UTF-16;
  - an object's numeric keys first (Apple's track ids);
  - `localeCompare` for Serato's crates: punctuation in its own order, then digits, then letters, accents and case
    after.

  Engine DJ's database is read with SQLite (rusqlite, bundled) from a copy in memory, as sql.js reads it. Also the
  import into a collection, `applyImport` with `syncLinkedLists` and `importLists`, on `glue_store` (which gains the
  matcher's folder places, `linked_files`, an id maker and `own_source`).
- **Held to the website byte for byte**:
  - `tests/golden/interop`: library files made with each parser's corners, parsed by the website's `parseLibraryFiles`;
  - `tests/golden/import`: imports into a collection through the store, written by the website. They cover a first
    read, a rename, a new list in a folder brought in whole, a list gone (held a minute, then removed), a read that
    lost most of the library, an Engine DJ set read one library after another, and a shared collection.
- **The engine follows** (`dj.rs`): every 5 s (the service's timer), every collection's libraries whose place it can
  reach:
  - a music folder (where its settings have it);
  - the GLUE folder;
  - `hl:` a file chosen with its dialog.

  It goes by date, as the page did: an Engine DJ save in progress waits, a library is read at most every 10 s, and a
  read that looks incomplete is ignored and said once. The rest of a changed library's work happens in GLUE Home as
  its own edit: read, brought in, marked read, saved and synced. Not while a tab is the writer.
- **The page asks** (`/rpc`):
  - `dj`: each library's state (live, lost, reading), for the sidebar's dot;
  - `djRefresh`: read now;
  - `djImport`: Add, from where it is. It returns the files written so the page reads them at once;
  - `djFind`: the libraries in the music folders and the GLUE folder.

  It still follows a library only this browser was allowed into (`place:`), which GLUE Home can't reach. A file
  chosen in the browser (+ Import) is still parsed by the page.
- **Without GLUE Home, or with one from before 0.64**, the page does all of this as before.

## Alternatives considered
- **The page keeps following, GLUE Home only parsing:** the file would still cross the local link, and nothing would
  follow without a tab.
- **Parsing Engine DJ's database in place (SQLite on the live file):** it could take a lock Engine DJ needs while it
  saves. A copy in memory is what the page read too.

## Consequences
- DJ libraries are followed with no GLUE tab open, and a change no longer crosses the local link.
- Finding libraries in the music folders works again with GLUE Home running.
- `src/core/interop`, `store/merge.ts` (`applyImport`), `store/linked.ts` and their Rust change together
  (`GOLDEN=1 npx vitest run tests/interop.golden.test.ts tests/store.golden.test.ts`, then the port).
- GLUE Home now builds SQLite (C) on both platforms.
- The base for cue points: the parsers' cue lists are now in Rust, in GLUE Home.
