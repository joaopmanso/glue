---
status: in-progress
milestone: M10
updated: 2026-11-27
adrs: [0197, 0198, 0199, 0200, 0201]
---
# Sets: a playlist mixed, exported as one file

## Now (2026-11-27, S1–S3 shipped)
- **Open:** right-click a playlist › **Mix it as a set…** (route `#/set/<id>`). The set is kept on the playlist
  (`List.set`).
- **Planned on the beat** (ADR 0200):
  - in the playlist's order, hand-overs on 16-bar phrases before each outro;
  - styles: One at a time, Continuous, Double drops;
  - cuts where tempos are more than 8 % apart;
  - each song levelled to the set's loudness.
- **The timeline** (ADR 0201): 2 or 3 deck lanes.
  - Each song is drawn as heard: its waveform shrinks with its volume and loses its lows while its bass is cut.
  - Every song's waveform loads in the background.
  - A ruler and a playhead; Fit, zoom, Ctrl + wheel.
- **Shaped by hand** (ADR 0201), always in whole bars, kept whole:
  - drag a song (it and the ones after it move);
  - drag its left edge (trim its start) or its right edge (its end);
  - drag the running order (the set is planned again);
  - undo and redo (Ctrl+Z, Ctrl+Shift+Z).
- **A hand-over's panel** (its chip, or its line in the running order):
  - its style: Blend, Bass swap, Filter sweep, Echo out, Cut, Double drop;
  - its length ±4 bars;
  - the next song in earlier or later;
  - **Hear it**.
- **The live preview** (ADR 0201): play, pause (Space), click to seek, "play from here" on a song. It runs the file's
  mixer in a worker, fed to an AudioWorklet through the player's output.
- **Tempo:** each song's own (held through a hand-over, eased between) or one tempo. Key lock is on by default.
- **Export** as WAV 24-bit or MP3 320, through the save dialog, in a worker. It shows progress and time left, and can be
  cancelled.
- **The tracklist**, with times, can be copied or saved as text.
- **The engine** (`src/core/sets/`, ADR 0199, 0201) is one for the file and the preview: a beat clock, a tempo map,
  WSOLA key lock, isolator, filter, echo, equal-power headroom, and a gliding look-ahead limiter.

## Next
- The user's listening:
  - the double drops after the limiter, headroom and key-lock fixes;
  - whether WSOLA's stretch is clean enough (else Signalsmith Stretch).
- A song dragged to another deck; a hand-over's chip edges dragged.
- Reordering that keeps the hand edits around the songs that stay together.

## Later
- Drawn curves (EQ, volume, filter).
- Stems in transitions.
- FLAC.
- Engine DJ cues at the mix points.
