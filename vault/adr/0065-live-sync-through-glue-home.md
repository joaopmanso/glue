---
status: accepted
date: 2026-09-26
---
# 0065. Live sync of DJ libraries is GLUE Home's; in the browser alone, Refresh

Amends [ADR 0063](0063-dj-libraries-browsed-live.md) (its "Live" part).

## Context
The user tested ADR 0063 (2026-09-26): playlists made in Engine DJ never showed up in GLUE.
- **Why:** the library had come in through "+ Import". A web page gets a copy of a chosen file, not
  where it is, so GLUE couldn't look at it again.
- **The "Keep up to date…" button** asked for a folder to search, which read as "refresh" and wasn't
  one.

The user then set the rule: importing a file by hand is fine, but a collection imported must be kept
in sync. Live sync can be GLUE Home's; in the browser, a manual "Refresh" is enough.

## Decision
- **Live, only with GLUE Home** (Home mode). `djWatch` looks every 5 s while GLUE is in view, and only
  in Home mode. GLUE Home knows the library files:
  - **Imported with its dialog:** in Home mode, "+ Import" opens GLUE Home's file dialog
    (`/fs/pickfile`). GLUE Home remembers the file (its setting `libraries`), so it's followed from
    then on.
  - **Found where the apps keep them** (`home/src-tauri/src/libraries.rs`): Engine DJ's "Engine
    Library" on every drive and in Music, and Traktor's newest collection in Documents/Native
    Instruments. It looks again at most once a minute, as drives come and go.
  - **Served read only:** their folders are roots of the website's disk (`/fs/roots` lists them). A
    folder that's only a library can't be written through `/fs` (403). Engine DJ gets its own,
    careful way in (ADR 0064).
  - **Matched to what's already imported:** detection recognises each file from its first bytes,
    without searching its folder (`libraryAt`), and matches it to a source. A source imported by hand
    adopts it with no click. An Engine DJ set is one source: its biggest database is the one followed,
    and the others count as part of it.
  - **Shown:** a library row shows ● while followed, or "Find its file…" (GLUE Home's dialog) when
    GLUE Home doesn't know its file.
- **Browser alone:** each library row has **Refresh**, or **Update** when a newer file was seen. It
  reads the library again where GLUE can reach it, asking for permission if needed. When it can't, the
  next Refresh asks for the file itself.
- **The library rows keep room for their tools:** hovering showed × and moved the buttons under the
  pointer, which lost clicks.

## Alternatives considered
- **Browser-side file handles for "+ Import"** (showOpenFilePicker, kept in IndexedDB): the
  permission has to be asked again in each new session, and live following needs a page that keeps
  checking. The user chose GLUE Home for live sync.
- **Searching every folder for libraries:** GLUE Home checks the few places the apps use instead.

## Consequences
- **On the user's desktop,** GLUE Home found `C:\Users\joaop\Music\Engine Library`, `F:\Engine
  Library` and `G:\Engine Library` in 48 ms. The Engine DJ source adopts F: (the biggest). A write
  into a library folder was refused.
- **GLUE Home 0.10.0.** An older GLUE Home lists no libraries: libraries in music folders still follow
  live, and the others offer "Find its file…" (which needs 0.10).
- **e2e:**
  - Home mode: a rekordbox.xml imported through the fake GLUE Home's dialog, changed on disk, is
    followed with no click. The file is only sent when it changes; looks are by date.
  - Browser: Refresh reads it again.
