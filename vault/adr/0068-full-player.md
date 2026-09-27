---
status: accepted
date: 2026-09-27
---
# 0068. A full player: a queue, an open view with the visualiser, the sound output; drivers through GLUE Home later

## Context
The user (2026-09-27): "a full fledged player":
- queue songs;
- "a right button with an arrow to expand the player to see the queue and manage it";
- "an option to select soundcard and asio / direct sound etc";
- "an option to show a visualizer", using their own
  [threejs-visualisers](https://github.com/festanqueiro/threejs-visualisers), at its latest release.

Facts ([research](../research/audio-output.md)):
- **In the browser:**
  - A web page can pick the output device (Chromium's `setSinkId`, on a media element and, since
    Chrome 110, on an AudioContext). It plays through the system's shared audio (WASAPI on Windows).
  - Chromium lists every device only once the page may use the microphone.
  - No page can use ASIO or DirectSound.
- **Natively:**
  - cpal (Rust) offers WASAPI and ASIO on Windows (it fetches the ASIO SDK at build time), CoreAudio
    on macOS; no DirectSound.
  - The ASIO SDK is dual-licensed (GPLv3 or Steinberg's proprietary licence) since October 2025.
- **The visualiser package:**
  - It installs from GitHub at a tag (it builds itself on install), takes an `AnalyserNode` or a
    function returning one, and is about 1 MB plus three.js.
  - Its releases carry no files: its workflow tags every push to main.

Decisions taken with the user: the browser now, ASIO through GLUE Home next; follow the visualiser's
releases with a daily check.

## Decision
- **The queue is a value with pure steps** (`src/core/library/queue.ts`); `lib/nowPlaying` holds it.
  - **"Next up":** songs the user queued (Play next, Add to queue, or dropped on the player or its
    queue), played first.
  - **"Next from ‹list›":** the rest of the list a song was started from, shuffled (all of the list
    but the song) or not.
  - **"Played before":** for Previous.
  - **Repeat:** all (the list starts over once) or one (the song again when it ends).
  - **Moving, not doubling:** queueing a song that's waiting in the list moves it, so it doesn't play
    twice.
  - **Remembered per collection in this browser** (pref `queue.<collection>`, with the place in the
    song, capped), with shuffle and repeat.
- **The bar** gets shuffle and repeat, a sound-output menu, and ▲ on the right that opens the player.
  - **The open player** (`PlayerPanel`), with a top edge you drag to size it (remembered):
    - on the left, the visualiser, or the song;
    - on the right, the queue: reorder by dragging, × to remove, Clear, double-click plays now, and
      right-click has the song's menu with Play now and Remove from the queue.
  - Songs and playlists dropped on the bar or the queue are queued: a new drag target, `queue`.
  - "Play next" and "Add to queue" join the songs' and playlists' menus (ADR 0067).
- **The audio graph only when something listens.**
  - The player's element goes through Web Audio while the live view, the metronome or a **tap**
    wants it.
  - A tap is a named analyser made again for each song; the visualiser's is `createAnalyser` from the
    package, ending in a silent gain so the browser runs it.
- **The sound output (`lib/output`):**
  - `setSinkId` on the element and on the graph's context; remembered; back to the default when the
    device goes away.
  - "List the sound cards…" asks for the microphone once, only so Chromium lists them; nothing is
    recorded.
  - The menu says ASIO and WASAPI come with GLUE Home.
- **The visualiser (`lib/visualiser`):**
  - `threejs-visualisers` is imported only when it's first shown (its own 1.6 MB chunk).
  - Theme and options are remembered.
  - Full screen with F or a double-click; ← → and 1–9 switch themes.
- **Following its releases without committing to main** (only repository admins may update main):
  - package.json pins a tag (v0.1.2 now);
  - every deploy installs the latest release when it's newer, before the checks, tests and build, and
    publishes `visualisers.txt`;
  - `visualisers.yml` runs daily and starts a deploy when the live site's version isn't the latest;
  - bumping the pin locally: `npm install github:festanqueiro/threejs-visualisers#<tag>` and
    `npm install-scripts approve threejs-visualisers`.
- **Next step (its own ADR): GLUE Home plays the music itself when it runs** (Home mode):
  - cpal output (WASAPI, ASIO), a device and output channels to choose, Symphonia decoding;
  - the website becomes its remote and screen, and the visualiser is fed its spectra.

## Alternatives considered
- **ASIO now (a native engine first):** much bigger; the queue and the visualiser would wait. The
  user chose the browser first.
- **Committing bumps to main from a workflow:** needs the Actions bot allowed past main's ruleset.
  Deploying the latest release without a commit gives the same result and leaves the protection as
  it is.
- **Loading the visualiser from a CDN at run time:** it would depend on a third party while playing,
  and wouldn't be checked by GLUE's build.
- **Web Audio all the time:** a context per song for nothing when no one listens. Taps keep the
  simple path.

## Consequences
- **The deployed visualiser can be newer than package.json's pin.** The deploy log and
  `visualisers.txt` say which it is.
- **Queue ids that leave the collection are pruned when it's restored,** and skipped when playing.
- **The output menu can't list sound cards until the microphone is allowed:** a Chromium rule.
- **Phase 2 has to feed the visualiser without a browser AnalyserNode:** an object with the same
  methods, or spectra from GLUE Home.
