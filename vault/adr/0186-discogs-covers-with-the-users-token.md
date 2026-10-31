---
status: accepted
date: 2026-10-31
---
# 0186. Discogs covers, with the user's token

## Context
The user (2026-10-31): "I want to add discogs support". They chose covers from Discogs and their Discogs collection
(the collection is ADR 0187), signed in with a personal access token.

- **ADR 0086** turned Discogs down only because "it needs a token (the user chose no account)". Discogs is the best
  source for vinyl and white labels, which Deezer, iTunes and MusicBrainz often lack.
- **The API, probed 2026-10-31** (`vault/research/discogs-api.md`): a search answers without a token, but its
  `cover_image` is empty, so covers need the token.

## Decision
- **The token** is GLUE Home's setting `discogsToken`, this computer's only (like its device credential). It's pasted in
  GLUE Home's settings.
  - **The check:** the engine checks it with `/oauth/identity` when it changes, and once after start if never checked
    (`discogs.rs` `discogs_check`). It keeps `discogsUser` and `discogsAt`, or `discogsError`, and the settings show
    "Connected as …" or why not.
- **Discogs is the fourth cover service,** after Deezer, iTunes and MusicBrainz, and only with a token
  (`covers.rs` `Service::Discogs`; the website's reference `coverSearch.ts`; `tests/golden/covers.json`).
  - **The search:** `database/search?type=release&artist=…&release_title=…` for an album, `&track=…` for a song.
  - **The pick:** a result's "Artist - Title" through the same artist and name checks; for a song, the release named
    after it (a single, an EP). The `cover_image`, unless empty or a placeholder.
  - **The pace:** a request every 1.1 s (60 a minute with a token), shared by all of GLUE Home's Discogs requests.
- **The token goes to Discogs' API only:**
  - `web.rs` adds `api.discogs.com` and Discogs' image host to its addresses;
  - it sends an `Authorization` header to `api.discogs.com` only (`sends`), so not to images and not after a redirect
    elsewhere;
  - `Host::web_get_with` carries the headers.
- **Covers that found nothing before the token** are looked up again once: an empty result older than `discogsAt`
  counts as not looked up, instead of waiting out its 30 days.

This supersedes ADR 0086's line on Discogs. The rest of ADR 0086 stands.

## Alternatives considered
- **Sign in with Discogs (OAuth):** it needs a registered app and its secret kept somewhere safe. A token is enough
  for one user, and stays on their computer.
- **Discogs first:** the other services answer faster and without an account. Discogs fills the gaps they leave.
- **The token in the GLUE folder:** that would spread it to every device and backup. It's a credential, so it stays
  in GLUE Home's settings.

## Consequences
- **Vinyl and white-label songs without covers** get Discogs' cover when the others have none.
- **The token sits in GLUE Home's `config.json`,** like the device credential: not logged, not backed up, never sent
  elsewhere.
- **A website-only browser** (no GLUE Home) gets no Discogs covers, as it gets no looked-up covers at all (ADR 0086).
