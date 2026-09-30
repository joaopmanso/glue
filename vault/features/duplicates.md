---
status: in-progress
milestone: M5
updated: 2026-09-30
adrs: [0013, 0025, 0117]
---
# Duplicates

## Now
- **Finding them:** fingerprints ("same recording") and names ("probable": artist + title, lengths within 3 s), but
  only copies of the same version: the same version words (instrumental, live, remix, edit…), and lengths within
  10 s or 6 % (ADR 0117).
- **Your say:** "Keep · not a duplicate" takes a copy out of its group for good; "Mark as duplicates" (song menu, 2+
  songs) makes your own group.
- **Cleaning up:** with GLUE Home, the rest move to its duplicates folder or the Recycle Bin (ADR 0070).
- The sections below are the history.

## What it does
Finds every song the collection has more than once, even across formats (a FLAC and an MP3 of the
same recording), shows which copy is best and where each copy is used, and cleans up lists by pointing
them at the best copy.

## Behaviour
- Three tiers ([ADR 0013](../adr/0013-duplicate-tiers.md)):
  1. **Exact**: same size and quick hash.
  2. **Same recording**: audio fingerprint similarity above a threshold (robust to format, bitrate,
     small trims and level changes).
  3. **Probable**: normalised artist + title (strip "feat.", "(Original Mix)", punctuation, case) and
     duration within ±3 s; shown separately as "check these".
- Duplicates view: groups sorted by size of the win; each copy shows tier, format, bitrate, path, and
  "used in 3 playlists, 1 session".
- Preferred copy: automatic (best quality tier, then higher bitrate/sample rate, then most used),
  overridable.
- Actions: "Use preferred copy in all lists" (rewrites list items, undoable), "Exclude others from
  exports", "Ignore this group". No file deletion in v1.
- Track table shows a duplicate badge with the group size.

## How it works
- Fingerprint: chroma-based 32-bit codes (Chromaprint-style) over ~30 s from the middle of the track,
  computed during background analysis from the same decimated signal as tempo/key; stored in
  `GLUE/cache/fingerprints/` (derived, rebuildable).
- Candidate search via locality-sensitive hashing on code substrings; similarity = bit error rate at
  the best alignment.

## Acceptance
- [ ] FLAC vs its 128 kbps MP3 → same group; two different songs with the same title → not grouped
  as tier 2.
- [ ] 50,000 tracks grouped in under a minute after fingerprints exist.
- [ ] "Use preferred copy in all lists" updates every affected list and can be undone.

## Shipped (2026-09-24)
- Fingerprints from the background analysis ([ADR 0025](../adr/0025-band-energy-fingerprints.md));
  groups recomputed when the analysis goes quiet and on "Check again".
- Sidebar › Library › **Duplicates**: "Same recording" groups (matched by sound) and "Check these"
  (same artist + title and length). Each copy: play, format, length, BPM/key, quality verdict, how many
  playlists use it, the best copy marked. Actions: "Use in playlists", "Not duplicates".
- Tracks with a same-recording duplicate show a "2×" badge in the table (click to open the view).
- Not yet: undo for "Use in playlists", "exclude others from exports" (M4), a separate exact tier.

## TO BE SORTED songs (2026-09-25, [ADR 0048](../adr/0048-local-link-to-glue-home.md))
- A song waiting in a GLUE Home's incoming folder that the collection already has (same file name, or
  without " (2)", and same size) shows as that track, on both computers, not as a second row.

## Fingerprints made again in another browser (2026-09-26)
- Reported by the user: `Mala - Changes (SubMarine Bootleg).aiff` and `…_playable_v2.aiff` weren't grouped.
- Measured on the real files: identical fingerprints (bit error rate 0 over 150 s), so the matching is
  fine.
- Both analyses said `fp: true`, but fingerprints live in the browser that made them (ADR 0025), and
  the user's GLUE folder is in OneDrive. The browser in use had no fingerprint for them, and the scan
  skipped such songs silently. **[UNVERIFIED]** for the user's browser (its storage can't be read from
  outside), but it's the only way an identical pair isn't grouped.
- **Now:** the scan counts analysed songs with no fingerprint in this browser. It makes just the
  fingerprint again (decode + fingerprint in the analysis worker, no full analysis), one song at a
  time, and checks again every 100 songs and at the end. Duplicates shows "N analysed songs have no
  fingerprint in this browser … making them now".
