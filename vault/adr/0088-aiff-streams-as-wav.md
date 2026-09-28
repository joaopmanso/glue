---
status: accepted
date: 2026-09-28
---
# 0088. Another computer's AIFF songs stream, as WAV worked out a piece at a time

Amends [ADR 0076](0076-songs-stream-by-range.md), which kept AIFF out of streaming.

## Context
The user (2026-09-28, after batch L): "we are back at seeing download messages on the songs instead
of streaming … sometimes it's instant and it just streams the track, other times it shows 'Stranger ·
getting it from Desktop… 44%'."

Why:
- **Only formats the browser plays by itself stream** (`canPlayType`, ADR 0076). Chrome, Edge and
  Firefox don't play AIFF.
- **So an AIFF came whole:** downloaded from the other computer, rewrapped as WAV, then played.
- **A DJ library mixes MP3, FLAC, WAV and AIFF,** so some songs started at once and others downloaded
  first.

## Decision
- **An AIFF streams as a WAV** that the page works out a piece at a time (`core/formats/wavStream.ts`):
  - the first 64 kB of the AIFF (its COMM and SSND chunk headers) give the WAV's 44-byte header and
    its size, with the real sample-data length taken from the frame count;
  - each WAV range the player asks for maps to the AIFF range of the same samples (whole samples),
    read from GLUE Home with `range` and put in little-endian order (float and 8-bit as `pcmToWav`
    does them).
- **The service worker's address** says `audio/wav` with the WAV's size, so `<audio>` streams and
  seeks as with any WAV.
- **GLUE Home is unchanged:** it serves the AIFF's bytes as before (GLUE Home 0.14 or later).
- **Still whole:**
  - AIFF-C with compression (not PCM);
  - formats the browser can't decode at all (ALAC in `.m4a`);
  - an AIFF in this computer's own incoming folder, which is read over the local link and comes at
    disk speed.
- **GLUE Home 0.20** also sends what it was asked to its settings shortly after each request, at most
  every 2 s (ADR 0083's activity view updates live).

## Alternatives considered
- **GLUE Home rewraps (a `wav` flag on `range`):** the same work, plus a GLUE Home update everywhere,
  and old GLUE Homes would answer AIFF bytes to a WAV request.
- **Decode AIFF in the page with WebAudio and play from a buffer:** that needs the whole file first,
  the problem itself.

## Consequences
- **The desktop's AIFF songs start playing at once,** like its MP3, FLAC and WAV songs.
- **Each piece costs the page a byte swap:** 2 MB at a time, a few milliseconds.
- **The live view and the visualiser** see the WAV as they would any stream.
