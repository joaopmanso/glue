---
status: accepted
date: 2026-10-09
---
# 0174. Another computer's songs stream as they arrive, and their start says where its time went

## Context
A song on another computer plays through GLUE's streaming service worker (ADR 0076): the `<audio>` element asks for
byte ranges under `__stream/<token>`, the worker asks the page, and the page fetches them from that computer's GLUE
Home over the session's WebRTC channel. Each answer was a piece fetched whole before the worker answered: 512 KB
first, then 2 MB, and up to 8 MB when the player named the range's end.

The user (2026-10-09): the same WAV on a network folder, served from the desktop to the iPhone, took well over 20 s to
start in GLUE and played at once in Plexamp, at full quality; on the laptop well over 5 s, against instant in Plex.
- Safari asks for the whole song in one range, so GLUE fetched 8 MB (15–45 s of a WAV) before the player had a byte.
- Then each next piece only when the player asked again, with nothing fetched ahead.
- GLUE Home's channel isn't the limit: 9 MB/s to Edge over loopback (`scripts/rtc-probe.mjs`), and a hi-res WAV needs
  about 0.6 MB/s.
- Plexamp's server sends a file as it reads it, and the player starts once it has a few seconds.

## Decision
- **The worker answers a range as a stream** (`public/glue-stream-sw.js`): its headers and first bytes as soon as
  GLUE Home sends them, the body growing as the rest comes, the range the player asked for (to the file's end when
  open), as an HTTP server sends a file.
  - The page (`remoteFiles.streamTo`) fetches the range in pieces (256 KB first, then 2 MB) and passes each chunk on
    as it arrives (`ask`'s `onChunk`).
  - The worker asks for the next piece when the player has room (4 MB held ahead), and asks itself when a piece ends,
    as the stream may not ask again by itself (that stalled the first try).
  - When the player lets go (a seek, another song), the stream stops.
- **Old and new meet for a while after a deploy:** an old worker and a new page still speak in whole answers, and
  so do a new worker and an old page. An AIFF played as WAV (Chrome and Edge, ADR 0088) keeps its whole pieces: its
  bytes are rewritten a piece at a time.
- **A streamed song's start says where its time went** (`remoteFiles.lastStart`, `describeStart`):
  - a new connection or an open one, the first answer, the first music, the first sound;
  - the connection's route from the browser's own numbers for the pair of addresses in use (`homeLink`'s `route`):
    direct on the same network, direct through the router, or through GLUE Cloud's relay, with the time there and back.
  - It's the tooltip of the player line under the song's title, and the console says it once the song plays.

## Alternatives considered
- **Smaller pieces only:** fewer seconds per piece, but still a wait and a gap at every piece.
- **Fetching ahead while answering whole pieces:** hides the gaps, but the first answer still waits for a whole piece.
- **Plain HTTP on the network, as Plex does** (GLUE Home listening beyond 127.0.0.1): a page on github.io can only
  reach it over HTTPS with a certificate per computer (Plex runs plex.direct for that). A larger decision, kept for if
  the numbers show the connection itself is the limit.

## Consequences
- A song starts after its first answer and first chunk rather than a whole piece; the player reads ahead at the
  network's speed.
- When it's still slow, the player's tooltip names the step and the route, and the user can say which.
- `e2e/phone.spec.ts` fetches a stream as Safari does (the whole song in one range) and as Chrome does (from a place
  to the end): the file's bytes, through several pieces.
- This ADR's number was taken on a branch while another session works on `main`: renumber it at the merge if `main`
  has a 0174 by then.
