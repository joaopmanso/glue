---
status: in-progress
milestone: M9
updated: 2026-09-28
adrs: [0068, 0067, 0076, 0080]
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
- One player for the library and track pages. Opening a track page while another track plays
  doesn't interrupt it: the page's source waits (`player.defer`), the page's bar shows "Still
  playing: …" with its own pause, and the page's track loads on its first play, seek or
  spectrogram click (2026-09-25). The library's now-playing follows whatever was loaded last.

## Limits & open questions
- Fixed in M1: a quick pause/play inside one frame could start a second play loop (now exactly one
  animation-frame loop; `src/lib/player.svelte.ts`).
- GLUE: becomes a global player bar that plays any selected track (M2).

## The library's full player (2026-09-27, [ADR 0068](../adr/0068-full-player.md))
- **The bar:** shuffle, previous, play, next, repeat (off, the list, the song); the song, ⌖ to show it
  in the list; seek; BPM, key, quality; volume (click the speaker to mute); the sound output; ▲ opens
  the player, with the number of songs queued.
- **The queue:**
  - **"Next up":** the songs you queued, played first, in their order. Add them with right-click ›
    Play next or Add to queue (songs or a whole playlist), or by dropping songs or a playlist on the
    bar or the queue.
  - **"Next from ‹list›":** the rest of the list the song was started from (shuffled: all of it but
    the song, in a random order).
  - Previous walks back through what played (or restarts the song after 3 s).
  - Queueing a song that's waiting further down moves it, so it doesn't play twice.
  - With nothing loaded, play starts the first queued song.
  - The queue, the song and the place in it are remembered per collection in this browser, with
    shuffle and repeat. After a reload, play resumes there.
- **The open player** (▲; drag its top edge to size it, remembered):
  - **Left:** the song (title, artist, BPM, key, quality, where it's playing from) or the
    visualiser.
  - **Right:** the queue (what's playing, Next up, Next from, Played before):
    - drag to reorder or move a song into Next up; × removes; Clear empties a section;
    - double-click plays it now;
    - right-click has the song's menu with Play now and Remove from the queue.
- **Visualiser:**
  - [threejs-visualisers](https://github.com/festanqueiro/threejs-visualisers), the user's own, loaded
    the first time it's shown; eight themes and their options (remembered).
  - Full screen with F or a double-click; ← → and 1–9 switch themes.
  - It reacts to an analyser tapped off the player, made again for each song.
  - The deployed site uses its latest release, checked daily (`visualisers.yml`, `visualisers.txt`
    on the site).
- **Sound output:**
  - The menu lists the outputs the browser offers. Chromium lists every sound card only once the page
    may use the microphone: "List the sound cards…" asks, and nothing is recorded.
  - The choice is remembered, and falls back to the default when the device goes away.
  - Browsers play through the system's shared audio. ASIO / WASAPI drivers come with GLUE Home
    (phase 2).
- **Code:**
  - `core/library/queue.ts` (pure queue steps), `lib/nowPlaying` (the queue, remembered),
    `lib/player` (taps, `setSink`), `lib/output`, `lib/visualiser`;
  - `ui/library/LibPlayer` and `PlayerPanel`; the drag target `queue`.
- **Tests:**
  - unit `tests/queue.test.ts`;
  - e2e "the player: a queue …": menu, drags, reorder, remove, shuffle and repeat, the output menu,
    the visualiser drawing and switching themes, and the queue and song kept over a reload.
- **Next (phase 2):** GLUE Home plays the music itself when it runs (cpal: WASAPI, ASIO), with a
  device and output channels to choose; the website is its remote and screen.

## The queue, batch 1 (2026-09-27)
- **"Next from" reorders by dragging too** (`placeLater` in `core/library/queue.ts`; the `queue`
  drag target knows its section). Songs dropped into it leave Next up.
- **Grips** show on hover.
- **Menu:** "Move to the top" (Next up), "Play next" (Next from).
- **"Played before"** folds, and has Clear.

## ▶ on the loaded song's row (2026-09-27)
- A song loaded by its track page has no list after it. ▶ on its row in the library (or Duplicates,
  or the playlist builder) now makes the rest of that list follow it (`nowPlaying.resumeFrom`); before,
  it only resumed, and nothing came after it.

## Streaming (2026-09-28, [ADR 0076](../adr/0076-songs-stream-by-range.md))
- A song plays as it comes instead of after the whole file:
  - Home mode: from GLUE Home's local link, by byte range;
  - another computer's song: from its GLUE Home through GLUE's streaming service worker.
- Formats the browser doesn't play by itself (AIFF in Chrome), and older GLUE Homes, still come whole.
- `lib.mediaFor`, `remoteFiles.stream`, `public/glue-stream-sw.js`; the player takes a Blob or an
  address.

## iPhone: songs start after a tap's wait (2026-09-28, [ADR 0080](../adr/0080-play-on-elements-a-tap-unlocked.md))
- **The problem:** the player made a new `<audio>` for each song and started it after the stream's
  address was ready. iOS refuses that when the answer takes more than a moment. So most songs showed
  "This browser can't play this format", though every desktop browser played them.
- **The fix:**
  - each tap, click or key press unlocks two spare elements;
  - songs play on those, so they start whenever the network answers, and the next song starts by
    itself;
  - the last song's element is kept as a spare, unless it was joined to Web Audio.
- **Messages now say what happened:**
  - "Tap ▶ to start" (the browser wants a tap);
  - the format isn't supported;
  - couldn't decode;
  - the connection dropped;
  - nothing when another song took its place.
- To check on a real iPhone **[UNVERIFIED]**.
- **2026-09-28:** songs go on to the next on any page but the song that ended; a song page's spectrogram seeks only that song (on touch, only on a tap). [ADR 0084](../adr/0084-playback-first-on-the-link-to-glue-home.md).
