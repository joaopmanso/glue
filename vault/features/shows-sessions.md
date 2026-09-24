---
status: planned
milestone: M4
updated: 2026-09-24
adrs: [0009, 0011]
---
# Shows & sessions

## What it does
Prepare gigs. A **show** is an event (date, venue, city, notes). It contains **sessions**: ordered
sets with a time slot and targets. Sessions go to Rekordbox and Engine DJ as playlists.

## Behaviour
- Shows list (upcoming / past), each expanding to its sessions in the sidebar.
- Show fields: name, date, venue, city, notes, status (planned / played).
- Session fields: name, slot start/end (duration), target BPM range, energy note, notes; ordered
  tracks.
- Session editor: running time vs the slot ("52:10 of 60:00"), a BPM/key flow strip across the set,
  key-clash warnings between consecutive tracks (not harmonic neighbours), BPM jumps above a threshold.
- Suggest next track: harmonic neighbours within ±3 % BPM, best quality tier first.
- Export: Shows › <Show> › <Session> appear as folders/playlists in the rekordbox XML
  ([exports](exports.md)).

## Acceptance
- [ ] Create a show with two sessions, fill them, see running time and warnings.
- [ ] Session appears in Rekordbox (via rekordbox XML) with the right order.

## Note from automatic playlists (2026-09-24)
- The automatic playlist builder should offer "avoid songs played in the last N shows / sessions";
  its pool filter already takes a set of track ids to avoid ([ADR 0029](../adr/0029-automatic-playlists.md)).
