---
status: accepted
date: 2026-10-01
---
# 0139. A socket for the background loads from GLUE Home, and a list that stays put

Supersedes 0138's gate for GLUE Home 0.42 and later (it stays the fallback); the rest of 0138 stands.

## Context
The user, 2026-10-01, after GLUE Home 0.41.6:
- "the playlist is scrolling by itself, whenever i scroll to an area that hasn't loaded yet, it basically just
  changes the songs I'm seeing in the screen … it just keeps changing 5, 6, 7 times until it settles. even if I
  pause the analysis it still just keeps doing it";
- earlier, on the gate: "can't we just have some sort of socket dedicated just for that part, we'll be loading and
  discarding thousands of waveforms/covers"; then "It's best to get the socket work done so that we can fix this once
  and for all."

What was found:
- **The table** draws fixed 30 px rows and restores a view's scroll position once. The scrolling itself didn't jump.
- **The rows changed.** The library's own views show one row per song (the best copy of a duplicate group) and leave
  out songs that failed their analysis (ADR 0100, 0120). As the rows coming on screen loaded (covers read into their
  songs, results taken in), songs just above the screen left the list or joined it, and everything below shifted.
  The page loads 12 rows beyond each edge, so each scroll caused several such shifts.
- **Reproduced** (`e2e/scroll.spec.ts`): removing 5 songs just above the screen changed the songs at its top.
- **The gate (0138)** kept connections free for playing, but the background loads still queued three at a time on
  HTTP, and one already sent couldn't be cancelled.

## Decision
- **A socket for the background loads** (GLUE Home 0.42, `home/src-tauri/src/ws.rs`):
  - a WebSocket on 127.0.0.1, its own port (`wsPort` in `/connect` and `/hello`);
  - for the GLUE website's origin with GLUE Home's token, full or read-only;
  - requests are numbered text messages for GLUE Home's cache files, read 6 at a time; a request can be cancelled;
  - answers are binary: the number, found or not, the bytes.
- **On the website** (`src/platform/homeSocket.ts`): one socket per page, opened on first use and opened again when
  it closes.
  - It carries the rows' spectrograms and waveforms, a song's details and the analyses' results (`engineClient`
    `fromCache`, `takeDerived`).
  - A row that scrolls away cancels its read (`thumbs`/`waves` `drop`).
  - With no socket (a GLUE Home before 0.42), HTTP through the gate, as before.
- **The list stays put** (`TrackTable.svelte`):
  - the table remembers the song at the top of its window and how far into its row it is;
  - when the rows change and the user didn't (the same view, sort, filters and search), that song is put back where
    it was, in the same update, before anything is drawn;
  - if that song itself left the list, the window stays where it was;
  - when the user changes what's shown, it starts where that view was, as before.
- **A test reproduces the user's case** (`e2e/scroll.spec.ts`): a library of 3,000 songs scrolled 40 % down, songs
  above it removed three times, and the songs at the top are the same each time.

## Alternatives considered
- **Freeze the list while things load:** new songs, removed copies and failed analyses would show late, and the
  list would still move when unfrozen.
- **Load every song's data before showing the list:** thousands of reads before the first row.
- **Socket.IO or another library:** the protocol is a handful of messages. A WebSocket and `tungstenite` on the
  Rust side are enough.

## Consequences
- **Under a busy GLUE Home**, the rows' pictures come on the socket as fast as GLUE Home reads them. The browser's
  connections to 127.0.0.1 are left for playing and what the user asks.
- **The list doesn't move by itself in any view,** whatever loads. Rows can still appear or disappear, never shifting
  what's on screen.
- **Covers still come over HTTP** (their tags read from the file): the next to move onto the socket if they show up
  in the numbers.