- e2e: deleting the browser's fingerprints brings the note up, and the group back.

## Speed (2026-09-26, [ADR 0059](../adr/0059-indexes-rebuilt-by-change-counters.md))
- The view draws 40 groups, then 60 more each time its end comes near. The user's library has 421
  groups, and drawing them all held the page for 0.8 s. A track's "2×" draws down to its group first.
- "In N playlists" comes from an index of playlists by track, not from searching every playlist
  three times per row.
- **Fixed:** analysed songs with no fingerprint whose file couldn't be read (a folder not connected,
  a missing file) made the scan and the fingerprint filling start each other over and over. They
  rescan now only when a fingerprint was made.
- Fingerprints made again now decode in the worker ([ADR 0060](../adr/0060-decode-in-the-worker.md)):
  on the user's desktop, they had held the page for 140–560 ms every few seconds.

## At once on opening (2026-09-27)
- **The user's report:** only the 3 cross-device copies showed at first; the 559 local duplicates came
  after one or two minutes, with or without GLUE Home.
- **Cause:** every scan read one fingerprint file per analysed song, one after another, then matched
  them all again (a sort of every fingerprint piece in the collection).
- **Now:**
  - **The last result is kept** (`cache/dupes/<collection>.json`: the songs fingerprinted and the
    matches) and shown the moment a collection opens.
  - **Fingerprints are packed** per shard (`fp/<collection>/<shard>/pack.bin`). A scan reads the
    packs, then only the single files of songs fingerprinted since (8 at a time), and rewrites those
    shards' packs.
  - **Only the new songs are matched,** against all the others: `findMatchesFor` in
    `core/library/duplicates.ts`. It gives the same votes as the full match for those pairs,
    without sorting everything: a piece's key is 17 bits, so pieces are counted per key and only the
    new songs' are indexed. Unit-tested to equal the full match for every subset.
  - "Check again" still matches everything.
- **Also:** the Duplicates page's links open songs on the tab used last.

## Cleaning up (2026-09-27, [ADR 0070](../adr/0070-glue-home-cleans-up-duplicates.md))
- **With GLUE Home,** each "same recording" group has two actions:
  - "Move the others…" puts them in GLUE Home's duplicates folder (under their music folder's
    name and path);
  - "Delete the others…" sends them to the Recycle Bin.
  Or tick several groups and use the bar.
- **The best copy stays;** "Use in playlists" makes a copy the best (remembered).
- **The confirmation** lists the files, the space freed, and any DJ library that still lists them.
- **Each copy that went folds into the best one:** playlists, DJ libraries' records, rating, notes,
  tags, Prepare. A copy that couldn't go changes nothing.
- **Only "same recording" groups;** "probable" ones aren't confirmed by sound.
- Without GLUE Home, the page says it's needed.

## Confirming probable groups (2026-09-28)
- A probable group (same artist and title, similar length, not matched by sound) has **Same
  recording**. The user confirms it; it's then a same-recording group ("you said it's the same"), so it
  can be moved or deleted like one.
  - Remembered per collection: `meta.dupConfirmed`, the group keys.
  - "Not duplicates" still hides a group.
- Probable groups follow songs' names: when tracks change (edited info, an import), the groups are
  made again from the last matches a moment later, without matching again (`dupes` watches
  `rev.tracks`). Before, an edit showed only after "Check again".
- e2e: two songs given the same artist and title show as probable; confirmed, same; kept over a
  reload.

## Versions kept apart; the user's say (2026-09-30, [ADR 0117](../adr/0117-duplicates-are-one-version.md))
- Reported: an instrumental and the vocal, a studio and a live take, a 4- and a 7-minute version were grouped.
- `versionOf(title, album)`, `similarLength`, `sameVersion`, `pairKey` (`core/library/duplicates.ts`); applied in
  `dupes.build` to sound matches and to probable groups.
- "Keep · not a duplicate" (`[data-apart]`, `dupes.apart`); "Mark as duplicates" (`[data-m="mark-dupes"]`,
  `dupes.markSame`).
- Tests: `tests/versions.test.ts`, e2e `library.spec` ("duplicates by hand").
