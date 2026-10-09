---
updated: 2026-10-09
---
# Engine DJ: what writing back to it involves

For the two-way sync the user asked for on 2026-10-08 (playlists, cues, loops and the beat grid prepared in GLUE,
written into the DJ apps; theirs shown in GLUE). Read from **copies** of the user's three Engine DJ databases (C:, F:,
G:; Engine DJ closed, journals empty), nothing written; and from libdjinterop's source.
**[UNVERIFIED]** marks what isn't confirmed yet.

## The databases (schema 3.0.2, Engine DJ 4.x / 5.x)
- One `Engine Library/Database2/m.db` per place Engine DJ uses: the computer's (`Music/Engine Library`, 16 songs here)
  and each drive's (F: 6,871 songs; G: 21). Each has its own `Information.uuid`.
- **The playlist tree is the same in every database:** 763 playlists and 24,872 entries in each of the three, the
  entries naming the database their song is in (`databaseUuid`; 8 databases, 5 of them not connected now: other
  drives or sticks). Engine DJ copies the tree into every database. How it reconciles them (which one wins, what a
  drive that isn't plugged in gets later) is **[UNVERIFIED]**: it has to be watched in Engine DJ itself.
- **Observed on 2026-10-09 (ADR 0173):** after GLUE Home 0.68–0.69 had removed the songs of five unplugged databases
  from F:'s lists (13,013 entries left), Engine DJ, reopened, brought F:, C: and G: to the same 21,580. Lists GLUE hadn't
  edited came back from C:/G:; lists it had edited (their `lastEditTime` the newest) went to C:/G: as they were. So it
  seems to reconcile each list to its latest edit, across the databases that are there **[UNVERIFIED: inferred from the
  counts, not from Engine DJ's documentation]**. A drive plugged in later would take the latest lists in the same way.
- `Playlist.isPersisted` differs by database (C: 105 of 763, F: 510, G: 90): its meaning is **[UNVERIFIED]** (perhaps the
  lists holding songs of that database, kept when it's alone on a player).
- Engine's own triggers keep the linked lists in order: inserting a `Playlist` with `nextListId` = the list it goes
  before, or deleting one, re-links its siblings (`trigger_before_insert_List`, `trigger_after_insert_List`,
  `trigger_after_delete_List`); deleting a `PlaylistEntity` re-links the entries (`trigger_before_delete_PlaylistEntity`).
  A list's title is unique among its siblings (`C_NAME_UNIQUE_FOR_PARENT`); an entry once per list
  (`C_NAME_UNIQUE_FOR_LIST`). Track ids are never reused (`trigger_after_insert_Track_check_id`).
- Engine DJ's rules for third-party tools: don't open the database while Engine DJ runs; never change the schema;
  identify songs by `(originDatabaseUuid, originTrackId)`.
  [Engine KB](https://support.enginedj.com/support/solutions/articles/69000834165)

## Cues, loops and the grid (`PerformanceData`, one row per song, in the database that holds the song)
From the bytes of the user's songs, matching libdjinterop's encoders (`src/djinterop/engine/v2/*_blob.cpp`):
- **qCompress** where compressed: a 4-byte big-endian length, then a zlib stream.
- `quickCues` (compressed, big-endian): int64 count (8); per hot cue: uint8 label length, label bytes, double sample
  offset (−1 = not set), colour A, R, G, B; then double adjusted main cue, uint8 main cue adjusted, double default main
  cue; then extra bytes (kept as they are).
- `loops` (**not** compressed, **little-endian**): int64 count (8); per loop: uint8 label length, label, double start,
  double end (−1 = not set), uint8 start set, uint8 end set, colour A, R, G, B; extra bytes.
- `beatData` (compressed): double sample rate (BE), double samples (BE), uint8 grid set; then the default grid and the
  adjusted grid, each an int64 count (BE) of markers (double sample offset LE, int64 beat number LE, int32 beats to the
  next LE, int32 unknown LE); extra bytes (9 on the user's songs).
- `trackData` (compressed): starts with the sample rate (double BE); the rest **[UNVERIFIED]**.
- Positions are samples: seconds = offset / sample rate. Writing changes `Track.lastEditTime` by trigger.

## What follows for GLUE
- Cues, loops and the grid: one database per song, read-modify-write of its blobs (unknown bytes kept), with Engine DJ
  closed. The lower risk part.
- Playlists: the same change in every connected database, and how Engine DJ merges trees (and treats a drive that
  wasn't connected) watched before GLUE writes any: an experiment with Engine DJ and a throwaway library first.

Sources: [libdjinterop](https://github.com/xsco/libdjinterop) (`beat_data_blob.cpp`, `quick_cues_blob.cpp`,
`loops_blob.cpp`), the user's databases (copies, 2026-10-08), [Engine KB](https://support.enginedj.com/support/solutions/articles/69000834165).
