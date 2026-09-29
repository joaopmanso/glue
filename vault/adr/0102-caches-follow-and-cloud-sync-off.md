---
status: accepted
date: 2026-09-29
---
# 0102. Caches follow a collection; turning cloud sync off keeps it here, the account's copy optionally goes in 30 days

## Context
- When the desktop's collection went into the account's (another id), every cache keyed by collection
  id was left behind: the browser's details, mini waveforms and spectrograms, fingerprints and covers,
  and GLUE Home's own. The waveforms and analyses looked lost, and GLUE Home started making them all
  again.
- The user (2026-09-29): turning cloud sync off should prompt to keep a local copy, or download the
  data; the cloud data is deleted 30 days later; turning it back on cancels the deletion.

## Decision
- **Caches follow a collection that goes into another** ("Put into", ADR 0096/0101):
  - The browser (`store/shared/caches.ts moveCaches`) moves `details/`, `thumbs/`, `wthumbs/` and `fp/`
    (single files; packs are made again) from the old id to the new, with the ids `adopt` changed, then
    `art/`. The old duplicates result goes (matched again). It runs in the background after the move.
  - The old `collection.json` keeps `movedTo` and `movedIds` (only the ids that changed). GLUE Home
    (`home/ui/moves.ts`) copies its own `t|w|d|c/<pid>/<old>/…` entries to the new id, once per moved
    collection (a marker in its cache), soon after starting and hourly.
- **Cloud sync is per profile, on this computer.** Turned off (the switch on the start page), a box
  asks first:
  - this computer keeps its collections (its GLUE folder, or this browser's storage) and stops syncing
    them; other devices keep theirs;
  - only in this browser's storage: it offers to download a copy (the profile's backup zip);
  - a checkbox: also delete the account's copy from GLUE Cloud in 30 days.
- **GLUE Cloud** (migration `0007`): `shared_collections.delete_after`, set by `POST
  /v1/shared/:cid/leave {remove}`.
  - Any pull or push of the collection clears it: a device still syncing it means it's in use.
  - Turning sync on again sends `remove: false`.
  - A daily cron (`wrangler.toml [triggers]`, `index.ts scheduled`) deletes what's past its date.
- **A profile with cloud sync off isn't synced**, by the tab or by GLUE Home.

## Alternatives considered
- Keying caches by something that never changes (a song's file hash): a rewrite of every cache, for a
  move that happens once per computer.
- Deleting the account's copy when any device turns sync off: the other devices still use it.

## Consequences
- A move's cache copy can take a while (thousands of files; over the local link in Home mode). Until
  it's done, some waveforms show as not made yet.
- The account's copy of a collection nobody syncs any more goes 30 days after it was asked to, unless
  a device syncs it again first.
