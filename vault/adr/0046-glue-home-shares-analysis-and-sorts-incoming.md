---
status: accepted
date: 2026-09-25
---
# 0046. GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder

## Context
With streaming working (ADR 0045), the user (2026-09-25) asked for three things:
- other computers get the analysis too, so a GLUE Home that's running gives them the waveforms and
  the full analysis without the audio;
- sending music to a server from any computer, by dragging onto a Devices row with GLUE Home;
- songs in any server's incoming folder show in a playlist **TO BE SORTED** until they're moved
  somewhere final.

The website keeps mini spectrograms and full analyses in the browser's private storage (OPFS), which
GLUE Home can't read.

## Decision
- **GLUE Home's own cache** (the app's cache folder):
  - `t/<profile>/<collection>/<shard>/<id>.bin`: mini spectrograms;
  - `d/…/<id>.json` + `.bin`: full analyses, in the website's stored format (`store/details.ts`).
- **Filled two ways:**
  - **Hand-over:** the website on the same computer asks what's there (`have`) and sends what's
    missing (`put`). It does this every 20 s while a collection is open and its GLUE Home is online
    (`lib/homeHandover.ts`).
  - **GLUE Home's own analysis:** the website's own code (`AnalysisPool`), one song at a time.
    - On request: a page on another computer, or rows on its screen.
    - In the background: every shared song without a spectrogram, gently, stepping aside while
      it sends or receives.
- **Other computers ask** over the stream channel:
  - `thumbs` for a screenful (missing ones are made next, and asked for again);
  - `details` for the track page, which shows the verdict, spectrogram and the rest at once, with
    "Play from Desktop" to fetch the audio.
- **Sending:** files dropped from the desktop, or tracks dragged from the table, onto a Devices row
  whose computer has GLUE Home online go to its incoming folder (a new drag target `home`).
- **TO BE SORTED** (`lib/incoming.svelte.ts`):
  - every 30 s (and after sending), each online GLUE Home's incoming folder is listed, and its
    songs are shown as one playlist at the top, with the Device column;
  - the songs play through their GLUE Home, and can't be added to playlists yet;
  - "Move to music folder…" asks that GLUE Home to move the file into one of the music folders it
    found (never overwriting); the website there picks it up on its next scan of that folder.
- The library now tracks shown-but-not-saved things in named groups (`overlay`, `incoming`), so each
  can be replaced on its own.

## Alternatives considered
- **Syncing analyses through the cloud:** hundreds of MB per library, against the free tier.
- **Only the website hands over (no analysis in GLUE Home):** nothing new would get analysed while
  the website on that computer is closed.
- **GLUE Home writes moved songs into the library's JSON:** it would be a second writer (ADR 0009).
  The website adds them on its scan instead.

## Consequences
- GLUE Home's cache grows with the library: a few KB per song for spectrograms, tens of KB for
  analyses.
- The background analysis uses the CPU of the computer GLUE Home runs on; it pauses while it's busy
  serving.
- A moved song appears in the library only after the website on that computer scans the folder (on
  open, or by the folder watcher).
