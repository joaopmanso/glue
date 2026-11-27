---
status: accepted
date: 2026-11-27
---
# 0204. GLUE Home mixes the set whenever it runs: the website's mixer ported to Rust, streamed to the tab

Supersedes ADR 0199's "rendering in the browser" (one engine for the preview and the file stays, as one mixer in two
languages held to each other).

## Context
- **The user (2026-11-27):** "we may want to rethink all audio being handled in the browser. if I want to do this remotely
  it gets very slow because it needs to download all the songs locally. it would be best if when I access remotely I can
  get a streamed version while all the processing is handled on the glue home instance".
- **They chose:**
  - GLUE Home mixes whenever it runs, on its own computer too;
  - remotely, Opus at about 192 kbps;
  - an export made remotely is downloaded to the device in use.
- **What the browser did:** it decoded every song into the tab (about 100 MB each) and mixed at about 67× real time.
- **There's no licence in the repo** (all rights reserved), so LAME (LGPL) can't be linked into GLUE Home.

## Decision
- **`crates/glue-sets`:** `src/core/sets/{tempo,dsp,automation,mixer}.ts` ported line for line.
  - JavaScript's numbers: f64 maths, f32 wherever the TypeScript stores into a `Float32Array`, and `glue_audio::js` for
    `Math.*`.
  - **Held to the TypeScript** by `tests/golden/sets`:
    - fixed plans over synthetic songs built from exact arithmetic, so both languages make them bit for bit;
    - every style, key lock on and off, a cut with a tempo jump, a fixed tempo, layering and the bass choices;
    - every 256th frame within 1e-6, the length exact, energy and peak;
    - the resampler;
    - recorded by `tests/sets.golden.test.ts`, replayed by `crates/glue-sets/tests/golden.rs`.
  - **Speed:** about 200× real time for two key-locked decks (`cargo run --release --example bench`).
- **`glue_audio::decode_song`:** a song for mixing, whatever its format. WAV and AIFF are read as the mixdown worker
  reads them; FLAC, DSD and the rest are decoded as the analysis does, through a shared `decode_compressed`.
- **The engine** (`crates/glue-engine/src/sets.rs`), with set sessions:
  - `setOpen {p, c, plan}` → `{id, length, missing}`;
  - `setPlan {id, plan}`;
  - `setClose {id}`.
  Songs are found (`track_path`), read at a player's priority (`Host::read_song_playing`: the analysis gives way),
  decoded and resampled as the mix comes to them. Those due in the next 20 s are decoded ahead, and four more are kept
  for seeking back. Sessions idle for 30 minutes are let go.
- **The local link** (`local.rs`), `GET /set/<id>/pcm?from=<frame>`:
  - the mix from a frame on, as it's rendered: stereo f32, little-endian, interleaved, at 44.1 kHz;
  - chunked, from a bounded channel, so a reader that stops holds the renderer back, and a reader that goes stops it;
  - the test engine streams it as base64 lines, and `e2e/fakeHome.ts` serves it.
- **The website** (`src/lib/sets/home.ts` `HomeSet`):
  - GLUE Home mixes when it runs and has every song's file; otherwise the browser mixes, and the page says why;
  - the preview worker reads GLUE Home's stream as far ahead as it would mix (`setplay.worker.ts` `runHome`);
  - the mixdown worker writes the file from it (`mixdown.worker.ts` `fromHome`): WAV through GLUE's writer, MP3 through
    the existing encoder, so the file is the same, only who mixes changes;
  - the page shows "Mixed by GLUE Home".
- **Remote** (next): the same sessions over a device's connection, the mix sent as Opus for listening and as FLAC for a
  file, which the device writes as WAV or MP3 itself. That will be its own ADR.

## Alternatives considered
- **The browser keeps mixing, and GLUE Home only streams the songs:** remotely, every song still crosses the link whole.
- **Encoding MP3 in GLUE Home:** LAME's LGPL can't be linked into an unlicensed app. The tab already has an encoder.
- **Raw PCM from GLUE Home to the tab, rather than a codec:** on the same computer it costs nothing (352 KB/s over
  127.0.0.1) and is exact.

## Consequences
- Two mixers that must stay one. A change to `src/core/sets` means regenerating `tests/golden/sets` and porting the
  change; CI runs `glue-sets`' goldens and Clippy (`home.yml`).
- In Home mode the tab no longer decodes a set's songs to play or export it. It still reads them for the lanes'
  waveforms when it can; when it can't, a song is drawn as a line.
- GLUE Home 0.84.
