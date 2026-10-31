---
status: accepted
date: 2026-10-31
---
# 0187. The Discogs collection: read by GLUE Home, kept in the profile, matched on the page

## Context
The user (2026-10-31) chose to bring their Discogs collection and wantlist into GLUE. Their personal token is kept by
GLUE Home (ADR 0186). Discogs lists records, which are releases, not songs; most of a DJ's records may have no digital
copy in GLUE. The useful question is which records they also have here.

## Decision
- **GLUE Home reads it** (`crates/glue-engine/src/discogs.rs`):
  - **What:** the account named by the token's check (`discogsUser`), its collection
    (`users/<u>/collection/folders/0/releases`, newest first) and wantlist (`users/<u>/wants`), 100 a page, at the shared
    Discogs pace (a request every 1.1 s).
  - **Covers:** each record's cover (its `cover_image`, else `thumb`) is fetched once, new ones only, and kept like any
    cover (`a/<hash>-64/-320.jpg`).
  - **When:** after a new token is checked, then by the service's hourly look, which reads again after 20 hours, and
    on **Refresh** (`discogsRefresh`).
- **Kept as the profile's file** `profiles/<p>/discogs.json`: the account is a person's, not a collection's.
  - **Its form:** `{ schemaVersion, user, readAt, records, wants }`, each record
    `{ id, instance, title, artists, labels: [{ name, catno }], year, formats, genres, styles, added, rating, cover,
    art }`.
  - **Who writes it:** GLUE Home writes it into every profile, only while no tab holds the lease (ADR 0051). Its own copy
    (`discogs/<p>.json` in its cache) carries it meanwhile.
  - **The page** asks GLUE Home for it (`discogs`: the file, the token's state, a read's progress or error). It never
    goes through `CollectionStore`.
- **Matched on the page** (`src/core/library/discogsMatch.ts`) to the open collection's songs:
  - **An album:** the record's title as the songs' album, by one of its artists. Names compare as the cover look-up's
    do, so Discogs' "Name (2)" is the name.
  - **A compilation** ("Various"): on its label, or a title of 8 or more characters exactly the album's.
  - **A single:** its title as a song's.
  - **No tracklists** (a request a record): records that don't match by album aren't looked into.
- **Shown as a view** (`#/discogs`, `DiscogsView.svelte`, the sidebar's Music section):
  - **Tabs** Collection and Wantlist; search, the filter All / In GLUE / Not in GLUE, sort.
  - **A record:** its cover from GLUE Home's cache by hash, label and catalogue number, year, styles, formats, and "In
    GLUE: N songs" (a click opens their album) or "Not in GLUE".
  - **Right-click:** Show its songs, Play, Open on Discogs.

## Alternatives considered
- **A `Source` like a DJ library:** its records aren't songs, and most have none here. Following, syncing and "No file
  linked" would all misfire.
- **A collection's file:** the same account belongs to every collection of the profile. It would be copied into each
  and synced with the shared ones.
- **Matching in GLUE Home:** the page has the songs and redraws as they change, and the matching is cheap (a few
  thousand records against an index of the songs).
- **Reading in the browser** (the API allows it): the token would have to be on every device. It stays with GLUE Home.

## Consequences
- **Discogs is read only:** nothing is written there.
- **Covers count against the pace too:** a first read of a large collection takes some minutes (about a second a
  cover). The list shows first.
- **A device without GLUE Home** sees nothing yet, and the view says so. The profile's file isn't synced through GLUE
  Cloud (only collections are), so another computer sees it only with the same GLUE folder.
