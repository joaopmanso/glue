//! GLUE's set mixer in Rust (ADR 0204): `src/core/sets/{tempo,dsp,automation,mixer}.ts` ported line for line, with
//! JavaScript's numbers, so GLUE Home mixes a set as the website would. Held to the TypeScript by `tests/golden/sets`
//! (recorded by `tests/sets.golden.test.ts`, replayed by `tests/golden.rs`).
pub mod automation;
pub mod dsp;
pub mod mixer;
pub mod tempo;
pub mod types;

pub use mixer::{Mixer, Pcm, Sources};
pub use types::{SetItem, SetPlan, MIX_RATE};
