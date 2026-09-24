---
status: planned
milestone: M7
updated: 2026-09-24
adrs: [0013]
---
# Duplicates

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
  `MCO/cache/fingerprints/` (derived, rebuildable).
- Candidate search via locality-sensitive hashing on code substrings; similarity = bit error rate at
  the best alignment.

## Acceptance
- [ ] FLAC vs its 128 kbps MP3 → same group; two different songs with the same title → not grouped
  as tier 2.
- [ ] 50,000 tracks grouped in under a minute after fingerprints exist.
- [ ] "Use preferred copy in all lists" updates every affected list and can be undone.
