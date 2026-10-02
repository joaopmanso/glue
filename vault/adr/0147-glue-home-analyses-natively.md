---
status: accepted
date: 2026-10-02
---
# 0147. GLUE Home analyses natively, in Rust

## Context
GLUE Home is the computer's engine (ADR 0104), but its audio work ran as JavaScript in a hidden WebView:
`home/ui/service.ts` → `cache.ts` `analyse()` → `src/lib/pool.ts` → `src/workers/analysis.worker.ts`. To analyse a
song, that WebView fetched the file from GLUE Home's own Rust side over HTTP (`/home/file`, 1 MB at a time), decoded it
with the browser's decoders (stalls, page-decode fallbacks; ADR 0144), and was held to a browser's speed and memory.

The user (2026-10-02): GLUE Home should take advantage of being an app; "JavaScript is a very inefficient language for
audio". All audio processing in GLUE Home is to be native, with no JavaScript fallback inside GLUE Home. The UI stays
the Svelte app.

Measured on the user's collection (the laptop's copy of its JSON, 18,651 songs): 8,968 FLAC, 5,138 AIFF, 2,994 MP3,
1,035 WAV, 343 M4A (23 ALAC, 11 AAC-LC, 320 not identified), 91 DSF, 22 AAC. No Opus, no HE-AAC. **342 M4A files fail
today** ("It couldn't be decoded": ~30 MB for 5 minutes, so Apple Lossless, which the WebView can't decode), and the 91
DSF files ("DSD files can't be decoded in a browser").

## Decision
- **A pure-Rust engine crate, `crates/glue-audio`**: no Tauri, no file I/O, so it can later compile to WebAssembly for
  the website. A line-for-line port of the TypeScript, one module per file (`formats/{parse,clues,flac}`,
  `audio/{analyze,verdict,fingerprint}`, `out/summary`, …), with JavaScript's numbers:
  - the f32 storage points and the order of every sum as in the TypeScript (Float32Array stores round, the rest is f64);
  - `js.rs`: `Math.*` through `libm` (within 2 ulp of V8 on the inputs the analysis uses: `tests/jsmath.rs` against
    `scripts/jsmath.mjs`; fdlibm and V8 differ by 1–2 ulp on 0.001–9% of inputs, far below what reaches a stored
    result), `Math.round` (halves up), `toFixed` (exact decimal, halves up), number-to-string, `ToInt32`, JavaScript's
    `trim`; `x ** 2` is `x * x` (as V8's `pow`);
  - JavaScript's reading rules in the parser: a byte past the end is 0, a `DataView` read past the end fails the parse
    (blank info, as the worker); windows-1252 for `TextDecoder('latin1')`, BOMs dropped by the UTF decoders;
  - GLUE's own FLAC decoder ported too (it skips junk before the first frame, ADR 0144); WAV/AIFF read directly;
    other codecs through Symphonia (MP3, AAC-LC, ALAC, Vorbis), trimmed as the browser trims (`mp3Gapless`,
    `keepRange`).
- **Held to the website's results**: `tests/golden.test.ts` writes what the TypeScript pipeline makes
  (`tests/golden/<case>/{info,summary,verdict,result}.json`; `GOLDEN=1` to regenerate), and fails when they're stale, so
  a change to the JavaScript analysis has to be made in Rust too (`crates/glue-audio/tests/golden.rs` fails until it
  is). Text identical; numbers within 1e-12 (info, summary), 1e-9 (verdict), 1e-6 (spectrum, stats).
- **Same versions and formats**: `ANALYSIS_VERSION` 3, `VERDICT_VERSION` 8, `DETAILS_VERSION` 2 stay, and GLUE Home's
  cache files (t, w, d, p, s, c, a, i) keep their exact formats, so the website and other devices read native results
  unchanged. A native summary says `engine: "glue-audio <version>"`.
- **In GLUE Home** (`home/src-tauri`): the engine as a path dependency (no Cargo workspace: the build paths stay);
  `panic = "unwind"` (a panic on one file is caught, not the end of GLUE Home); `opt-level = 3` for the engine while the
  app stays `"s"`.
- **Batches**, each a release:
  1. 0.44: the engine for lossless files (parse, clues, FLAC, stats, spectrum, tempo/key, verdict, summary), linked
     into GLUE Home and tested there, not used yet;
  2. the rest of the outputs (details, mini spectrogram, waveform, fingerprint file, cover, tags) and the lossy
     decoders, a dry-run `verify` on the desktop against the ~18.6k stored results (the gate for 3);
  3. GLUE Home's service page calls the engine (`analyse_song`: Rust reads, decodes, analyses and writes the cache);
     the queue and the collection writes stay where they are for now;
  4. no audio JavaScript left in GLUE Home's bundle (incoming songs, cover hashes and covers native too; a guard test);
  5. native-only: DSD, a re-check of songs that failed under an older engine;
  6. streaming and the sessions to other devices native (WebRTC data channels in Rust).

## Alternatives considered
- **rustfft and Rust's own maths**: faster to write, but the spectrum would differ by more than rounding; the port of
  `fft.ts` costs 30 lines and keeps results the same.
- **Porting V8's exact `Math` functions**: bit-identical, but weeks of work for differences that never reach a stored
  value (measured on the goldens: identical results with libm).
- **Symphonia for FLAC too**: it would need the junk-skipping of ADR 0144 rebuilt; the port is 220 lines with the same
  behaviour.
- **Keep the JavaScript for formats Rust can't decode yet**: the user ruled out JavaScript in GLUE Home; a format the
  engine can't decode is saved as "Couldn't analyse" with why.

## Consequences
- Two implementations of the analysis until the website uses the crate as WebAssembly (a later ADR): the golden gate
  keeps them together.
- The laptop builds GLUE Home: Rust lives in `C:\Work\rust` (`CARGO_HOME`, `RUSTUP_HOME`): the work laptop's policy
  blocks programs under `%USERPROFILE%\.cargo` and `.rustup`.
- CI runs the engine's tests and clippy on Windows and macOS (`.github/workflows/home.yml`).
- The 342 ALAC songs and the 91 DSF songs become analysable (batches 2 and 5).
