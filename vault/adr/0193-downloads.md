---
status: accepted
date: 2026-11-03
---
# 0193. Download songs as files: ranges from GLUE Home, a zip written as it goes

## Context
The user (2026-11-03): "I want to remotely be able to create a USB drive to play a dj set. for this I need to be able to
remotely download tracks / playlists. can you add a download feature that will either download an individual track or
zip the selected tracks / playlists and download those?"

A set can be many gigabytes, on a remote connection that may drop. `remoteFiles.get` holds a whole song in memory and
`core/zip.ts` builds a zip in memory, with no ZIP64 (its use is backups). Neither fits.

## Decision
- **A streaming zip** (`src/core/zipStream.ts`, pure, writing to a sink):
  - entries are stored, since audio doesn't shrink;
  - a song's size is known before its bytes, so the header is written first and only the CRC patched in afterwards;
    there are no data descriptors, whose stored form some unzippers handle badly;
  - ZIP64 only for what passes 4 GB;
  - an entry that fails is dropped by truncating back to its start.
- **Remote bytes** (`remoteFiles.pull`): the streaming path's `range` asks, 4 MB at a time, held only until written.
  - A piece that fails is asked for again (5 tries, backing off), the connection made again if it dropped, so a long
    download resumes.
  - This computer's GLUE Home's incoming folder comes over the local link.
- **The target** (`src/lib/downloads.svelte.ts`):
  - `showSaveFilePicker` where it exists: written in place, so any size fits; the dialog opens before anything is waited
    for (it needs the click);
  - elsewhere, pieces gather as Blobs and download at the end.
- **What's in it** (`src/core/library/downloadPlan.ts`): a selection side by side under its own names; a playlist as a
  folder with its songs numbered, because a set's order is the point and a player lists a folder by name.
- **Missing songs never pass silently:** a song that can't be fetched, or has no file linked, is left out and listed. The
  rest still come. A disk error stops it all.
- **No server sees the music** (ADR 0002, 0037): the bytes go between the user's own computers.

## Alternatives considered
- **`createZip` with songs in memory:** a set would exhaust the tab.
- **Data descriptors, for a zip that never goes back:** every target here can go back, and without them every unzipper
  reads the result.
- **`remoteFiles.get` per song:** whole songs in memory, kept in its cache, and a dropped connection restarts the song.
- **An M3U playlist instead of numbers:** DJ gear browsing a USB drive lists files; numbered names work everywhere.
- **Deflate:** seconds of CPU per song to save almost nothing on audio.

## Consequences
- **Writing takes the zip's size twice for a moment:** the browser writes a temporary file and moves it into place on
  close, with a safety check that takes a while on a big file (the panel's "Finishing").
- **Without a save dialog** a big set depends on how much the browser will hold.
- **The tab must stay open:** nothing resumes after it closes.
- **Numbered names differ from the originals** in a playlist's zip; a selection keeps them.
