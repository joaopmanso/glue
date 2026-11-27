---
status: accepted
date: 2026-11-27
---
# 0199. A set is a playlist laid out on one beat clock, mixed by one engine for the preview and the file

## Context
- **The user (2026-11-27) asked for a "set builder":**
  - a playlist turned into a mix;
  - transitions controlled, songs moved;
  - 2 or 3 decks;
  - automix styles (one song at a time, continuous mixing, double drops).
- **Then: "the export is the end product, in this case the mixed set."**
- **They chose:**
  - formats: WAV 24-bit and MP3 320;
  - control: GLUE plans every transition, the user moves points and picks styles (drawn curves later);
  - rendering in the browser, one engine for listening and the file;
  - key lock on and switchable;
  - stems later.
- **What playback had:** one `HTMLAudioElement` (no mixing), a decoder in a worker (`decodeHere`), no resampler and no
  time-stretch.

## Decision
- **The model:** `List.set` (`SetPlan`, `src/core/sets/types.ts`), with the playlist:
  - decks, style, tempo (each song's or one BPM), and the items.
  - **Every song runs on one clock of mix beats.** A song is its id, deck, BPM and first beat, its in-point (s, a
    downbeat), its start (a mix beat, a bar), how many beats it plays, key lock, trim (dB), and the hand-over into the
    next (`fx.style`, a double drop's `drop`).
  - At mix beat b a song is `in + (b − start) · 60 / bpm` seconds into its file. So songs that overlap are beat-matched
    by construction, and moving one is a whole number of bars.
- **The tempo map** (`tempo.ts`): BPM per mix beat, linear between knots, its times and their inverse in closed form.
  - 'songs': each hand-over held at the outgoing song's BPM, eased from one hand-over to the next over the song between;
    a cut jumps.
  - 'fixed': one BPM.
- **One engine** (`src/core/sets/`, pure): `dsp.ts` and `mixer.ts`.
  - `dsp.ts`:
    - a windowed-sinc resampler to 44.1 kHz;
    - cubic varispeed;
    - key lock by WSOLA (our own: 2048-sample grains every 1024, each placed where it best continues the last, within
      ±512);
    - a 3-band isolator (Linkwitz-Riley at 250 Hz and 2.5 kHz, all-pass at unity, a band killed > 40 dB down);
    - a one-knob filter;
    - a beat-synced echo;
    - a lookahead limiter at −0.3 dBFS.
  - `mixer.ts` renders in fixed hops counted from the set's start (blocks of any size give the same samples), asks for
    each song's PCM only while it plays (`needed`), and runs at ~60× real time for two key-locked decks.
- **The hand-overs as controls** (`automation.ts`): volume, isolator, filter and echo send per deck, at any beat, for
  Blend, Bass swap, Filter sweep, Echo out, Cut and Double drop.
- **The file** (`src/workers/mixdown.worker.ts`, `src/lib/sets/export.svelte.ts`):
  - the save dialog's file, opened in the worker and written as it goes; without a dialog, pieces gathered and
    downloaded.
  - Each song is asked of the page when the mix reaches it (`lib.fileFor`), decoded in the worker (the page decodes
    what the worker can't), resampled, and let go after.
  - WAV: GLUE's streaming writer, its header written last.
  - MP3: mediabunny's `Mp3OutputFormat` with `@mediabunny/mp3-encoder` (LAME in WebAssembly, MPL-2.0, version 1.60.0 to
    match mediabunny) at 320 kbps.
- **The view** `#/set/<id>` ("Mix it as a set…" on a playlist):
  - style, decks, one tempo, key lock;
  - lanes per deck with each song's waveform and grid, the hand-overs shaded;
  - each hand-over's style;
  - the tracklist (copy, save);
  - export with progress, time left and cancel.

## Alternatives considered
- **Web Audio nodes for the mix (`AudioBufferSourceNode`, `BiquadFilterNode`, an `OfflineAudioContext` for the file):**
  no key lock, an `OfflineAudioContext` holds the whole set in memory (2 h ≈ 2.5 GB), and the live graph and the
  offline one aren't sample-identical.
- **Rendering in GLUE Home (Rust):** faster, but a second engine that must sound identical, and only on that computer.
- **A time-stretch library (Rubber Band, SoundTouch, Signalsmith Stretch):** Rubber Band is GPL, and SoundTouch is LGPL
  in a web bundle. Signalsmith (MIT) is the one to try if WSOLA isn't good enough; it's an AudioWorklet-first build.
  WSOLA is small, deterministic and testable, and DJ tempo changes are small (±8 %).
- **Positions accumulated sample by sample:** they drift. Positions come from the beat clock at every hop instead.

## Consequences
- The preview (S3: an AudioWorklet running the same `Mixer`) will sound like the file.
- 2-hour sets fit: at most the playing songs and the next ones are held, about 130 MB a song.
- Songs need a tempo and a length. A song with no grid (none from a DJ app or Prepare) gets one placed on its waveform
  and is marked "grid guessed".
- Engine DJ cues at the mix points are left for later (ADR 0194 rules out writing Engine DJ's songs).
