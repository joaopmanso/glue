---
status: accepted
date: 2026-09-30
---
# 0117. Duplicates are the same version of a song; the user can say which aren't, and which are

Amends [ADR 0013](0013-duplicate-tiers.md) (what makes two copies duplicates) and
[ADR 0025](0025-band-energy-fingerprints.md) (a fingerprint match alone is enough).

## Context
The user, 2026-09-30:
- These were grouped as duplicates:
  - an instrumental and the vocal version of a song;
  - the studio and the live version of a song;
  - a 4-minute and a 7-minute version of a song.
- Matching will never be flawless. They want to:
  - keep a false positive in the Duplicates view, so the real duplicates can be removed, and mark it as not a
    duplicate;
  - mark songs chosen in the library as duplicates of one another, by hand.

Why these matched:
- Fingerprints compare band energies over time. An instrumental shares the vocal version's backing track.
- A radio edit is contained in its extended mix, far longer than the 20 seconds a match needs.
- Probable groups compare artist and title with anything in [brackets] and "(… Mix)" stripped, so "[Live]"
  disappeared.

## Decision
- **Two copies are duplicates only if they're the same version** (`sameVersion` in
  `src/core/library/duplicates.ts`), whichever way they matched (by sound, or by name as "probable"):
  - **the same version words.** They're read from the title's (…) and […] parts and what follows " - ", so a
    name like "Clean Bandit" never counts; "live" is also read from the album ("Live at …"). The words:
    instrumental/inst, a cappella, live, unplugged, remix, dub, VIP, bootleg, acoustic, demo, extended, edit,
    rework, flip, mashup, karaoke, reprise, clean. "(Original Mix)" isn't a version.
  - **lengths within 10 s, or 6 % on long songs.** A rip trimmed of its silence still matches; a radio edit
    against its extended mix doesn't.
  - Matches are still found and kept as before; these rules apply when the groups are made.
- **"Keep · not a duplicate"** on a copy in the Duplicates view:
  - that copy is no duplicate of the others in its group; the pairs are remembered (`meta.dupApart`);
  - it leaves the group for good, and the rest can be cleaned up.
- **"Mark as duplicates"** on two or more songs chosen in the library:
  - they're one group by the user's say-so (`meta.dupManual`, merged with any group they're already in);
  - it counts as a same-recording group ("you marked them as duplicates"): one row in the library, and
    cleaned up like any other.
- Both are kept in the collection's `collection.json`, so they sync with a shared collection.

## Consequences
- Versions are kept apart even when their tags say nothing about it only when their lengths differ.
  Otherwise (an untagged instrumental of the same length) the user's "Keep · not a duplicate" is the answer.
- Duplicate groups already shown change without a new match: the rules apply when they're made.
