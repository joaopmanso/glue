---
updated: 2026-09-24
---
# Vision

**GLUE (Global Library Unified Exporter)** is a local-first home for a DJ's music collection. It brings every
source together: loose folders, iCloud Drive, and the Rekordbox, Engine DJ, Traktor and Apple Music
libraries. It then keeps the collection clean (duplicates, fake lossless, low-quality files), knows
every track (quality, BPM, key), and turns preparation into playlists, shows and sessions that go
straight back into Rekordbox and Engine DJ.

It grew out of **Speklone**, a spectral-forensics page answering "is this hi-res file actually
hi-res?". That engine is now GLUE's per-track Inspector and its "Analyze a file" mode.

## Who it's for
DJs with large, messy collections spread over several apps and drives, who prepare gigs in advance
and care about audio quality.

## Principles
1. **Local first, no accounts.** Audio never leaves the machine. The library is a folder of JSON files
   the user owns (`Documents/GLUE`), readable and backed up by hand if they want. Cloud save may come
   later, opt-in.
2. **Never damage the user's DJ libraries.** Imports are read-only; hand-back is through files the DJ
   apps import themselves. Write-back, when it comes, is backed up and opt-in
   ([ADR 0010](../adr/0010-import-export-before-write-back.md)).
3. **Honest analysis.** Verdicts say how confident they are ("close call", "caution") instead of
   overclaiming.
4. **Web first, desktop later.** A website today; a desktop client later for what browsers can't do
   ([ADR 0007](../adr/0007-web-first-platform-layer.md)).
5. **Fast with big collections.** 50,000 tracks should feel instant to browse, search and sort.

## Non-goals (for now)
- Streaming-service libraries (Beatport/Tidal/SoundCloud streaming).
- Editing audio, beat grids or cue points.
- Deleting or moving the user's music files.
