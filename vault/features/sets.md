---
status: in-progress
milestone: M10
updated: 2026-11-27
adrs: [0197, 0198, 0199, 0200, 0201, 0202, 0203, 0204, 0205, 0206, 0207]
---
# Sets: a playlist mixed, exported as one file

## Now (2026-11-27, S1–S3 shipped, then ADR 0202–0207)
- **Open:** right-click a playlist › **Mix it as a set…** (route `#/set/<id>`). The set is kept on the playlist
  (`List.set`).
- **Planned on the beat** (ADR 0200):
  - in the playlist's order, hand-overs on 16-bar phrases before each outro;
  - styles: One at a time, Continuous, Double drops;
  - a length asked for (30 min … 3 h, or no limit, ADR 0202): songs play shorter, then the last are left out;
  - 3 decks (ADR 0202): songs that sound alike are layered (48 bars along, three at once for 16, one bass);
  - cuts where tempos are more than 8 % apart;
  - **on the drop** (ADR 0205): each song's drop found where its bassline comes in (the waveform's lows; else its
    loudness); the incoming song comes in so its drop lands where the bass changes hands (a short intro: from its
    first downbeat, the swap on its drop). The outgoing song never loses its bass under the incoming one's intro. A
    new plan makes the missing waveforms first ("Finding the drops");
  - each song levelled to the set's loudness.
- **The timeline** (ADR 0201): 2 or 3 deck lanes.
  - Each song is drawn as heard: its waveform shrinks with its volume and loses its lows while its bass is cut.
  - Every song's waveform loads in the background.
  - A ruler and a playhead; Fit, zoom, Ctrl + wheel.
- **The timeline's gestures** (ADR 0202):
  - the wheel zooms; dragging empty space or a song not selected scrolls;
  - the time bar seeks;
  - a click selects a song and opens its box (play from it, key lock, level ±1 dB, in earlier or later);
  - a selected song is dragged (it and the ones after it), its edges trim its start or end, in whole bars, kept whole;
  - (ADR 0205) Shift or Ctrl + click selects several: dragged together, the others staying; their box sets level, key
    lock, earlier or later;
  - (ADR 0205) press and hold on a song grabs it to drag;
  - (ADR 0205) a selected song's **bass** strip: dragged across, its bass cut over those bars (or opened where cut),
    drawn hatched red or orange, listed in its box;
  - undo and redo (Ctrl+Z, Ctrl+Shift+Z).
- **A hand-over's box** at its chip (or from its line in the running order):
  - its style: Blend, Bass swap, Layer, Filter sweep, Echo out, Cut, Double drop;
  - whose bass plays (ADR 0203): Auto, Outgoing, Incoming, Both;
  - its length ±4 bars;
  - the next song in earlier or later;
  - how alike the two sound;
  - an orange bass marker on the timeline where the bass changes hands (as planned, on the incoming song's drop),
    dragged a bar at a time; a bass swap turns on it;
  - **Hear it**.
- **The running order:** dragged to reorder (the set is planned again); a song's name opens its menu on the timeline;
  the song playing fills its line, the hand-over playing lights up (ADR 0206).
- **The look** (ADR 0206): the transport and timeline pinned at the top (windows 760 px tall or more); a faint bar grid
  behind the lanes (phrases in the accent); zoom stops at the whole set; a song's **round menu** where it's clicked, its
  items in fixed, labelled places (ADR 0207: Play on top, Mix in left, Mix out right, Key lock below, Page, Bass ×; the
  level − / + in the middle; Mix in/out open the hand-over box beside it); the bass strip on any song hovered, grown
  under the pointer (a click on it opens the menu, a drag edits the bass), a × on each stretch.
- **Following the playhead** (ADR 0207): on while playing until the user zooms, scrolls or drags; the crosshair by Play
  turns it on again.
- **The sidebar:** a playlist with a set shows a crossfader mark that opens it.
- **Who mixes** (ADR 0204): this computer's GLUE Home (0.84) whenever it runs and has every song: the same mixer in Rust
  (`glue-sets`), streamed to the tab for the preview and the file ("Mixed by GLUE Home"); else the browser.
- **The live preview** (ADR 0201): play, pause (Space), click to seek, "play from here" on a song. It runs the file's
  mixer in a worker, fed to an AudioWorklet through the player's output.
- **Tempo:** each song's own (held through a hand-over, eased between) or one tempo. Key lock is on by default.
- **Export** as WAV 24-bit or MP3 320, through the save dialog, in a worker. It shows progress and time left, and can be
  cancelled.
- **Export a part** (ADR 0206): songs a … b, marked on the time bar, the first coming in alone (`edit.ts` `part`).
- **The tracklist**, with times, in a modal: copied or saved as text.
- **The engine** (`src/core/sets/`, ADR 0199, 0201) is one for the file and the preview: a beat clock, a tempo map,
  WSOLA key lock, isolator, filter, echo, equal-power headroom, and a gliding look-ahead limiter.

## Next
- **Remote (R4, approved):** a device without the songs: the set mixed by the GLUE Home that has them, streamed over the
  session as Opus (~192 kbps), the export as FLAC that the device writes into WAV or MP3.
- The user's listening (double drops, layering, the drops found on their songs).
- A song dragged to another deck; reordering that keeps hand edits.

## Later
- Drawn curves (EQ, volume, filter).
- Stems in transitions.
- FLAC.
- Engine DJ cues at the mix points.
