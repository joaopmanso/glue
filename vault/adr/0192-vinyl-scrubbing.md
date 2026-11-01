---
status: accepted
date: 2026-11-01
---
# 0192. Scrub the Prepare deck like vinyl: the track in an AudioWorklet platter, the player taking over on release

## Context
The user (2026-11-01): "I would like to have a vinyl feel when I scrub with the music playing, so that it doesn't
produce clicking sounds."

Dragging the deck set the `<audio>` element's `currentTime` on every pointer move. Each seek is a jump in the waveform,
which is a click. An `<audio>` element also can't play backwards or bend its speed sample by sample. A record under a
hand does both: it speeds up, slows down and reverses, and the pitch follows the speed.

## Decision
- **The platter** (`src/lib/platter.ts`): an AudioWorklet processor, loaded from a Blob.
  - It holds the open track's samples, decoded once in the background at the context's rate (`decodeAudio`).
  - **Held,** it pulls the record towards the hand's position (a 25 ms pull) through a platter with mass (14 ms
    smoothing, at most 6× speed).
  - **Motor,** it comes back to the tempo (`player.rate`, 70 ms smoothing).
  - **Brake,** it slows to a stop and says where.
  - It reads with cubic interpolation, low-passed when faster than the record, and fades in and out (8 ms, 40 ms).
- **The engine** (`src/lib/scratch.svelte.ts`):
  - the deck's grab, move and release become platter messages;
  - its position (extrapolated between reports) draws the deck while held.
- **The handover:**
  - while the deck is held, the player keeps running at volume 0, so taking over is a seek, not a start;
  - let go playing: the motor runs 260 ms, then the player seeks to the record's position plus 40 ms (where the platter
    will be when the seek lands), and the two crossfade over 40 ms;
  - let go paused: the brake, then a silent seek to where it stopped.
- **Until the track is decoded,** dragging seeks as before.
- **Its audio** goes to the player's output device (`setSinkId`) at the player's volume.

## Alternatives considered
- **Seeking more gently** (throttled, or crossfading two `<audio>` elements): still jumps, and no reverse, no speed.
- **A Web Audio graph that replaces the player for Prepare:** key lock (`preservesPitch`) and every source kind
  (streams from another device) are the `<audio>` element's. The platter is only for the moments the deck is held.
- **`AudioBufferSourceNode.playbackRate`:** it can't go backwards, and changing its rate in steps zips.

## Consequences
- **Memory:** the open track's samples (about 90 MB for a 4-minute stereo track at 48 kHz) are held while Prepare is
  open, and freed when it closes.
- **Key lock** doesn't apply while the deck is held (a record's pitch follows its speed); it applies again after the
  handover.
- **A long song** takes a moment to decode; meanwhile the deck seeks as before (`data-vinyl` on the deck says which).
