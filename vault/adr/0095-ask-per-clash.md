---
status: accepted
date: 2026-09-28
---
# 0095. Ask per clash, on the device that made the change

## Context
In a shared collection ([ADR 0094](0094-one-shared-collection-in-glue-cloud.md)), a change made on two
devices differently (a playlist renamed on both, a song's title changed on both, edited on one and
deleted on the other) can't be merged. The user chose, on 2026-09-28, to be asked each time: a small box
with "Keep this device's / Take the other's / Merge both".

## Decision
- **The merge keeps the cloud's value** in place and records the clash with the device's sync state
  (`cloud/shared/<cid>.json`, `clashes`): the file, the place in it (`items.<id>.title`, `name`…), both
  values, the other device and when (from GLUE Cloud's list of changes: `updated_by`, `updated_at`).
- **The box** (`src/ui/library/ConflictBox.svelte`, bottom right, only for a shared collection) lists
  them with human labels (the song's title or the playlist's name, and the field) and both values:
  - **Keep this device's**: this device's value is written back at that place
    (`engine.resolveClash` with `setAt`), and the next push sends it to every device;
  - **Take the other's**: nothing to write, the clash is forgotten;
  - **Merge both**, only where it means something (`mergeBoth`): lists and sets joined, text one after
    the other;
  - "For all" does the same for every clash.
- **Clashes stay until answered**: they survive a reload (kept in the sync state), and each sync shows
  what's waiting.
- **No `shared_conflicts` table in GLUE Cloud for now.** The clash lives on the device that made the
  losing change, which is the one that can say what it meant. GLUE Home, which has no box, gets the same
  treatment once it syncs (phase 5): it keeps the cloud's value and posts its side for a device with a
  screen to ask.

## Alternatives considered
- Last change wins silently (ADR 0040's way): what the user asked to stop.
- Asking on every device: the other device's change is already in place there; asking it too would ask
  twice about one thing.
- Holding the push until answered: the rest of the file's changes would wait for an answer, and an
  unanswered box would stop syncing.

## Consequences
- Until the answer, every device shows the other device's value; nothing of this device's is lost.
- An answer is an ordinary change: it can itself clash, if a third device changed the same thing
  meanwhile.
- GLUE Home's clashes need somewhere to go (phase 5).
