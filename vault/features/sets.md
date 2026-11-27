---
status: in-progress
milestone: M10
updated: 2026-11-27
adrs: [0197, 0198, 0199, 0200]
---
# Sets: a playlist mixed, exported as one file

## Now (2026-11-27, S1 and S2 shipped)
- **Open:** right-click a playlist › **Mix it as a set…** (route `#/set/<id>`). The set is kept on the playlist
  (`List.set`).
- **Planned on the beat** (ADR 0200):
  - in the playlist's order, hand-overs on 16-bar phrases before each outro;
  - styles: One at a time, Continuous, Double drops;
  - cuts where tempos are more than 8 % apart;
  - each song levelled to the set's loudness.
- **Shown** on 2 or 3 deck lanes, with each song's waveform and grid and the hand-overs shaded. Each hand-over's style
  can be changed: Blend, Bass swap, Filter sweep, Echo out, Cut, Double drop.
- **Tempo:** each song's own (held through a hand-over, eased between) or one tempo. Key lock is on by default.
- **Export** as WAV 24-bit or MP3 320, through the save dialog, in a worker. It shows progress and time left, and can be
  cancelled.
- **The tracklist**, with times, can be copied or saved as text.
- **The engine** (`src/core/sets/`, ADR 0199) is one for the file and (next) the preview: a beat clock, a tempo map,
  WSOLA key lock, isolator, filter, echo, limiter. It renders ~60× real time.

## Next (S3)
- Drag on the timeline (snapped to bars):
  - songs along and between lanes;
  - in and out points;
  - a hand-over's length.
- The order changed by dragging.
- Live preview in an AudioWorklet (the same `Mixer`), with "Hear this transition".
- Undo.

## Later
- Drawn curves (EQ, volume, filter).
- Stems in transitions.
- FLAC.
- Engine DJ cues at the mix points.
