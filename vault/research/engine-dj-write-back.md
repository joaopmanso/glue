---
updated: 2026-10-10
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

## What GLUE's playlist writes did (copies of C:'s and F:'s `m.db`, 2026-10-10, Engine DJ closed, read only)
The user: the playlists GLUE Home 0.72 made (its "GLUE" folder, ones made from GLUE's DJ collection) show in GLUE but
not in Engine DJ, though Engine DJ names a new "Glue" "Glue 2".
- **Measured:**
  - C: (`C:\Users\…\Music\Engine Library`, uuid `c8666559…`): 764 playlists, 24,873 entries, 16 songs. F: (uuid
    `103a4d6b…`): 628 playlists, 24,358 entries, 6,879 songs.
  - **A playlist has the same id in both.** 623 ids are in both; the user's playlists made in Engine DJ on 2026-10-09
    ("cenas" 9044, "Teste GLUE 123" 9046) are in both with those ids, their entries the same (naming F:'s songs).
  - Only in C: 141, all empty with `isPersisted` 0 (Engine DJ doesn't copy those to F:).
  - **Only in F: 5, all GLUE's:** the GLUE folder (9052), two "Auto · Life Round Here (Gisaza Remix)" (9056, 9059), and
    two "Playlist" made from GLUE's DJ collection (9058, 9060).
  - **An id clash:** 9047 is the user's "Playlist" in C: and GLUE's "Auto · WONDA" in F: (F:'s ids ran on by GLUE's
    writes: C:'s sequence 9047, F:'s 9060).
  - **114 playlists' songs differ** between C: and F:: e.g. "2022" has 3,792 entries in C: and 5,214 in F:, "140" 3,662
    and 3,194. The restore of 2026-10-09 (ADR 0173) went into F: only; Engine DJ, opened since (the user made "cenas"
    after it), didn't take F:'s into C:.
  - `membershipReference`: in F:, its own songs' entries mostly 0 (13,293) and 1 (344); other databases' 0. In C:,
    values 0–5. Its meaning is **[UNVERIFIED]**.
- **Inferred [UNVERIFIED]:**
  - Engine DJ shows (and keeps as the master) the computer's database's tree (C:), and makes each change in every
    database that carries it with the same id. Then a playlist GLUE wrote only into F: isn't shown, and Engine DJ's own
    next new playlist on C: can take the id GLUE used on F:.
  - Engine DJ doesn't bring F:'s newer lists into C: on opening: the inference above (that it reconciles each list to
    its latest edit across databases) doesn't hold for C:, so ADR 0173's restore may not be what Engine DJ shows.
  - To be checked in Engine DJ: whether F: shows as a drive of its own in Engine DJ's sidebar (with its own playlists,
    the GLUE folder among them), and how many songs "2022" has there (3,792: C:'s; 5,214: F:'s).
- **What follows:** GLUE's playlist writes are paused (GLUE Home 0.72.3) until they're made as Engine DJ makes them:
  into C:'s database (the master) and every other carrying the tree, with the same id (one free in all of them), and
  GLUE's DJ collection read from C:'s tree. And F:'s 5 GLUE-made playlists and the clash at 9047 put right.

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
