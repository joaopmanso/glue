---
status: shipped
milestone: Speklone
updated: 2026-09-24
adrs: []
---
# Player

## What it does
Plays the analysed track: play/pause, seek bar, time, volume, and a playhead moving across the
spectrogram. Clicking the spectrogram seeks there and starts playing. Space plays/pauses; ← → skip 5 s.

## How it works
- A fresh `<audio>` element per source (a media element can feed only one AudioContext; the live view
  needs one at the file's rate). Source is the original file, except AIFF, which Chrome/Firefox can't
  play: `pcmToWav` rewraps the same PCM as WAV in memory (verified bit-identical with ffmpeg).
- The play/pause icon is replaced only when the state flips. Replacing it every frame swallowed
  clicks that started on the old icon (the "pause doesn't work" bug, fixed 2026-09-23).
- Stem selection swaps the source while keeping position and play state (`swapPlayerSource`).

## Limits & open questions
- Fixed in M1: a quick pause/play inside one frame could start a second play loop (now exactly one
  animation-frame loop; `src/lib/player.svelte.ts`).
- MCO: becomes a global player bar that plays any selected track (M2).
