---
status: accepted
date: 2026-11-27
---
# 0201. A set shaped by hand on its timeline, heard live from a worker, with headroom where songs play together

## Context
- **The set builder's first release** (ADR 0199, 0200) planned and exported a set, but couldn't be shaped or heard
  inside GLUE.
- **The user (2026-11-27), on it:**
  - "most previews don't work and overall looks terrible, it should feel interactive and dynamic";
  - "mix sounds good … songs are leveled, mixed in the correct time";
  - then, on an exported set: "a lot of artefacts and noise on some mixes, specially the double drop ones".
- **Why the waveforms were missing:** a song's waveform was taken only from the cache, or made only when its grid had
  to be placed on it.
- **Why the double drops were noisy:**
  - two loud songs at full summed about 6 dB over the ceiling;
  - the limiter dropped its gain at once, in 64-sample steps (a buzz);
  - WSOLA's raw correlation could pick a grain off the song's own continuation even when nothing was stretched.
- **ADR 0199 planned the preview as "an AudioWorklet running the same `Mixer`".** The songs, though, are decoded in a
  worker (`decodeHere`), at about 100 MB each.

## Decision
- **Hand edits** (`src/core/sets/edit.ts`, pure), always in whole bars, clamped to the nearest bar that keeps the set
  whole (`valid`):
  - **move a song** (`moveSong`): it and every song after it shift; the song before plays on as it did, so its
    hand-over grows or shrinks;
  - **trim its in-point** (`trimIn`): it comes in later, from later in its file, with its end kept;
  - **move its end** (`moveEnd`): it plays longer or shorter, its hand-over with it.
  - **`valid`:**
    - every song plays at least a bar, inside its file;
    - each comes in at least a bar after the one before, while that one still plays (no silence);
    - each outlasts the one before;
    - songs on one deck don't overlap.
- **The running order:** dragged in a list; the playlist's order changes and the set is planned again in it.
- **Undo and redo:** every version of the plan, with the playlist's order, in `sets` (100 deep). A drag is one step.
- **The live preview** (`src/workers/setplay.worker.ts`, `src/lib/sets/preview.svelte.ts`), which replaces ADR 0199's
  plan of a `Mixer` inside the worklet:
  - the mixer runs in a worker, about 1.2 s ahead of what's heard;
  - the worker sends blocks straight to a small AudioWorklet through a `MessagePort`;
  - the worklet plays the newest generation (each seek or edit starts one) and reports how much it has played.
  - The AudioContext runs at the mix rate (44.1 kHz), through the player's output device and volume.
  - Songs are decoded as the mix reaches them, as in the mixdown (`setDecode.ts`, shared); a few are kept for seeking
    back.
- **The timeline** (`SetLanes.svelte`):
  - one canvas per lane, the width of the view, redrawn on scroll and zoom;
  - each pixel column goes through the tempo map to each song's own time;
  - **songs are drawn as heard:** the waveform shrinks with the volume and loses its lows while the bass is cut, over a
    ghost of the song as it is;
  - waveforms load in the background for every song (from the cache, else made and cached);
  - DOM handles per song for dragging;
  - hand-overs as chips under the lanes, each opening a panel (style, length, the next song earlier or later,
    "Hear it");
  - Ctrl + wheel zooms.
- **The sound** (`dsp.ts`, `mixer.ts`):
  - **Headroom:** when the songs sounding add up to more than one song's power (the sum of their gains squared over
    1), each comes down by its square root, as a DJ rides the faders. Equal-power blends are unchanged; two songs at
    full come down 3 dB each.
  - **The limiter:** the gain a peak needs is held for the look-ahead (256 samples) and averaged over it, so it glides
    down and is all the way down when the peak comes out, with no steps. It is per sample, with a 250 ms release.
  - **WSOLA:** grains are compared by normalised correlation over the whole overlap, and the song's own continuation
    is a candidate. At a song's own tempo, key lock gives the song back sample for sample.

## Alternatives considered
- **The `Mixer` inside the AudioWorklet (ADR 0199's plan):** each song's PCM would be copied into the audio thread,
  where a decode or a garbage collection can't wait. A worker a second ahead absorbs both, and only blocks cross.
- **`SharedArrayBuffer` for the blocks:** needs cross-origin isolation, which GitHub Pages doesn't serve.
- **One canvas per song** (as before): blurred past 4096 pixels, and stretched linearly where the tempo eases.
- **Leaving the levels to the limiter:** it is for peaks, not for 6 dB of overlap.
- **Signalsmith Stretch for key lock** (ADR 0199's fallback): still the next step if WSOLA's stretch isn't clean enough.
  The noise heard came from the limiter and the grain search, which this fixes.

## Consequences
- Every exported set sounds a little different: overlaps are 3 dB lower where both songs were at full, and peaks are
  gentler. Sets planned before are untouched; they are mixed again on export.
- Reordering plans the set again; any hand edits are undone by it (Undo brings them back).
- The preview needs a song's file when the mix reaches it. In Home mode, that means a download from GLUE Home, so the
  first play of a stretch can wait ("Loading songs…").
