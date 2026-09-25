---
status: accepted
date: 2026-09-25
---
# 0043. Sync many files per request, keep one copy file per device, and show songs as they arrive

## Context
On the user's real library (Desktop: 7k songs, 1,167 files: 256 track shards, 256 analysis
shards, 655 playlists; 2 MB compressed), the laptop showed "Updating from Desktop…" for about five
minutes and then nothing. The mirror of [ADR 0042](0042-merged-collection-in-the-local-library.md)
fetched one file per request, wrote each into its own file in the GLUE folder, built the library
only at the end, and gave up on the whole device if one file failed. That can happen while the
other device is still analysing and re-uploading. Uploads were one request per file too. Cloudflare's
free plan allows 100k Worker requests a day, and collections will be well over 10k songs. The user
wants playlists, folders and songs almost at once, with the song count rising while they load.
Detailed data for another device's songs isn't needed.

## Decision
- **Uploads in batches:** `POST /v1/sync/files?profile=` takes lines `path \t hash \t size \t base64`,
  up to 200 files or 1.9 MB per request; the website sends about 1 MB per batch.
- **Downloads in batches:** the file list now includes each file's stored length.
  `POST /v1/sync/<device>/<profile>/bundle { paths }` answers `path \t hash \t base64` lines in the
  order asked, up to about 1.5 MB. Files not stored (yet) are left out, and what doesn't fit is
  asked for again. The website asks for about 400 KB at a time.
- **Order:** collection and profile first, then playlists and folders, then songs, then analysis.
  Imports' DJ-app details (`sources/`) aren't fetched for other devices.
- **Songs as they arrive:** after each batch the device's copy is loaded from memory and merged. The
  library updates at most about once a second, with "Updating from Desktop… 3,200 of 7,000 songs".
- **One copy file per device:** `cloud/<device>-<profile>.json` (path → hash and compressed text)
  replaces the folder of files, written once per sync. A file that can't be had now is left for
  next time instead of failing the device.
- An older Worker without the new routes (404) falls back to one file per request.

## Alternatives considered
- **SQLite in the browser for GLUE's own data** (asked by the user): not the bottleneck. At 12k
  songs a device's copy loads in about 0.1 s and the merge takes about 0.25 s; at 50k, 0.5 s and 1.2 s.
  A SQLite file can't be written in place in the user's GLUE folder (the web's synchronous file
  access only exists in the browser's private storage). It would be saved whole, or kept away from
  the folder the user owns, and it can't be read or copied by hand
  ([ADR 0009](0009-json-files-store.md)). Every edit would change the one file cloud sync
  compares, so sync would need change logs instead of file hashes. Worth revisiting only if
  collections reach hundreds of thousands of songs, or for queries the in-memory indexes can't do.
- **A second database in the cloud** (per-track rows): D1 is already SQL. Per-track rows would mean
  thousands of row writes per upload (the free plan allows 100k a day) and more Worker CPU time. The
  256 shards per collection keep writes few and small.

## Consequences
- A 7k-song device is about 5 requests to download and a few to upload.
- The first sync after this change downloads everything once (the earlier cache layout is removed).
- A merge of very large collections (50k+) takes about a second; the playlist matching and the
  song-key normalisation would be the first things to speed up.
