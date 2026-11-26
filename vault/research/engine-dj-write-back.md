---
updated: 2026-11-26
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
  - **Confirmed by the user in Engine DJ (2026-10-10):** F: shows under Drives as "Shared", apart from the Collection.
    "2022" shows 1,007 songs in the Collection and 985 under the drive: C:'s entries for F:'s songs that exist (1,006,
    and one of another database) and F:'s own (985). So the Collection is C:'s tree, and a drive shows its own copy.
- **2026-10-12, copies before and after Engine DJ opened** (a song added from GLUE; "Engine Ref" and "Test" made in
  Engine DJ): Engine DJ makes a new list in both databases with the same id (`isPersisted`/`isExplicitlyExported` 1
  in C:, 0 in the drive's while it has no songs of it). Chains, ids and the shared lists' order are consistent. The
  songs GLUE added differ from Engine DJ's own in two columns only: `isMetadataImported` 0 (Engine DJ's: 1) and no
  `bitrate` (Engine DJ's: kbps, 1,411 a CD-quality WAV/AIFF, 2,117 a 24-bit one, 320 an MP3). A missing `albumArtId`
  isn't it (Engine DJ's own new songs have none too). Whether those two columns are why Engine DJ wouldn't move those
  songs (the user: removable, not movable) is **[UNVERIFIED]**; the user couldn't move a playlist or add a song to
  "Engine Ref" either.
- **2026-10-12, on 0.73.2, GLUE Home quit the whole time:** Engine DJ's own new playlists (top level, or inside
  "2022") can only be renamed: no songs added, not moved, not deleted, across restarts. Existing playlists (and GLUE's
  in its folder) work. Renaming the GLUE folder (the playlist before "Engine Ref") and back freed "Engine Ref"; "test123"
  (inside "2022") stayed stuck. The databases have nothing else that names a playlist (Pack, Smartlist,
  PreparelistEntity empty), no empty column, consistent chains, views and ids: what's stuck is in Engine DJ itself.
  **Hypothesis [UNVERIFIED]:** Engine DJ keeps a drive's copy in step with the Collection and expects them to match;
  since 2026-10-08 (identical then) they've drifted through GLUE (0.68–0.72 F:-only writes, the restore into F:, the
  0.73.1 catch-up into C:): 114 lists differ, "2022" by thousands of entries. A change it can't make in the drive's copy
  may leave the new list locked. Next: Engine DJ's log (asked of the user); the fix would be F:'s copies of shared lists
  made the Collection's (F: would get back 3,503 entries GLUE 0.68 took and drop 3,034 the restore added that the
  Collection hasn't): the user said "not yet". Engine DJ keeps no log of it (only its licence file under
  `%LOCALAPPDATA%\inMusicBrands`). **2026-10-13, the test:** 0.73.3's **Make the drives' copies match…** on "2022" (on
  the copies: 31 lists, 26 changed, 3,050 songs in and 3,020 out of F:'s, nothing else changed); then whether
  "test123" (inside "2022") works.
- **What followed:** ADR 0182 (GLUE Home 0.73). GLUE's playlist writes were paused (0.72.3) until made as Engine DJ makes them:
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

## Engine DJ 5.3: "Aggregating drives" (2026-11-25/26, from its logs and the user's databases)
Engine DJ 5.3 (installed 2026-11-20) broke on the user's desktop: songs shown then gone, playlists that wouldn't save,
move or delete. Found in Engine DJ's own logs (`%LOCALAPPDATA%\AIR Music Technology\EnginePrime\Logs`, one file per
session; the first place to look next time) and in copies of the databases; fixed with the user's go-ahead, each file
backed up beside itself first.
- **On every start, 5.3 merges each connected drive's library into the Collection** (the job "Aggregating drives"). It
  attaches the drives' `m.db` (`db1`, `db2`…) and works in one long write transaction; while it runs, the Collection shows
  no songs, and edits wait for its lock ("Deleting playlist"/"Moving playlist" fail after about 30 s, `SQLITE_BUSY`, error
  144). It had never finished since the update.
- **It renumbers a drive's entries:** `UPDATE dbN.PlaylistEntity SET trackId = trackId - 1 - (SELECT MAX(trackId) …)`, so
  negative `trackId` is Engine's own in-between state (its `trigger_before_delete_PlaylistEntity` skips `trackId <= 0`). F:
  held 120 such entries left from a run that stopped (all shifted by exactly 7,564, checked against the same lists in the
  Collection); they made the renumber fail on `C_NAME_UNIQUE_FOR_LIST`. Put back by adding 7,564.
