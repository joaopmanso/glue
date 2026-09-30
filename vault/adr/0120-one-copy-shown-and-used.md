---
status: accepted
date: 2026-09-30
---
# 0120. Only a song's best copy is shown and used; Duplicates is where copies are decided, in bulk

Amends [ADR 0100](0100-one-row-per-song-and-own-copies.md) (views about copies showed every copy) and
[ADR 0117](0117-duplicates-are-one-version.md).

## Context
The user, 2026-09-30:
- **"15 Biome.aiff" has three MP3 duplicates.** All tracks showed the lossless copy, but "Lower quality" listed the
  song as lossy and opened an MP3. "Only one version of the song is always used and displayed: the best copy.
  Duplicates are shown on the duplicates page so that we can decide what to do with them."
- **Playlists:** "all songs on playlists should always be the best copy". An imported playlist that uses another
  copy should get the best one.
- **The Duplicates page:**
  - filter by type;
  - a certainty percentage, so everything over, say, 95 % can be removed at once ("my collection currently has
    over 4000 duplicates, I can't go one by one");
  - warnings in bulk removal, "if one copy says instrumental on the title and the other doesn't";
  - the "Best copy" label shifted the first row's columns.

## Decision
- **Only the best copy of a song shows, anywhere but Duplicates and a music folder's own files** (`tracksFor`):
  - views of songs by a quality (Lower quality, Not analysed yet, Couldn't analyse, No file linked) leave out the
    copies that don't show, and the sidebar counts them the same way;
  - playlists, folders, imports and DJ libraries' lists show each song as its best copy, once.
- **Every playlist and folder uses the best copies** (`dupes.bestInLists`): rewritten whenever the groups change,
  so an imported playlist or a new match follows. "Use in playlists" is "Make it the best": it chooses the copy
  that stays and shows.
- **Each group has a certainty** (`certainty`, 0–100):
  - marked or confirmed by the user: 100;
  - matched by sound: 60–100 from the fingerprint similarity, less 10 when the names disagree and 10 when the
    lengths spread over 2 s;
  - matched by name only: 50–60.
- **Each group has concerns** (`concerns`): version words that differ in a title or a file name, lengths more than
  3 s apart, other artists. They're shown in the group's header.
- **The Duplicates page:**
  - filters by how a group was found (by sound, marked by you, confirmed by you, probable) and by a minimum
    certainty (80, 90, 95, 99 %);
  - "Tick all shown";
  - a bulk removal lists the ticked groups with concerns and leaves them out, unless "Include them too" is
    ticked;
  - every row has the same columns: the best copy is outlined, and its "Best copy" label takes the place of
    "Make it the best".

## Consequences
- A copy that's matched by mistake disappears from playlists as well as the library until it's taken out with
  "Keep · not a duplicate". Playlists then keep the best copy they were rewritten to.
- Moving thousands of duplicates is a filter, a tick and a confirmation, with the doubtful groups set aside.
