---
status: accepted
date: 2026-09-25
---
# 0042. Sync by default, merge by itself, and show the merged collection in this computer's library

Supersedes parts of [ADR 0040](0040-cloud-sync-and-merged-collections.md): "opt-in per profile",
"linking a second device" (the setup dialog), and merged collections being only a cloud view.

## Context
With two devices signed in, the user (2026-09-25) still saw only this computer's songs. They had to
turn on Cloud sync per profile, answer the merge dialog, and then open the merged collection from
the cloud panel as a separate view: "I don't want to click 4 or 5 different buttons". Their rules:
- cloud sync is on by default once signed in;
- adding or merging a collection updates the library by itself;
- the device a song is on is a column you can filter;
- other devices' data is kept on this computer (no question asked), so every instance with sync on
  has a matching collection, offline too;
- a loading signal while the cloud is read;
- a track that is on another device doesn't ask for file permission: streaming (GLUE Home) isn't
  available yet, so the page says where the file is.

## Decision
- **Sync is on by default** for every profile of a signed-in user. `Profile.cloudSync` absent means
  on; `false` means the user turned it off (the profile screen's button). No setup dialog.
- **Automatic merge:** when a local collection opens and isn't in a merged collection yet, it's
  merged with the account's same-named collection on another device (or, if this profile has one
  collection and the account has exactly one elsewhere, with that one). A collection that was
  merged once remembers it (`Collection.cloudMerged`), so an Unmerge from the cloud panel isn't
  undone on the next open.
- **The merged collection is this computer's library.** The local collection stays the one that's
  saved, scanned and analysed here. The other devices' part is laid over it in memory
  (`core/library/overlay.ts`, `lib.applyOverlay`):
  - a song this device also has stays its own row, with every device that has it;
  - a song only elsewhere is a row with id `r…` and `remote: { device, name }`;
  - a playlist only elsewhere is a list of its own; a playlist on both shows both's songs.
  - `CollectionStore.ephemeral` keeps those tracks, analyses and lists out of this computer's files,
    and device names are never saved. Scans and imports never match other devices' tracks.
- **Edits of shared data** (ratings, notes, tags on songs another device has; its playlists; shared
  playlists) are diffed like in a cloud view and sent to the owning devices in their own ids
  (`overlayOps`). Playlists made here stay here; the others see them through their own overlay.
- **A copy in the GLUE folder:** `cloud/<device>/profiles/<pid>/…` mirrors each other device's
  synced files, refreshed file by file by hash; `cloud/state.json` keeps the account's devices and
  merges. The library opens from the copy at once (and offline), then updates from the cloud,
  showing "Updating from Desktop…". Signing out removes `state.json`; "Delete everything in my
  cloud" removes `cloud/`.
- **Device column and filter**, shown only when more than one device's songs are on screen; each
  device has a colour (the same in the sidebar's Devices, where clicking a device filters too).
- **Other devices' files:** no play button and no permission prompt; the track page says the file
  is on that device and that streaming comes with GLUE Home.

## Alternatives considered
- **Open the merged cloud view by default:** local playing, analysis, scanning and imports would all
  need to work through merged ids. The overlay keeps the local collection as it is.
- **Copy the other devices' tracks into the local collection's files:** they would be uploaded again
  as this device's, and "who owns this" would be lost.
- **Ask before merging:** the user asked for fewer steps; merging changes nothing on disk and can be
  undone.

## Consequences
- The GLUE folder grows by each other device's data files (a few MB for 10k tracks).
- A song added here that exists elsewhere shows twice until the overlay is rebuilt (a few seconds
  later).
- Waiting edits (sent from here, not yet applied there) aren't shown on top of the cached copy while
  offline.
- Streaming from another device (GLUE Home) will plug into the same `remote` tracks.