- **It copies the Collection's new playlists into the drives with new ids but keeps the Collection's `parentListId`.** The
  ids only line up while every database has the same playlists. GLUE's folder and mirror lists (ids 9046–9077, Collection
  only after a time) put the Collection's ids ahead of the drives', so the user's new "2027 › Playlist" (Collection 9074 ›
  9075) arrived on G: with a parent that doesn't exist and on F: as id 9074 *with parent 9074*: a loop. Engine's recursive
  views (`PlaylistAllParent`, `PlaylistAllChildren`, `PlaylistPath`) never end on a parent loop, so the merge grew to
  13 GB. Fixed by removing GLUE's folder (Collection, F:, G:) and the broken copies.
- **With three near-identical libraries (Collection, F:, G:: 630–789 playlists each) the merge still grew without end**
  (1.5 → 6 GB in 100 s, the lock held throughout). With G:'s library hidden (renamed to `G:\Engine Library (hidden from
  Engine 2026-11-26)`: an old copy of a whole collection, 778 lists, 21 songs, paths of a "jmanso" computer) it finishes in
  seconds and everything works (the user, 2026-11-26). Whether the size or something in G:'s data was to blame is
  **[UNVERIFIED]**.
- 5.3 also logs `no such column: trackNumber` ("Updating track list"): no database has that column, not even one Engine
  made itself, so it's Engine's bug, not the data's.

**What follows for GLUE:** never add playlists to Engine DJ's Collection that the drives don't get too: anything that
makes the databases' playlist ids differ sets off 5.3's parent-id bug. GLUE's own library should be a separate one, as a
drive's is (ADR 0194, the redesign to come), and Engine's logs are checked after any write.

## A library of GLUE's own, shown as a drive (2026-11-26, tried by hand with the user, Engine DJ 5.3)
A library made as F:'s is (its schema, a new id), in a folder shown as drive Z: (`subst Z: <folder>`), Engine DJ closed
and every database backed up before each round. Engine DJ's log showed only its usual warnings and its `trackNumber` bug.
1. **Seen at start:** Z: listed with the drives; its playlist ("GLUE test", 3 songs) in the Collection's playlists. Songs
   played by a path through Z: (`../F/Music Collection/…`, a junction in the folder) and by their whole path
   (`F:/Music Collection/…`). Engine DJ gave the list a new id (1 → 9851, the sequence past every database's lists),
   the same in all three, and copied all the Collection's 772 lists into Z: (their entries pointing at the other
   databases' songs). The Collection's and F:'s ids, apart since the repair of 2026-11-25, agreed after.
2. **Changed while closed** (a song out, one in, a new list "GLUE test 2", its id the next of Z:'s sequence, by
   Engine DJ's insert triggers): in the Collection and F: at the next start, as written.
3. **Deleted, renamed, nested:** the deleted list left empty in each database and not shown; the renamed one a new list
   (id 10629, the sequence + 777) with the old one left empty and not shown, so Engine DJ knows a list by its name among
   its siblings; a folder with a list in it shown so. The user moved the nested list out and added a song: fine.
- A song whose file is gone ("Yoof": F:'s own library lists `03 Yoof.mp3`, not on the disk) is listed and won't play
  ("Failed to create reader").
- `isPersisted` isn't whether a list is shown: in the Collection every one of these was 0.

**What follows for GLUE:** ADR 0196 (GLUE Home keeps this library and writes only its "GLUE" folder, while Engine DJ is
closed). Not tried: macOS (no `subst`), Engine DJ started without the drive, a drive letter that changes.

## What follows for GLUE
- Cues, loops and the grid: one database per song, read-modify-write of its blobs (unknown bytes kept), with Engine DJ
  closed. The lower risk part.
- Playlists: the same change in every connected database, and how Engine DJ merges trees (and treats a drive that
  wasn't connected) watched before GLUE writes any: an experiment with Engine DJ and a throwaway library first.

Sources: [libdjinterop](https://github.com/xsco/libdjinterop) (`beat_data_blob.cpp`, `quick_cues_blob.cpp`,
`loops_blob.cpp`), the user's databases (copies, 2026-10-08), [Engine KB](https://support.enginedj.com/support/solutions/articles/69000834165).
