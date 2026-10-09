---
status: accepted
date: 2026-10-09
---
# 0175. Back from the background, the room and the sessions are made again at once

## Context
After ADR 0174 the user (2026-10-09): on Wi-Fi the iPhone and the desktop start a song much faster; on 5G the iPhone
still takes about 10 s, where Plexamp starts the same song at once.
- Plexamp's server keeps a port open on the router: the phone fetches the song over HTTPS, with nothing to set up first.
- GLUE's phone works through a session with the desktop's GLUE Home: a WebRTC connection, its handshake through GLUE
  Cloud's room. A phone freezes a page in the background and its sockets die there, often without saying.
- Nothing in the page reacted to coming back:
  - the room's socket could still read as open until its next ping (30 s), so a handshake sent on it went nowhere
    and waited out its 20 s;
  - or the room was reconnecting with a back-off that had grown while the page was frozen (up to a minute);
  - a song played went first to the session that had died, and a new one was only made after its request timed out.

## Decision
- **Back after more than 10 s away** (`visibilitychange`, or `pageshow` from the browser's page cache;
  `remoteFiles.svelte.ts`):
  - the room is connected again at once (`account.wake`: a new socket, the back-off reset), not trusted as it was;
  - the sessions are let go and made again as soon as the room is open (`remoteFiles.restart`), so one is usually
    ready before a song is chosen.
- **A handshake waits for the room** (`account.roomOpen`, up to 8 s; `homeLink.ts`) instead of failing with "Not
  connected to GLUE Cloud" while it reconnects.
- **The phone shows where a song's start went** (ADR 0174's line, under the artist in the player sheet: a new
  connection or not, the first answer, the first music and sound, the route), as the computer's tooltip does.

## Alternatives considered
- **Keep the sessions and test them on waking (a ping):** one more round trip of waiting on a connection that's
  probably dead; making a new one costs about as much and is sure.
- **Plain HTTPS to GLUE Home from outside, as Plex does** (a port on the router, a certificate per computer): it
  would remove the handshake, but needs GLUE Home reachable from the internet and certificates from a GLUE service.
  Kept for if the phone's line shows the handshake or the relay still costs seconds on 5G.

## Consequences
- After the background, a song starts on a fresh session instead of waiting on a dead one.
- The phone's player sheet says what a slow start spent its time on, so the next step is chosen from numbers.
- `e2e/phone.spec.ts` brings the page back from the page cache: the room's socket is new, and a song plays.
