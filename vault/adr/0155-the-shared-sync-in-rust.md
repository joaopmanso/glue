---
status: accepted
date: 2026-10-05
---
# 0155. GLUE Home syncs the shared collections in Rust, held to the website's sync

## Context
GLUE Home syncs this computer's shared collections with GLUE Cloud while no GLUE tab here does (ADR 0097). Until 0.53
it ran the website's own sync (`src/store/shared/engine.ts`, `merge3.ts`) in the hidden service page, writing the GLUE
folder back over the local link's HTTP, and asking the Rust engine (ADR 0153) for the files to look at and to read
again afterwards. The plan's E4 moves the cloud side to Rust. It's split in two: the shared sync first (E4a, this
ADR), then the signaling, the sessions and the answers to other devices, identity and ICE (E4b).

## Decision
- **`glue_store::merge3`** ports the three-way merge, and **`glue_engine::sync`** ports the sync line for line:
  - the agreed state (`cloud/shared/<cid>.json` and the agreed texts);
  - pull (the log, or the snapshot behind its floor, merged three ways, clashes kept);
  - push (only the songs that changed, in entries under GLUE Cloud's sizes, again after a stale revision);
  - the checkpoint when GLUE Cloud asks.
  - `SharedCloud` is the cloud's six routes.
- **Held to the website's:** `tests/sync.golden.test.ts` runs scenarios through the TypeScript sync against GLUE
  Cloud's real code on an in-memory database: a first sync from the snapshot, a push, a merge with a clash, a stale
  push, a checkpoint and a deletion. It records every call to GLUE Cloud with its answer, and the folder after each
  sync (`tests/golden/sync/`). `crates/glue-engine/tests/sync_golden.rs` replays them and must make the same calls
  in the same order (packed texts compared unpacked: two gzips differ in bytes), and leave the same files, byte for
  byte.
- **GLUE Home's loop** (`glue_engine::shared`, from `home/ui/sharedSync.ts`) is the engine's:
  - the profiles whose cloud sync is on, the shared collections, as this computer once it's known;
  - only while no tab holds the lease;
  - the files written since the last sync (or all of them now and then);
  - what came in read into the store;
  - this computer's numbers sent;
  - edited song info written into the files, then synced again;
  - a collection deleted from the account (410) backed up and put away.
- **GLUE Cloud is the host's** (`Host::cloud`): GLUE Home calls it with `ureq` and its access token (kept 40 minutes);
  the e2e tests' engine hands each call to the test (`fake.cloud`).
- **What starts a sync stays in the service page until E4b** (a push from the room, a tab's edit, every minute):
  it calls `engine_cmd` `syncShared`.

## Alternatives considered
- **Port the sync with E4b in one release:** the sync alone is the riskiest part (it writes the user's library and
  the account's copy), so it ships and is checked on its own first.
- **Compare the packed texts' bytes:** gzip's output differs between JavaScript's CompressionStream and flate2; GLUE
  Cloud reads either.

## Consequences
- A change to the TypeScript sync fails `tests/sync.golden.test.ts` until the recordings are made again, and then
  the Rust replay until it's ported.
- `home/ui/sharedSync.ts` is gone; the service page no longer writes the GLUE folder for the sync.
- GLUE Home's Rust now talks to GLUE Cloud itself, the first part of it to do so.
