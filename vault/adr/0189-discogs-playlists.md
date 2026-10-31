---
status: accepted
date: 2026-10-31
---
# 0189. Discogs playlists: vinyl and digital together, kept under Discogs

## Context
The user (2026-10-31): "I would like to be able to create playlists using these songs I have on Discogs. If possible either
discogs only or mix and mash with digital. maybe have them under the music -> discogs icon. Auto playlists with some
filters such as genres or artists would be great as well." Their choices:
- **Vinyl-only tracks live under Discogs only.** The library (All tracks, counts, duplicates, Engine DJ) is untouched.
- **Auto playlists filter by** genre and style, artist and label, year and format, vinyl or digital.

GLUE's playlists hold song ids, and there are no live-rules playlists (the auto playlist builder makes a fixed one).

## Decision
- **A Discogs playlist is a collection list** (`lists/<id>.json`: synced, backed up, binned like any) marked
  `discogs: { rules? }`.
  - **Its items mix** the library's song ids and vinyl tracks `dg:<release id>:<position>` (`discogsLists.ts`
    `vinylRef`, `parseRef`, `vinylTrack`).
  - **An auto one** keeps `rules` and no items. Its tracks are worked out live (`discogsAuto`): each track of the
    collection's records (not the wantlist) whose record passes the rules, as its song here (`RecordMatch.byTrack`) or as
    vinyl.
  - **The rules:** genres, styles, artists (the track's own, a compilation's, or the record's), labels, formats, a year
    range, vinyl / digital / both, and an order. "Save as a playlist" freezes the result.
- **Kept out of the library's lists:** `childLists` (the Playlists sidebar), every `listTree` caller ("Add to
  playlist", the moves), the builder's avoid list and the phone skip lists with `discogs`. The bin restore and a
  shared collection's join keep `dg:` items (they used to drop items that weren't songs). Engine DJ and the exports
  never see them (no `apps`; the M3U drag-out skips what isn't a song).
- **Shown under Discogs:**
  - **The sidebar:** each playlist under 💿 Discogs (🎵, or ⚙ for an auto one) with its count; right-click Rename,
    Delete.
  - **The view** (`#/discogs/<id>`, `DiscogsListView.svelte`): a song's row plays (▶). A vinyl row shows the record's
    cover, the position, the record, label and catalogue number, and **On vinyl**. Move up or down (or drag), remove,
    Play the digital ones, and the counts.
  - **The Discogs view:** **+ Playlist** and **+ Auto**.
- **Adding:**
  - **A record:** right-click › Add to Discogs playlist (its tracks: songs as themselves, the rest vinyl);
  - **One track:** the ＋ on a track in a record's panel;
  - **A library song:** right-click › Add to Discogs playlist.
- **Found on the way and fixed** (for every edit with GLUE Home, not only these):
  - **Lost on a quick reload:** the page queues its changes for GLUE Home and sends them 150 ms after the last, and
    "Saving…" didn't count that queue. A reload straight after quick edits lost them. Now "Saving…" shows while changes
    wait (`lib.unsaved`), and a page going away sends them as a `keepalive` request (`engineClient.sendNow`, on
    `pagehide`).
  - **Undone by an old read-back:** a file edited here while GLUE Home's copy of it was being read back is no longer
    replaced by that older copy (`CollectionStore.reloadFiles` skips it; the next read-back brings the result).

## Alternatives considered
- **Vinyl tracks as songs in the library:** thousands of songs that can't play or be analysed, to keep out of
  analysis, duplicates and exports. The user chose to keep them under Discogs.
- **A file of its own for Discogs playlists:** song ids are a collection's, so the playlists belong with its lists;
  as lists they sync and go to the bin like any.
- **Auto playlists stored as items, refreshed:** live rules follow each new read of the collection without a step.

## Consequences
- **A vinyl track whose record left the collection** shows as "Not here any more" (its item stays until removed).
- **Playing skips vinyl tracks:** they're for pulling the record.
- **Another device:** the playlists travel with the collection, but their vinyl rows need the Discogs records, which
  only a computer with GLUE Home reads (ADR 0187).
