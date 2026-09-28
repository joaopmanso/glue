---
status: accepted
date: 2026-09-28
---
# 0076. Songs stream by byte range: the local link in Home mode, a service worker for other computers

## Context
The user's list (2026-09-28): a song downloads completely before it plays; it should stream, with GLUE
Home doing the heavy lifting. The user chose the original file, by range (transcoding for mobile data
later).

**Where the whole file was read:**
- Home mode: through `HomeFile.getFile()`, the whole song over the local link into a Blob.
- Another computer's song: `remoteFiles.get()`, the whole file over WebRTC, then a Blob.

Only the browser's own folders streamed already: a `File` from a handle is read as it plays.

- **The local link** (ADR 0048) already serves `/fs/file` with byte ranges.
- **WebRTC** can't be an `<audio src>`. A service worker can answer an address's range requests from
  anywhere, including a data channel through the page.

## Decision
- **One source for playing a song** (`lib.mediaFor`): an address that streams when the browser plays
  the format by itself (`canPlayType`), otherwise the file as before (AIFF in Chrome, which is
  rewrapped as WAV; an older GLUE Home).
  - **Home mode:** the local link's `/fs/file` address.
    - `<audio>` asks for byte ranges; the player sets `crossOrigin`, so the live view and the
      visualiser can still read it (the local link sends CORS for GLUE's origins).
    - This computer's incoming folder: its `/incoming/file` address.
  - **Another computer's song** (merged collections, the cloud view later):
    - `public/glue-stream-sw.js` answers `…/__stream/<token>` with 206 ranges;
    - it asks the page that made the token, which asks that computer's GLUE Home for the bytes;
    - the rest of the site doesn't go through it (it caches nothing).
- **The request:** `range {start, len, song or incoming name}` on the stream channel, answered with
  `{total, type}` and the bytes.
  - GLUE Home 0.14; at most 8 MB a request.
  - Pieces: 512 kB first (it starts at once), then 2 MB, or what the player asks for.
  - A first 2-byte request finds the size and type. An older GLUE Home doesn't answer it in 8 s: its
    songs come whole, as before.
- **Also taking an address:** `player.setSource`, the track page (`app.playBlob`) and stems. Stems read
  the whole file themselves, since they need every sample.
- **Unchanged:** Prepare still reads the whole file (its waveform needs every sample). So do analysis,
  drag-out, the dock and Send.

## Consequences
- A song plays in about a second, and seeking asks for the part it needs.
- **Service workers:**
  - GLUE registers one for the first time on the first stream (only on secure pages).
  - On an iPhone, Safari passing media ranges through a service worker is [UNVERIFIED]; that's the
    next batch's spike. Where it can't, the song comes whole.
- **Tests (e2e):**
  - a desktop's song plays through `__stream/` (the cloud sync test, with GLUE Home's real service
    page over WebRTC);
  - in Home mode, a song is only read in ranges from the local link.
