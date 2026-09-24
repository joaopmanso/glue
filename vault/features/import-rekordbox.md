---
status: planned
milestone: M5
updated: 2026-09-24
adrs: [0010, 0012]
---
# Import: Rekordbox

## What it does
Brings a Rekordbox collection (tracks, playlists, folders, cues, ratings, colours, BPM, key) into MCO
as a read-only source, and lets the user copy its playlists into MCO lists.

## Behaviour
- Web path: rekordbox XML. Guide: Rekordbox › File › Export Collection in xml format → save into
  `MCO/imports/rekordbox.xml`. MCO picks it up automatically (on load and when the imports folder
  changes) and offers to re-import when the file is newer.
- master.db (encrypted SQLCipher, in AppData / ~/Library) is out of reach for a website
  (blocked directories); reserved for the desktop client.
- Matching: XML `Location` (file://localhost/… URI) → decoded absolute path → file under a root whose
  abs_path matches; otherwise filename + size + duration. Unmatched tracks are listed with their path.
- Imported per track: title/artist/album/genre/label/comments, AverageBpm, Tonality, Rating
  (0/51/…/255 → 0–5), Colour, PlayCount, DateAdded, cues (POSITION_MARK) and beat grid (TEMPO) kept
  for re-export.
- Playlists: NODE Type 0 = folder, 1 = playlist (KeyType 0 TrackID / 1 Location).

## Acceptance
- [ ] Import a real rekordbox.xml: track and playlist counts match Rekordbox.
- [ ] Re-import is idempotent (no duplicate sources, lists or tracks).
- [ ] Imported absolute paths infer each root's abs_path.

See [research/dj-library-formats.md](../research/dj-library-formats.md#rekordbox).
