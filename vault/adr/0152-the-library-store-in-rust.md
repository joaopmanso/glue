---
status: accepted
date: 2026-10-05
---
# 0152. The library store in Rust, held to the website's byte for byte

## Context
GLUE Home's engine (ADR 0104) still edits the library in JavaScript in its hidden service page: `CollectionStore`
(src/store/collection.ts), the shared-collection projections (src/core/shared/project.ts) and the repair
(src/core/shared/repair.ts). Moving the engine to Rust (the plan approved on 2026-10-03, E1–E5) starts with the
store. The website and GLUE Home both write the same GLUE folder, so they must write the same files.

## Decision
- **`crates/glue-store`** (pure; a `Dir` trait for the folder: `FsDir` on disk, `MemDir` for tests) ports the store
  line for line:
  - `json` (JSON.parse/JSON.stringify as JavaScript does them);
  - `project`, `repair`;
  - `store` (load, the bin, `apply` for every `StoreOp`, `removeTrack`'s shared rules, `reloadFiles`,
    `foldComputer`, `flush`).
- **Records stay ordered JSON values** (`serde_json` with `preserve_order`), never re-modelled: fields the crate
  doesn't know survive, and the key order is the order they were added.
- **What JavaScript does that Rust must too:**
  - object keys in JavaScript's order (array-index keys first, ascending, then insertion order);
  - numbers printed as `String(x)` (shortest digits: 12345678901234567000, 1e+21, 0.000001);
  - `JSON.stringify`'s escaping;
  - a missing `schemaVersion` added as the last key;
  - `??` against truthiness;
  - Map and Set order (a re-set key keeps its place; a deleted one's gone);
  - `localeCompare` for the repair's order;
  - the clock for the bin's names.
- **Held to the website:** `tests/store.golden.test.ts` runs scenarios through the TypeScript store over a memory
  folder (the clock fixed) and records every file after each save (`tests/golden/store/<scenario>/`). It fails when
  they're stale. `crates/glue-store/tests/golden.rs` replays them byte for byte. The scenarios:
  - plain;
  - shared from this computer;
  - shared from a folder that may only read;
  - the stand-in repair;
  - damaged files;
  - a sync's reload;
  - a new computer joining.
- GLUE Home 0.51 links it and tests it; the engine uses it from E2 (ADR 0153).

## Alternatives considered
- **Typed records (structs for Track, List…):** cleaner Rust, but every field GLUE adds would need adding twice, and
  unknown fields would be lost on write.
- **Keep the store in JavaScript and only move the queue:** the hidden WebView stays (the user asked for no
  JavaScript processing in GLUE Home).

## Consequences
- A change to the TypeScript store fails `tests/store.golden.test.ts` until the goldens are regenerated, and then the
  Rust replay until it's ported.
- `absorbTracks` (src/store/merge.ts, used after a repair) and the bin's listing come with the engine (E2).
