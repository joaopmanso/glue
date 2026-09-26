---
status: in-progress
milestone: M4
updated: 2026-09-26
adrs: [0052, 0006, 0011]
---
# Prepare (track page tab)

## What it does
The track page has two tabs: **Details** (what's there today) and **Prepare**, where a DJ gets the
track ready: check and fix the BPM and beat grid by ear, set cue points and loops, and try it at other
tempos. Corrections override the analysis ([ADR 0052](../adr/0052-prepare-tab.md)).

## Behaviour
- **Waveform:** an overview of the whole track (click to seek), and a zoomed deck view scrolling under
  a fixed playhead.
  - Colour schemes: RGB (3-band, Rekordbox-like), Blue, Bands (stacked), Mono.
  - The 3D view (as on Details) can be shown below it.
- **Beat grid** on both views: bar lines numbered, beats fainter.
- **Metronome:** clicks on the grid (accent on beat 1), with its own volume.
- **Tempo:** a pitch fader (±8 / ±16 / ±50 %) and key lock; the BPM shown follows the speed.
- **Grid editing:**
  - BPM ± 0.01, ×2, ÷2, and tap tempo;
  - nudge the grid earlier / later, "Beat 1 here" at the playhead;
  - "Reset to analysis".
- **BPM shown as:**
  - per profile (profiles screen): as detected, half-time 60–120 or full 120–240;
  - per track: flip to the other octave.
- **Re-analyse** resets the BPM and grid corrections; cues and loops stay.
- Step 2: hot cues A–H, memory cues, loops; the cues from a Rekordbox import can be taken over.
- Step 3: exported with the rekordbox XML ([exports](exports.md)).

## How it works
- `Track.prep` stores bpm, beat0 (first beat, s), bar (0–3), flip, and later cues.
- `lib/bpm.ts` works out the BPM in use and the BPM shown.
- The waveform job (`core/audio/waveform.ts`, in the analysis worker) makes 3 bands at 150 points/s
  and the beat phase for the BPM in use. It's cached in the browser's storage per track, size and date.
- The metronome is scheduled on the player's AudioContext (`lib/metronome.ts`).

## Tests
- Unit: beat phase on synthetic clicks (known offset), folding into ranges, prep reset.
- e2e: Prepare opens, waveform and grid draw, a BPM edit shows in the library, Re-analyse resets it.
