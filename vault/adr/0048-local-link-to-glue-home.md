---
status: accepted
date: 2026-09-25
---
# 0048. A local link to this computer's GLUE Home; songs analysed on arrival; one row per song

Builds on [ADR 0045](0045-glue-home-companion.md), [0046](0046-glue-home-shares-analysis-and-sorts-incoming.md)
and [0047](0047-stream-channel-requests-at-once.md).

## Context
The user (2026-09-25) sent a song from the laptop to the desktop, then:
- on the laptop the song showed twice (the laptop's own track and a TO BE SORTED row "on Desktop"),
  and playing it downloaded it from the desktop although the laptop has the file;
- on the desktop, TO BE SORTED appeared only after the cloud sync and the account's channel were up,
  and playing the song "downloaded" it from the GLUE Home running on the same computer.

The user's goal: with GLUE Home installed, the website on that computer relies on GLUE Home, not on
GLUE Cloud. What's in the incoming folder should show at once, already analysed, and play from disk.

## Decision
- **Local link.** GLUE Home runs a small HTTP server on `127.0.0.1`, first free port of 47400–47409
  (`home/src-tauri/src/local.rs`, tiny_http):
  - `GET /hello` → `{app:'glue-home', version, device}`, no token;
  - with the token: `GET /incoming` (with each song's analysis summary), `GET /incoming/file?name=`
    (Range requests), `GET /cache?key=`, `GET /folders`, `POST /incoming/move?name=&folder=`.
  - It only answers the GLUE site's origins (CORS, plus `Access-Control-Allow-Private-Network`), and
    only with the token GLUE Home made (24 random bytes, in its settings file), sent as `?t=` or
    `x-glue-token`.
- **Learning the link.** The website asks its companion once over the account's channel (`local`
  request: port and token) and keeps it in the pref `mco.localHome`. From then on it finds GLUE Home
  with `/hello` at start, before and without GLUE Cloud (`src/lib/localHome.svelte.ts`).
- **Analysed on arrival.** GLUE Home analyses each song it receives (and any waiting without one at
  start) into its cache: `i/<name>.summary.json | thumb.bin | details.json | details.bin`
  (`incomingKey`). TO BE SORTED rows carry that summary; their waveform and track page come from the
  cache (local link, or the new `cache` request over the channel).
- **One row per song.** A waiting file whose name (or name without " (2)") and size match a track of
  the collection is that track: one row, its devices gain that computer, and TO BE SORTED lists it.
  When the track is another computer's, `remote.via` points at the waiting file so it plays from the
  nearest copy; this computer's own tracks play from their own file.

## Alternatives considered
- **Everything over WebRTC to the local GLUE Home:** needs GLUE Cloud signaling, so nothing shows
  offline or before the account is up; that was the complaint.
- **A custom protocol (`gluehome://`) or native messaging:** no responses for a page, or a browser
  extension to install.
- **A fixed port with no token:** any page on the machine could read the incoming folder.
- **Dedupe by a content hash:** exact, but GLUE Home would have to hash every song and the website
  every track first; name plus size is enough for songs sent from GLUE.

## Consequences
- Chrome and Edge may ask once to let the GLUE site reach "devices on your local network"
  (Local Network Access). Refusing leaves the channel path working, as before.
- The link is learned only while signed in once; a new token (a reset settings file) needs another
  sign-in on that computer.
- Two different songs with the same file name and size would be taken for one (unlikely; accepted).
- Next ([ADR 0050](0050-glue-home-as-the-computers-library.md), proposed): the library itself, its
  saving and cloud sync move into GLUE Home behind the same link.
