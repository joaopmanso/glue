---
status: accepted; the gate superseded by 0139 for GLUE Home 0.42 and later (a socket; the gate is the fallback)
date: 2026-10-01
---
# 0138. What the user asks for goes first: background requests gated, playing ahead of the analysis, songs read whole

## Context
The user, 2026-10-01, with GLUE Home analysing a network folder of 24-bit FLACs (24 at a time, 4 from each network
folder):
- the Speed panel said 2 songs a minute at 10 MB/s, with 6 songs reading and 2 analysing; a song took 31.8 s to read
  and 16.5 s to analyse;
- the desktop's page lost its direct link again ("no direct link") while GLUE Home went on analysing;
- "clicking 3 or 4 songs in a row on different waveforms to stream them completely breaks it", and the page kept
  playing the same song.

Measured on the desktop while it happened:
- **GLUE Home was fine:** it answered `/hello` in 4 to 87 ms on a separate connection.
- **The page wasn't:** 8 connections were open to GLUE Home's local link. A browser keeps at most 6 to one address,
  so the page's own `/hello`, and the song clicked, waited behind the others.
  - **What took them:** the analyses' results, 5 requests a song and 4 songs at a time, so 20 at once whenever GLUE
    Home finished songs. Also the rows' spectrograms and waveforms (6 at a time each), and the status poll every 4 s,
    which started again even when the last hadn't answered.
- **The NAS gave more than GLUE Home got:** reading 6 files at once from its share, with GLUE Home analysing,
  47 MB/s opening the file for each 4 MB piece and 74 MB/s opening it once. GLUE Home got 10 MB/s in all. It read
  each song in 4 MB pieces through Tauri's messages to its page, a piece at a time per song.

## Decision
- **Background requests to GLUE Home's cache go through a gate** (`src/lib/gate.ts`): at most 3 at a time, leaving the
  rest of the browser's 6 for what the user asks for (playing, a song's page). A song page's own request in the gate
  goes first.
  - It covers the analyses' results (`takeDerived`), the rows' spectrograms and waveforms (`fromCache`) and a song's
    details.
- **The status poll runs one at a time** (`engineClient.refresh`).
- **Playing goes first in GLUE Home:**
  - while a song was read for playing in the last 10 s, no new song starts beyond 2 running;
  - "read for playing" means this computer's page reading a song file on the local link (`FOREGROUND_AT`), or
    another device streaming one (`cache.playing`).
- **GLUE Home reads a song whole for its analysis**, from its own local link (`/home/file`): one request, one open
  file, read in 1 MB steps. It's for its own windows and full token only, and any file it may read (`allowed`). The
  bytes come as a Blob, never through its page 4 MB at a time. Tauri's messages remain the fallback.
  - The local link's files are read in 1 MB steps (`send_file`): a network folder gives far more for big reads.
- **Next, the user's suggestion:** one dedicated socket from the page to GLUE Home for the thousands of spectrograms,
  waveforms, covers and results. It would carry any number at once on one connection, cancellable when a row scrolls
  away, and replace this gate. To be its own ADR, with GLUE Home 0.42.

## Alternatives considered
- **More connections:** the 6 are the browser's, per address; another address (localhost) isn't the same server for
  every browser (IPv6).
- **Pausing the analysis while the page is open:** the user wants it to run; only playing needs to go first.

## Consequences
- **Under a busy GLUE Home** the rows' pictures come at most 3 at a time, and a click goes through at once.
- **While songs play,** GLUE Home analyses at most 2 at a time.
- **The read speed** to measure after this: the Speed panel's MB/s from network folders, against the 47 to 74 MB/s the
  NAS gave.
