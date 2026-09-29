---
status: accepted
date: 2026-09-29
---
# 0101. Cloud sync on means every collection is the account's; one sync only

## Context
On the user's first real try of the shared collection (2026-09-29), two sync systems ran at once. The
old per-device copies ([ADR 0040](0040-cloud-sync-and-merged-collections.md), 0042, 0043, 0087) ran
next to the shared collection ([ADR 0094](0094-one-shared-collection-in-glue-cloud.md)), with Share and
Move buttons. When the desktop moved in, the old sync's manifest dropped the desktop's copy every other
device was showing.

The user restated the model, like Plex:
- one library per account, split into collections;
- offline, everything is local;
- with cloud sync on, every device sees and edits the same collections, with no Share button;
- GLUE Home is the computer's local server.

Decisions (the user): remove the old sync now; when a second computer with its own collection meets the
account's, ask once.

## Decision
- **One sync: the account's collections** (the shared collection, ADR 0094). Removed:
  - site: `lib/sync.svelte.ts`, the per-device upload, merged groups, the overlay, cloud views
    (`lib.cloud`, `enterCloudView`), the edits queue (`core/library/cloudEdits`, `overlay`,
    `mergeCollections`);
  - GLUE Home: applying edits (`home/ui/edits.ts`);
  - Worker: the `/v1/sync/*` routes.
  - The old D1 tables (`sync_*`) stay untouched for now. Dropping them touches the user's cloud data,
    so it waits for the user's go-ahead.
- **Cloud sync on (per profile, on by default when signed in): a collection becomes the account's when
  it opens** (`shared.ensure`, `src/lib/shared.svelte.ts`):
  - the account has no other collection: in place, keeping its id (`makeShared`), quietly;
  - this collection is the account's already: synced;
  - it's empty (a new profile): it takes the account's collection (`moveInto`);
  - otherwise **a box asks once** (`JoinBox.svelte`): put this computer's songs into the account's
    collection (the same name first, then the biggest; `adopt`, ADR 0096), keep it as a collection of
    its own (`makeShared`), or not now (asked again next time).
  - The Share and Move buttons are gone; the chip says "Synced".
- **A device with no library of its own** (a phone, a sign-in to browse) keeps the account's collections
  in the browser's storage: a GLUE folder there, a profile, the collections added (`lib/anywhere`). It
  opens, edits and streams like any device, and stays a session (ADR 0091).
- **A member of a collection is a computer that holds copies**: one with a music folder or a song's copy
  (`collectionShared`, `holds`). A phone that only browses isn't listed.
- **A sign-in becomes a device when it pushes from a computer with songs of its own** (`push?music=1`),
  since the old manifest that did this is gone. Joining a browser into another computer is refused when
  it holds music (its role, no longer the old profile list).
- The admin panel counts the account's collections (`shared_*`); "Clear cloud data" clears them too.

## Alternatives considered
- Keeping both syncs until every device moved: what caused the loss.
- Merging a second computer's collection automatically by name: the user chose to be asked.

## Consequences
- Supersedes ADRs 0040, 0042, 0043, 0087, and 0077's "nothing is made on the device".
- ADR 0096's Move button becomes the box's "Put into".
- Still to do (plan-shared-collection, part 1 B):
  - caches following a collection on "Put into" (waveforms, details, fingerprints; GLUE Home's too);
  - turning cloud sync off (a prompt, and the account's copy deleted 30 days later unless it's turned
    on again);
  - dropping the old tables.
