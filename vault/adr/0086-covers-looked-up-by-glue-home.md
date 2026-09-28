---
status: accepted
date: 2026-09-28
---
# 0086. GLUE Home looks up missing covers on public services

Extends [ADR 0072](0072-covers-from-the-tags.md) (covers from the songs' tags) and
[ADR 0082](0082-covers-from-glue-home.md) (covers from GLUE Home).

## Context
The user (2026-09-28): covers show fine, "but if we can use some public service to fetch the ones we
don't have would be very welcoming". Asked, they chose:
- **several services, best first;**
- **looked up automatically.**

Some constraints:
- **Browsers can't read every service's answers.** Deezer's API doesn't send CORS headers, so a
  web page can't use it.
- **MusicBrainz asks for at most one request a second** and a User-Agent that names the app.
- **ADR 0002:** audio never leaves the machine. Only a song's artist and album or title go out.

## Decision
- **GLUE Home does the lookups,** in its Rust side, through a new command `web_get`
  (`home/src-tauri/src/web.rs`, ureq):
  - only https;
  - only `api.deezer.com`, `itunes.apple.com`, `musicbrainz.org`, `coverartarchive.org`,
    `archive.org` and the image CDNs `dzcdn.net` and `mzstatic.com`, including redirects;
  - at most 8 MB, 20 s, and a `GLUE-Home/<version>` User-Agent.
- **In order** (`src/core/library/coverSearch.ts`, pure and unit-tested):
  1. Deezer: an album search, or a track search when the song has no album;
  2. iTunes: 600 px artwork;
  3. MusicBrainz, then the release's front cover on the Cover Art Archive.
  - A result counts only when the artist and the album (or song) match, give or take accents,
    brackets and "feat." (`same`, `sameArtist`). A search that finds something else gives no cover
    rather than a wrong one.
- **One lookup at a time** (`home/ui/lookup.ts`), with a gap per service: Deezer 250 ms, iTunes
  400 ms, MusicBrainz 1.1 s. An album's songs share one lookup.
- **Kept like any cover** (`a/<hash>-<px>.jpg`). Per album or song, the result goes in
  `f/<key hash>.txt`:
  - the cover's hash;
  - `''`: nothing matched, asked again after 30 days;
  - `x`: the user said it's wrong, never again.
- **A new request, `find-art`** (GLUE Home 0.18), taking up to 60 songs by artist, album and title:
  - each answer is a hash with its JPEG, `''` for none, or `?` while being looked up (the device
    asks again, with a growing wait);
  - `refuse: true` marks the album's cover as wrong.
- **Who asks:**
  - any device whose song has no cover in its tags, once its tags are read here or by its
    computer's GLUE Home;
  - the device asks this computer's GLUE Home, or any online GLUE Home of the account. A laptop
    without GLUE Home gets covers for its own songs too.
- **Only shown, never written:**
  - the device keeps the picture in its cache;
  - neither the song's file nor the collection is changed, so a found cover never looks like the
    song's own;
  - a song's page shows **Wrong cover** for a looked-up one.

## Alternatives considered
- **Look up in the browser:** Deezer's API can't be read from a page, and every device would repeat
  the lookups and the rate limits.
- **`tauri-plugin-http`:** a general fetch with a URL scope. It's more to configure, and its npm and
  crate versions must be kept in step. `web_get` does exactly one thing.
- **Write found covers into the files' tags:** it changes the user's files for a guess. Maybe later,
  as an explicit "Save this cover into the file".
- **Discogs:** the best for vinyl and white labels, but it needs a token (the user chose no account).

## Consequences
- The lookups need GLUE Home 0.18 on some computer of the account. An older one doesn't answer
  `find-art`: after one time-out it isn't asked again that visit.
- What the services match is their call. Club promos and white labels will often find nothing.
- The first time a library is shown, lookups take a while: one album a second or so. They're kept
  after that.
- **[UNVERIFIED]** The services' terms: Deezer's and iTunes' search APIs are free with no key for
  this kind of use, MusicBrainz asks for a descriptive User-Agent and 1 request per second, and the
  Cover Art Archive has no limit stated. To check before GLUE Cloud opens to other users.
