//! GLUE's library store in Rust (ADR 0152): a collection's JSON files read, changed and written exactly as the
//! website's TypeScript does (src/store/collection.ts and what it uses), so GLUE Home can be the library's engine
//! without JavaScript. Records are kept as ordered JSON values, never re-modelled: fields this crate doesn't know
//! survive, and the files are byte for byte the website's (tests/golden/store, recorded from the TypeScript).
//! - `json`: JSON.parse / JSON.stringify as JavaScript does them;
//! - `dir`: a GLUE folder (on disk, or in memory for the tests);
//! - `project`: src/core/shared/project.ts; `repair`: src/core/shared/repair.ts;
//! - `store`: src/store/collection.ts (+ src/store/migrations.ts, merge.ts `absorbTracks`, writeInfo.ts, counts);
//! - `backup`: src/store/backup.ts and src/core/zip.ts (a profile's backup zip);
//! - `merge3`: src/core/shared/merge3.ts (a shared collection's three-way merge).
pub mod backup;
pub mod dir;
pub mod json;
pub mod merge3;
pub mod project;
pub mod repair;
pub mod store;
pub mod tidy;
