---
status: shipped
milestone: M2
updated: 2026-09-25
adrs: [0029, 0032, 0025, 0006]
---
# Automatic playlists

## What it does
Pick a track (or none) and MCO builds a playlist from the collection: along a tempo ramp, mixing
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
