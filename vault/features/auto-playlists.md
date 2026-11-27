---
status: shipped
milestone: M2
updated: 2026-11-27
adrs: [0029, 0032, 0025, 0006, 0197, 0198]
---
# Automatic playlists

## Now (2026-11-27, ADR 0197, 0198)
- **Flow:**
  - presets: Steady at the seed's energy, Warm-up, Build to a peak, Peak and down, Peaks and breathers, Cool-down;
  - or "No energy target";
  - a curve whose points are dragged (or moved with the arrow keys);
  - "Tempo follows the flow" bends the BPM ramp to its shape.
- **Energy 1–10** comes from each song's sound profile, relative to the collection. Mixed In Key's "Energy N" in a
  comment or grouping wins.
- **The songs to start from aren't put first.** Each has a role: where it fits (default), Opener, At the peak, Closer.
- **Sound:** varied ↔ close (likeness of timbre to the seeds and to the song before).
- **The same artist** is kept 3 songs apart (it can be turned off).
- **A beam search** replaces the greedy fill.
- **The result:**
  - each song's energy (E1–E10), with how alike it sounds to the one before in its tooltip;
  - the songs' energies drawn over the curve.
- **Every song is analysed once more** (`ANALYSIS_VERSION` 4) for its sound profile. Until then it counts as average,
  and the dialog says how many are waiting.
- **Next:** the set builder (M10), turning such a playlist into a mix.

## What it does
Pick a track (or none) and GLUE builds a playlist from the collection: along a tempo ramp, mixing
harmonically, favouring the highest rated tracks, with some chance so every run differs.

## Behaviour
- Open from: a selected track ("Build playlist from this"), a track's page, or "+ Auto" in the sidebar.
  With several tracks selected ("Build playlist with these N"), the first (in table order) starts it
  and all the others are included.
- Options: starting track; tracks that must be included (search); number of tracks (20, or fewer
  when the collection is smaller); start and end BPM (a ramp), tempo range, half/double time;
  harmonic mixing Off / Prefer / Strict; prefer highest rated; minimum rating; only the starting
  track's genre; allow unanalysed tracks; "Surprise me" (randomness); avoid songs already in chosen
  playlists.
- Tags ([ADR 0032](../adr/0032-tags.md)): "Look at tags" is on by default and prefers tracks
  sharing the starting and included tracks' tags (or tags you pick); "Only these" keeps just
  tracks with one of them; tags to avoid leave tracks out. The saved playlist gets those tags.
- Result: ordered list with BPM, key and a transition dot (green harmonic, amber energy boost, red
  clash), stars, each track's overview (click or drag to play and scrub), insights (length, tempo
  flow, keys, tags Venn; hideable); play any track; ↻ replaces one slot, × removes it; "↻ Another" regenerates;
  name it and "Save playlist".
- Duplicates: only the best copy of a same-recording group can be picked.
- How it works: [ADR 0029](../adr/0029-automatic-playlists.md).

## Later
- Avoid songs played in recent shows / sessions ([shows & sessions](shows-sessions.md)); the
  options are stored on each generated playlist for that and for "generate again".

## Speed (2026-09-26, [ADR 0059](../adr/0059-indexes-rebuilt-by-change-counters.md))
- Each track's DJ-app BPM and rating come from an index built once per import change. Before, every
  import's track list was searched per track, so opening the dialog took 2.2 s on an 8.8k library,
  and every library change re-ran it while the dialog was open.
- Now 0.1 s to open and 0.14 s to generate (candidates 9 ms, the generator 94 ms).
