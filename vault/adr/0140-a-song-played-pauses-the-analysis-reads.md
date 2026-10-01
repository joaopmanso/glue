---
status: accepted
date: 2026-10-02
---
# 0140. A song played pauses the analysis's reads, not only its new songs

## Context
The user, 2026-10-02, after GLUE Home 0.42.0: "it stays linked, waveforms and cover are much faster. the first song
that I tried to stream took around 30 sec to start … can the stream be a socket as well? would that improve it?"

- **A socket for the stream wouldn't help.** The browser's audio player streams over HTTP with byte ranges, to start
  and seek; the transport isn't where the time goes.
- **The NAS is shared.** ADR 0138 kept GLUE Home from starting new analyses while a song played. The ones already
  running read on, each about 30 s on this NAS (its Speed panel: 31.8 s reading). The song played waited for them,
  about as long.

## Decision
- **Every file GLUE Home reads is marked** (`local.rs` `Pri`, `Paced`):
  - a song played marks "playing now" with every piece read: the website here (`/fs/file`, `/incoming/file`), or a
    device streaming it (`file_read` with `play`);
  - the analysis's own reads (`/home/file`) wait between pieces while a song was marked in the last 3 s, 2 minutes at
    most.
- **When the player's buffer is full** and it stops reading, the mark ages, and the analysis reads on.

## Alternatives considered
- **Stop or cancel the running analyses when a song plays:** their reads would start over from the beginning, 30 s
  of NAS time thrown away each.
- **A socket for the stream:** no gain on the bottleneck. A browser plays from HTTP ranges (or a rebuilt player of
  its own).

## Consequences
- **A song played gets the drive or the NAS at once.** The analysis waits while the player reads, and only then.
- **Seeking** reads again, and pauses the analysis again: fine.
- A file read for playing by anything else (the website's covers from tags) also pauses the analysis for a moment.
