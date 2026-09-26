---
status: in-progress (step 1 shipped 2026-09-26; step 2 cues and loops next)
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

## Shipped: step 1 (2026-09-26)
- **Tabs:** Details | Prepare (`#/track/<id>/prepare`). The Details work (stored analysis, or analysing)
  runs only on the Details tab.
- **Waveform:** a deck view (2–32 s, wheel or +/− to zoom, drag to scrub) and an overview (click to
  jump). Colour schemes: RGB, Blue, Bands, Mono (remembered per browser). A "3D" switch shows the live
  view's ridges below.
- **Grid:** placed on the audio for the BPM in use. On synthetic kicks at known times (124, 174, 90 BPM
  and more) it lands within 0.1 ms, with the right downbeat.
  - The onset detector hears an attack about 0.7 of a window after the window starts. Assuming the
    centre had put the grid 18.6 ms early at every tempo; measured, then corrected (`ONSET_LAG`).
  - The downbeat is the loudest of each four beats in the waveform's level (the onset curve flattens
    loudness).
- **Player:** tempo fader ±8 / ±16 / ±50 % (double-click: 0), key lock; the BPM shown follows the
  speed. Leaving the tab puts the speed back to normal.
- **Metronome:** on the music's own AudioContext, scheduled 150 ms ahead, accent on each bar's first
  beat, with its own volume.
- **Edits:** BPM (typed, ±0.01 or shift ±0.1, ×2, ÷2, tap), grid earlier / later (5 ms, shift 1 ms, or
  ← →), "Beat 1 here", "Place again", "Reset to analysis". They're saved on the track and renumber
  the beats so the bar lines stay put (`core/library/grid.ts`).
- **Shown as:** profiles screen, per profile: "as detected", 60–120 or 120–240. Per track: the flip. The
  library's BPM column, its sorting, the mini player, Duplicates, auto playlists and insights use the
  corrected BPM; a corrected BPM shows in the accent colour.
- Keys: Space plays, M metronome, T tap, ← → nudge.
- **Not checked by a test:** that the clicks are *heard* in time with the music (headless browsers have
  no audio out). Check by ear on a real track, and report any constant offset: it would be added as a
  latency setting.

## Tests
- Unit: beat phase on synthetic clicks (known offset), folding into ranges, prep reset.
- e2e (`e2e/prepare.spec.ts`), on a synthetic 30 s beat at 124 BPM:
  - Prepare opens and the waveform draws;
  - tempo +4 % shows 128.96; the metronome toggles;
  - a correction to 125 survives a reload and shows (as yours) in the library;
  - half-time shows 62.5, and the flip brings it back to 125;
  - Re-analyse removes the correction.
