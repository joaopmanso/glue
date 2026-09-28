---
status: accepted
date: 2026-09-28
---
# 0087. Other computers' songs can be edited; the owner's GLUE Home takes the edits in

Extends [ADR 0040](0040-cloud-sync-and-merged-collections.md) (edits for the owning device),
[ADR 0071](0071-song-info-written-through-glue-home.md) (song info written into the files) and
[ADR 0077](0077-library-on-any-device.md). Builds the writer lease that
[ADR 0051](0051-glue-home-as-local-engine.md) planned.

## Context
The user (2026-09-28): "on my laptop I can't edit the song info for the songs on the desktop. Desktop
is running Home App I should be able to perform all operations I want. That includes changing the
title or adding some genres or tags."

What was there:
- **Song info of another computer's songs was blocked in the UI:** title, artist, album, genre,
  label, year, grouping and comment. The edit ops had no place for it anyway.
- **Ratings, notes, GLUE tags and playlists did travel,** as ops in GLUE Cloud. But only the
  owner's *browser* applied them, and only while GLUE was open there (every 2 minutes). GLUE Home
  never took part.
- **GLUE Home never wrote the GLUE folder** (ADR 0051 kept the open tab as the one writer). The
  lease that lets GLUE Home write when no tab is open was planned but not built.

## Decision
- **Song info travels as ops.** `EditOp` `track` gains `info` (`INFO_FIELDS`).
  - `diff` sends the fields that changed.
  - `apply` treats them as the owner's own edit: `edited` (an import won't fill them in again) and
    `unwritten` (to be written into the file). A title can't be emptied.
- **The UI allows it** wherever the song belongs to a collection (`lib.canEditInfo`): the table's
  inline edit, Edit info, Genre, and the song's page. Songs waiting in TO BE SORTED are edited once
  they're in a music folder. Changed here, another computer's song isn't marked edited; its owner
  does that.
- **The owner's open tab** writes applied info into the files right away (`writeInfo`, through GLUE
  Home in Home mode).
- **The writer lease** (`/lease` on the local link):
  - a GLUE tab in Home mode renews it every 5 s, and it lapses after 15 s (`LEASE_AT` in `local.rs`,
    `lease_held` to the service page);
  - while it's held, the tab is the writer and GLUE Home leaves the library alone.
- **GLUE Home applies edits when no tab holds the lease** (`home/ui/edits.ts`): soon after starting,
  every minute, and at once when another device says it sent some.
  - It asks GLUE Cloud for the ops waiting for its companion browser. It learns which browser that is
    from `/v1/me`.
  - It applies them with the website's own store code (`CollectionStore`, `apply`), through its own
    local link's file API (`HomeDisk`: the same atomic writes). The local link now also accepts the
    service page's own origins.
  - It writes edited song info into the files (`writeUnwritten`, shared with the website, over
    `/fs/tags`).
  - It remembers how far it got (`e/applied.json`) and **doesn't confirm** the ops. They stay
    waiting in GLUE Cloud, so the other devices keep showing them on top of the owner's last copy
    until the tab there opens, confirms them (nothing left to change) and uploads the collection.
- **Nudges:**
  - a device that sends edits tells the owner's GLUE Home over the channel (`edits` request);
  - GLUE Home bumps a counter that the lease answer carries, so an open tab there takes them in at
    once instead of within 2 minutes.

## Alternatives considered
- **GLUE Home confirms the ops itself:** the other devices would then show the owner's stale cloud
  copy (without the edit) until that computer's tab uploads. GLUE Home would also need to upload
  collections, which is the rest of the sync ADR 0051 left for later.
- **A second writer with no lease:** an open tab keeps the collection in memory and would write it
  back over GLUE Home's changes.
- **Edits over the channel only (no GLUE Cloud op):** lost when the owner's GLUE Home is off.

## Consequences
- **A laptop can edit the desktop's songs.** With GLUE Home running there, the edit reaches the
  desktop's GLUE folder and files within seconds, whether or not a GLUE tab is open.
- **The ops wait in GLUE Cloud** until the owner's tab opens. The 20,000 waiting-op limit still
  applies.
- **GLUE Home 0.19 is needed** for the lease and for applying edits. With an older one, the tab
  applies them, as before.
- **Still for later (ADR 0051):** GLUE Home uploading the collection itself, so the cloud copy is
  current with no tab.
