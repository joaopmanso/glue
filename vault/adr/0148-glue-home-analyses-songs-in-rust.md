---
status: accepted
date: 2026-10-02
---
# 0148. GLUE Home's queue hands each song to the native engine

## Context
ADR 0147 ported GLUE's analysis to Rust (`crates/glue-audio`), and GLUE Home 0.45 linked it and checked it against
stored results. The service page still analysed: `home/ui/cache.ts` `analyse()` read the song over the local link
(`/home/file`), ran the website's worker pool on it, and wrote each cache file through the bridge. Batch 3 of ADR 0147
moves the work itself to Rust while the queue (lanes, tries, network-folder turns, writing results into the
collection, `made` events) stays where it is for now.

## Decision
- **One command, `analyse_song(path, p, c, id, mtime)`** (`home/src-tauri/src/analysis.rs`). In Rust it:
  - checks the path is in a folder GLUE Home may read;
  - reads the file whole, paced to give way to a song being played (`Paced`, `Pri::Analysis`, ADR 0138);
  - tells the service page when the reading is done (event `analysis-step`, `p/c/id`), for the Speed panel's meter
    (ADR 0136);
  - analyses it on a thread of its own (16 MB of stack, a caught panic), with a deadline of 2 minutes or a second a MB
    (`timeFor`, ADR 0144), checked between the engine's stages and in its decoders' loops (`glue_audio::control`);
  - writes `t`, `w`, `d` (`.bin`, then its header), the cover (`a/<hash>-64|320.jpg`, `c`), `p`, then `s` last.
- **The same failures as before, in the same words:**
  - passing ones are an Err the queue retries: unreadable now (`could not be read`), a network folder dropping
    mid-file (`read only part of …`), out of time (`took too long`), a panic (`analysis worker stopped`);
  - a song that can't be analysed is saved as failed (`s` with its `error`) and answered `{ failed }`.
- **`cache.analyse()` keeps its shape** (it returns bytes, reading and analysing times), so the queue, the urgent
  requests and the background fill use the engine unchanged. GLUE Home's analysis runs as many at a time as the queue
  starts (its "Songs at a time").
- **Tests**: `e2e/tauri-mock.ts` stands in for `analyse_song` with the website's own pipeline (`e2e/home-analyse.ts`),
  built next to GLUE Home's pages into `.e2e-home/` for the e2e server, never into `home/dist`, which GLUE Home ships.
  Rust tests cover the files written, their order and the failed record (`analyse_into`).
- `verify_song` (0.45) skips songs analysed natively: there's nothing to compare them with.

## Alternatives considered
- **Two commands (read, then analyse)**: the meter's two steps for free, but the song's bytes would wait in GLUE
  Home's memory between two calls, with a handle to clean up when a call never comes. One call and an event instead.
- **A pool of Rust threads sized by GLUE Home**: the queue already decides how many run (network-folder turns, pausing
  while playing); a second limit would fight it. A thread per running song.
- **Keeping the JavaScript pool for formats Rust doesn't decode yet** (Opus, HE-AAC): ruled out by the user (ADR
  0147); such a song is saved as "Couldn't analyse", with why.

## Consequences
- GLUE Home's results say `engine: "glue-audio <version>"`; if the desktop's check (0.45) finds differences, those
  songs can be found and analysed again.
- The WebView no longer holds songs in memory, decodes or runs workers for the library; incoming songs still do (B4).
- `/home/file` has no caller left in the queue (B4 removes it with the rest of the audio JavaScript).
