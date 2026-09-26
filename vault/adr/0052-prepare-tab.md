---
status: accepted
date: 2026-09-26
---
# 0052. A Prepare tab: waveform, beat grid, metronome and the user's corrections

## Context
The user (2026-09-26) wants the track page split into **Details** and **Prepare**. Prepare is where a
DJ gets a track ready:
- a player with a **waveform** in several colour schemes, the **beat grid** drawn on it, and the 3D view;
- listen with a **metronome** to confirm the detected BPM, and **adjust the grid** if it's wrong;
- set **cue points and loops** for Rekordbox / Engine DJ;
- change the **playback tempo** to try mixing it at other BPMs;
- choose how BPM is shown: per profile, **half-time (60–120) or full (120–240)**, with a per-track flip
  (a 140 track as 70, or the other way).

Corrections override the analysis. **Re-analyse** resets the BPM and grid corrections; cues and loops
stay (they're positions in the audio). Automatic background re-analysis never resets anything
(user's choices, 2026-09-26). Cues and grid reach Rekordbox / Engine DJ in the export step that follows
([exports](../features/exports.md)).

The analysis ([ADR 0006](0006-tempo-key-algorithms.md)) gives a BPM but no beat positions. It's
covered by the parity tests against the original page ([ADR 0016](0016-keep-legacy-page-for-parity.md)).

## Decision
- **The user's work is track data:** `Track.prep` holds the corrected BPM, the first beat's time,
  which beat is the bar's first (`bar`, 0–3), the display flip, and (step 2) cues and loops (the
  `CuePoint` shape imports already use). It's saved and synced like ratings and notes. The analysis
  summary is never changed by it. The BPM used everywhere is `prep.bpm ?? analysis.bpm`.
- **Waveform and grid position come from the track's own audio, when Prepare opens:** a worker job
  decodes it into a 3-band waveform (lows / mids / highs, about 150 points per second). From the same
  onset envelope the tempo detector uses, it finds the **beat phase** for the BPM in use. The result is
  cached in the browser's storage, next to the stored analysis. The analysis itself is unchanged: no
  new analysis version, no parity risk, and no cost for tracks never prepared.
- **The grid is constant-tempo:** first beat + BPM, with a downbeat every 4 beats. Tempo-changing
  grids (live drummers, edits) aren't in this step.
- **Metronome on the music's own clock:** the clicks go through the same AudioContext and output as
  the playing track (the chain the live view already uses). They're scheduled a little ahead from the
  element's position and playback rate, so they stay in time at any speed.
- **Tempo:** the player's `playbackRate` with a DJ-style range (±8 / ±16 / ±50 %) and **key lock**
  (`preservesPitch`). The shown BPM follows the speed.
- **BPM display:** `Profile.bpmRange` is 'detected' (default, as today), 'half' (folded into 60–120)
  or 'full' (folded into 120–240). `prep.flip` shows one track at the other octave.

## Alternatives considered
- **Beat positions in the analysis itself:** every track would need re-analysing (a version bump), the
  parity reference would change, and the background analysis would get slower, all for tracks mostly
  never prepared.
- **Waveform from the stored spectrogram:** already on disk, but a few hundred columns per track is too
  coarse for a zoomed deck view.
- **Web Audio playback (AudioBufferSourceNode) instead of the element:** sample-exact, but no built-in
  key lock, and the whole track decoded in memory to play. The element already plays, seeks and
  time-stretches.

## Consequences
- The first open of Prepare decodes the whole track (a second or two); after that, the waveform opens
  from the cache.
- The grid phase is exact to a few ms. DJ apps place the grid to about 1 ms, so the nudge buttons
  matter.
- The export step writes `prep` (grid, cues, loops) into rekordbox XML `TEMPO` and `POSITION_MARK`.
