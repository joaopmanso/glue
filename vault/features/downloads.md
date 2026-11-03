---
status: shipped
milestone: M6
updated: 2026-11-03
adrs: [0193]
---
# Downloads

## What it does
Saves songs as files, from this computer or, through its GLUE Home, from another of the user's computers. The user's
aim: "remotely create a USB drive to play a DJ set".

## Now
- **Where:**
  - a song's menu: **Download** (its file);
  - a selection's menu: **Download N songs as a zip**, side by side;
  - a playlist's or folder's menu (sidebar, phone): **Download as a zip**;
  - a DJ app's playlist's menu, and a Discogs playlist's (its digital songs).
- **A playlist in the zip:** a folder, the songs numbered in order (`01 name.flac`), so a player listing a folder by name
  keeps the set's order. A folder of playlists keeps its folders; a song in two playlists is in both.
- **Names** are safe on Windows, FAT32 and exFAT (`downloadPlan.ts`), each once per folder.
- **Getting the bytes:**
  - this computer: from the file;
  - this computer's GLUE Home's incoming folder: over the local link;
  - another computer: 4 MB ranges over the connection to its GLUE Home (`remoteFiles.pull`), each asked for again up to
    5 times, the connection made again if it dropped.
- **Writing:**
  - a save dialog (Chrome, Edge): straight to disk, any size (`zipStream.ts`: stored, ZIP64 past 4 GB);
  - no save dialog (Firefox, Safari, phones): gathered as Blobs in the browser, an ordinary download at the end.
- **The panel** (`DownloadPanel.svelte`): the progress, the song it's on, Cancel. Afterwards, what was left out and why. A
  song that fails doesn't stop the rest; a full disk does. Closing the tab while it runs asks first.

## Open
- **A USB drive directly:** saving into a chosen folder instead of a zip, with nothing to unzip (not asked for yet).
- **DJ-app USB exports** (rekordbox or Engine DJ databases on the drive) are a different feature: this gives plain files.
