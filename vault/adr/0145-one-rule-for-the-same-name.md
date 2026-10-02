---
status: accepted
date: 2026-10-02
---
# 0145. Judge "the same name" one way, in `core/library/names.ts`

## Context
Five functions decided whether two names were the same, each with its own rule: `plain` in `duplicates.ts` and
`relink.ts`, `norm` in `dupes.svelte.ts`, `shared/match.ts` and `coverSearch.ts`. So Duplicates, No file linked,
joining a collection and the cover look-up disagreed (the code map found them, 2026-10-01):
- "Frankie & Johnny" and "Frankie And Johnny" were one song for No file linked, two for Duplicates and joining;
- Duplicates' `\bfeat.*` also cut "Feather" or "Feature…" down to nothing;
- only `a-z0-9` was kept, so a name in Japanese or Cyrillic came out empty: when joining, every such song with an
  artist and a title had the key `a||`;
- "probable" duplicates kept a song in its name's group when it had any twin of its own length, so a title's
  original, remix and a cappella pairs became one group ("Revolution 909").

The rules were compared on the user's collection (the laptop's copy, 18,663 songs, read only) before and after.

## Decision
`src/core/library/names.ts` holds the rules, and everything that compares names uses them:
- **`fold`**: lowercase letters and digits of any script, without accents; "&" and the word "and" left out alike
  (so "A & B" is "A and B" and "A, B"). Joining a collection (`trackKey`) and playlist names (`adopt`).
- **`songName`**: `fold` without […] parts, a featuring credit (up to the next bracket), or (…) parts that only say
  the release or the version: "(Album Version)", "(Remastered 2009)", "(Single Version / Mono)", "(Extended Mix)",
  "(1909-34)", "(feat. X)". Other (…) parts stay part of the name: "(Live at Hyde Park)", "(BBC Session)",
  "(Remixed by …)", "(Numa Crew)". A name that's all brackets stays itself. Duplicates (`nameKey`, `certainty`,
  `concerns`) and No file linked (`relink.ts`).
- **`bare`**: without any bracket, for the cover look-up (`coverSearch.ts` adds its "the" and "with" rules).
- `versionOf` and its version words moved there too (they decide which brackets say nothing).

"Probable" duplicates are `nameGroups` (`duplicates.ts`, pure): the same `nameKey`, then split into copies of the
same version within 3 s of each other.

No file linked also compares a song with no file only through title words some other song has: a word no other song
had ("INGOT_HM": "hm") left it nothing to compare.

## Alternatives considered
- **Leave out every bracket for songs (`bare`)**: found more true duplicates ("(Album Version)", "(Remastered)"),
  but about a quarter of the new "probable" groups in a sample of 45 were other recordings (two live shows, a BBC
  session, a "Remixed by" mix, an "English Version").
- **Keep the old Duplicates rule** (only "(Original/Extended/Radio/Club Mix/Edit/Version)" left out): misses the
  release labels, and keeps the disagreement with No file linked.
- **`&` read as "and"**: then "Paul Simon, Art Garfunkel" stopped matching "Paul Simon & Art Garfunkel" when
  joining. Leaving out both keeps both pairs.

## Consequences
- On the user's collection: "probable" groups 1,531 → 1,617 (3,757 → 4,023 songs); the new ones are almost all the same recording
  under a release label; groups that mixed versions or lengths are split; the user's 13 ignored, 2 confirmed and
  6 chosen-best groups are untouched (none was a name group). Joining: two more pairs ("&" and "And"). No file
  linked: 2 suggestions for the 11 songs with no file, where there were none.
- The cover look-up's keys change for names with "&", "and" or another script: those albums are looked up once
  more.
- A new rule about names goes in `names.ts`, with a case in `tests/names.test.ts`.
