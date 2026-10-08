---
status: accepted
date: 2026-10-08
---
# 0164. GLUE Home matches the duplicates' fingerprints

## Context
ADR 0162 made the page only GLUE Home's screen while GLUE Home runs, and listed what it still did itself until each
moved into GLUE Home's engine. Duplicates came first: the page read every analysed song's fingerprint from the
browser's cache (packs, and the ones GLUE Home's analysis handed over), matched them in a worker
(`core/library/duplicates.ts`, ADR 0025), kept the result in the browser, and in a shared collection published it
(`dupes/<computer>.json`), which forced a full shared sync each time (`dupes.onPublished`). It also made fingerprints
for songs that had none in the browser, by decoding their files through GLUE Home.

GLUE Home's analysis already keeps each song's fingerprint in its cache (`p/<p>/<c>/<shard>/<id>.bin`, the website's
format): on the desktop 8,318 of the 8,320 songs analysed there have one.

## Decision
- **The matching is GLUE Home's** (`crates/glue-engine/src/dupes.rs`): `findSameRecordings` and `findMatchesFor` line
  for line, its maps in insertion order and its sorts stable, so the matches are the website's to the byte (held by
  `tests/golden/dupes`, synthetic fingerprints: copies at an offset, noisy copies around the threshold, a cropped
  one, unrelated songs, quiet frames).
- **When:** five seconds after its analysis saves results (several make one), only the songs fingerprinted since
  against all of them; and on asking, every song again ("Check again"). Its songs: those with an analysis on this
  computer and a fingerprint in its cache; the others are counted as missing.
- **Kept** in its cache (`dupes/<p>/<c>.json`: `ids`, `matches`, `missing`), and in a shared collection published
  for the other computers (`dupes/<computer>.json`, only while no tab holds the lease), sent with the shared sync it
  runs. A tab hears of it through the feed (`dupes/…`, or `dupes` for a collection that isn't shared).
- **The page with GLUE Home** asks for them (`dupes`, `full` for "Check again") instead of matching, and makes no
  fingerprints; it still builds the groups from the matches (names, versions, certainty, the best copy) and rewrites
  playlists to the best copies, until that moves too (next).
- Without GLUE Home the page matches as before.

## Alternatives considered
- **Groups in Rust in the same batch:** they need `core/library/names.ts` (the names compared one way everywhere,
  ADR 0145), versions, certainty, concerns and the best copy; the heavy part is the matching, so it goes first and the
  groups next, each held to the website by its own golden.
- **Fingerprints made by GLUE Home for songs without one:** the desktop has 2; its analysis makes one for every song it
  analyses, and a song analysed again gets one.

## Consequences
- With GLUE Home the page reads no fingerprints and runs no matching worker; GLUE Home's result is there the moment
  a tab opens, also on a phone or a laptop that asks the desktop.
- A shared collection's duplicates no longer force a full sync from the page (GLUE Home publishes and syncs them).
- `src/core/library/duplicates.ts` and `dupes.rs` change together: `GOLDEN=1 npx vitest run tests/dupes.golden.test.ts`,
  then the port.
