---
status: accepted
date: 2026-10-05
---
# 0153. GLUE Home's library engine in Rust, tested end to end against the real one

## Context
GLUE Home is the library's engine (ADR 0104): a GLUE tab on its computer sends its edits over the local link's
`/rpc`, and GLUE Home saves them and feeds the changes back. Until 0.51 the engine was JavaScript in GLUE Home's hidden
service page (`home/ui/engine.ts`), and every write it made to the GLUE folder went back over the local link's HTTP to
GLUE Home's own Rust. The store is now in Rust, held to the website's byte for byte (ADR 0152). The plan approved on
2026-10-03 moves the engine next (E2), then the analysis queue (E3), the cloud side (E4) and the rest (E5).

## Decision
- **`crates/glue-engine`** (no Tauri; a `Host` trait for what GLUE Home provides: the lease, the settings, events, tag
  writing, whether a music folder is reachable, the clock) holds:
  - one `glue-store` store per collection, kept open, writing the GLUE folder straight to disk;
  - the feed of changes for `wait` (a condition variable, at most 500 kept, 25 s per wait);
  - the jobs (`j/jobs.json` in GLUE Home's cache; removing songs 250 at a time, their GLUE copies too, carried on after
    a restart);
  - the repair of a shared collection's parts written under another id, once per load, after a backup
    (`backups/pre-repair-<date>-<profile>-<collection>.zip`, made in Rust, read by the website's `readBackup`);
  - `takeWritten`/`writtenAgain` (what the shared sync looks at, every file every 30 minutes) and `writeUnwritten`
    (song info into the files, ADR 0071).
- **The local link answers `/rpc` in Rust** (`home/src-tauri/src/engine.rs`): `hello`, `wait`, `open`, `status`,
  `edit`, `restamp`, `job`. The analysis queue's requests (`analyse`, `pause`, `where`, `whereFile`) still go on to the
  service page until E3.
- **The service page uses the same stores** through one Tauri command, `engine_cmd` (`glue_engine::command`: `ensure`,
  `song`, `apply`, `reload`, `counts`, `writeUnwritten`, `takeWritten`…); the engine's events come back as
  `engine-event`, `engine-edited`, `engine-added`, `engine-changed`. `home/ui/engine.ts` is now a thin wrapper.
- **Every 10 s** GLUE Home carries on the jobs, or, while a tab from before the engine holds the lease, lets the stores
  go (nothing kept goes stale).
- **The e2e tests run the real engine:** `glue-engine-test` (the crate's second binary) runs it over the test's
  folders, driven by JSON lines. `e2e/fakeHome.ts` starts it and sends `/rpc` to it first, as `local.rs` does; the
  Tauri stand-in's `engine_cmd` and events reach it through the fake link's `/engine` and `/engine/notes`.
  `e2e/engine-build.ts` (Playwright's global setup) builds it; the e2e workflow caches its dependencies.

## Alternatives considered
- **Keep the JavaScript engine, only writing to disk natively:** half the hop removed, but the hidden WebView and its
  copy of the store stay, which the user asked to be rid of.
- **Test the engine only in Rust, keeping the JavaScript stand-in in the e2e tests:** the stand-in would drift from
  what GLUE Home really does; driving the real binary costs a `cargo build` before the run.
- **A typed protocol between the service page and Rust per command:** more code for a bridge that goes away in E3–E5.

## Consequences
- A tab's edits are saved without a round trip through the WebView, and the service page no longer holds a copy of
  each collection.
- The e2e tests need Rust on the machine (both computers and CI have it).
- `glue-engine-test` and `home/src-tauri/src/engine.rs` must stay two thin hosts of the same `command` dispatcher.
- The analysis queue (E3) and the shared sync (E4) still call the engine from JavaScript; they move next.
