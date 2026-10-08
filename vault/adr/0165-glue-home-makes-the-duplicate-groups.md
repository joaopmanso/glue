---
status: accepted
date: 2026-10-08
---
# 0165. GLUE Home makes the duplicate groups and points playlists at the best copies

## Context
ADR 0164 moved the duplicates' matching into GLUE Home. The page still made the groups from the matches (names,
versions, certainty, concerns, the best copy; ADR 0013, 0117, 0120, 0121, 0145) whenever songs changed, and rewrote
every playlist to the best copies (`bestInLists`): library work, and a write, the page shouldn't do with GLUE Home
running (ADR 0162).

## Decision
- **The groups are pure** (`buildGroups`, `bestLists` in `core/library/duplicates.ts`, from the page's `build` and
  `bestInLists` unchanged) and **GLUE Home's in Rust** (`dupes.rs` `build_groups`, `best_lists`; `names.rs`
  `song_name`, `version_of`): line for line, JavaScript's regular expressions kept (`\b` ASCII-only, alternatives in
  order, lowercase before NFKD), its arithmetic (a missing number is NaN, `Math.round` as `floor(x + 0.5)`), its maps'
  and sets' order. Held to the website byte for byte by `tests/golden/dupes/groups.json` (every rule at work: the
  best copy by grade, lossless and the main folder, a remix, a pair kept apart, a group by hand, an ignored one, names
  through featuring credits, labels, "&"/"and" and accents, a live take kept apart, a confirmed one with a chosen best,
  another computer's match, unknown and zero lengths, names in another script, concerns).
- **When:** after every match (ADR 0164), and half a second after anything they're made of changes: a tab's edit to
  songs, playlists or the collection's meta (the user's say), a sync bringing songs, the collection file or another
  computer's matches. Kept in its cache (`dupes/<p>/<c>.groups.json`); a tab told when they changed.
- **Playlists on the best copies** by GLUE Home's store (only while no tab holds the lease), saved and synced as its
  own edit.
- **The page with GLUE Home** shows its groups (`dupes` answers them) and makes none, nor rewrites playlists; what the
  user says (Keep · not a duplicate, Mark as duplicates, confirm, ignore, the best copy, the main folder) is an edit, and
  the groups come back through the feed. From a GLUE Home before 0.62 (no `groups`), the page makes them as before.

## Alternatives considered
- **Leaving the groups in the page:** they're quick, but they decide a write (the playlists), and with several tabs or
  devices open each would make its own.

## Consequences
- With GLUE Home running the page does no duplicates work at all: what it shows is GLUE Home's.
- A user's answer shows a moment later (the edit, half a second, the groups, the feed) rather than at once; the ones
  that changed a group in place (confirm, ignore, the best copy) still show at once.
- `core/library/duplicates.ts`, `names.ts` and their Rust change together (`GOLDEN=1 npx vitest run
  tests/dupeGroups.golden.test.ts`, then the port).
