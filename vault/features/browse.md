---
status: shipped
milestone: M3
updated: 2026-09-28
adrs: [0067]
---
# Browse

## What it does
Library › **Browse** (under All tracks) lists the collection's Artists, Albums, Genres, Labels and
Years, each value with its songs and length. A click opens that value's songs in the table.

## Behaviour
- **The sidebar:**
  - "Browse" folds open (remembered);
  - under it, Artists, Albums, Genres, Labels, Years, each with how many values there are.
- **A field's page:**
  - a find field; A–Z (years: newest first) or "Most songs" (remembered); the count;
  - rows with the value, its songs and time; albums also show their artist, or "Various artists"
    when no artist has 60 % of it;
  - songs without a value are one row, "No artist" and so on, last.
  - Only the rows on screen are drawn.
- **One value's songs:** the table, titled with the value, with "Artists ›" to go back. Everything
  the table does works there.
- **The same value in any case is one entry** ("Kloudmen" and "kloudmen"); the most common spelling
  shows (on a tie, one that starts with a capital). Artists aren't split ("A & B" stays one).
- **Right-click a value:** Open, Play, Add to queue, Stats….

## How it works
- `core/library/browse.ts` (`facetItems`, `sortFacet`, `inFacet`, `facetValue`).
- `lib/view`: selections `{ kind: 'browse', by }` and `{ kind: 'facet', by, key, value }`;
  `tracksFor`.
- `ui/library/BrowseView.svelte`; the sidebar's Browse group; `LibraryView` (the back crumb).

## Tests
- Vitest `tests/browse.test.ts`.
- e2e `library.spec` "batch C".

## On a phone (2026-09-28)
- The phone's Browse tab uses the same page, with a full-width find field; a value opens its songs
  as a phone list ([ADR 0078](../adr/0078-phone-layout.md)).
- Fixed the same day: the find field's row was squashed to 3 px by a global `.bar` style (it
  had been since batch C, on the desktop too).
