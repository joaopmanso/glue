---
status: accepted
date: 2026-09-28
---
# 0096. Move merged collections into the shared one, one computer at a time

## Context
Before [ADR 0094](0094-one-shared-collection-in-glue-cloud.md), a collection on several devices was
several collections merged on the fly ([ADR 0040](0040-cloud-sync-and-merged-collections.md)): each device uploaded its
own copy, every viewer merged them. The plan's phase 4 moves those groups onto the one shared copy,
backup first, keeping ids.

## Decision
- **One device shares first** ("Share", ADR 0094): usually the one with the most songs. Its collection
  becomes the shared one in place, with its ids.
- **Every other device of the group then offers "Move into shared “…”"** in the collection bar. It shows
  when the open collection is in a merged group (`sync.localGroup`) with a collection that's now
  shared. It:
  1. writes a backup of the profile, without songs: `backups/pre-shared-<date>-<cid>.zip`;
  2. adds the shared collection and pulls it;
  3. moves this computer's collection into it (pure `core/shared/adopt.ts`, then `store/shared/seed.ts
     moveInto`):
     - the same song (mergeCollections' `trackKey`, lengths within 3 s) gets this computer's copy;
       fields set here and empty there come along; tags join;
     - a song only here comes in with its own id (another if the id is taken);
     - playlists and folders with the same place and name join (the shared order, then the songs only
       here); the others come in, under their folder;
     - analyses become this computer's; music folders become this computer's; DJ libraries come in,
       pointed at the shared ids;
     - nothing of another computer's is changed;
  4. marks the old collection `movedTo` and takes it out of the profile's list. It stays in the GLUE
     folder as it was, and is no longer uploaded;
  5. opens the shared one and pushes.
- Moving twice gives the same result as moving once (a song this computer already has a copy of at the
  same place is the same song).
- The old per-device copies in GLUE Cloud stay as they were, read only, until phase 7 removes them.

## Alternatives considered
- Building the shared collection from every device's cloud copy at once, on one device (the plan's
  first idea): that device would have to write the other computers' file locations from uploads that may
  be days old, and all at the same time. Each computer moving its own is exact and can be done when it's
  on.
- Moving automatically: this touches the user's data; a button, with a backup, is safer.

## Consequences
- Until every device has moved, those that haven't still see the old merged view. The desktop's part
  there no longer changes, since a shared collection isn't uploaded the old way.
- A phone, a browse session since [ADR 0091](0091-computers-and-sessions.md), has nothing to move: it
  adds the shared collection.
- "Turn on cloud sync later" for a local-only user is just "Share".
