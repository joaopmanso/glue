---
status: accepted
date: 2026-11-25
---
# 0194. GLUE doesn't write into Engine DJ (writes off unless switched on)

## Context
- **The symptom (the user, 2026-11-25):** "engine dj bugs by displaying and then removing tracks, I can't add new tracks or
  create new playlists, and the playlists from glue are no longer getting synced … right now the priority is to regain
  control of the features in engine DJ".
- **What changed under GLUE:** Engine DJ 5.3.0.7 was installed on 2026-11-20. The Collection's database
  (`C:\Users\…\Music\Engine Library\Database2\m.db`) has had a new id since then (`c8666559…`; GLUE's backups up to
  2026-11-20 18:23 have it as `76ca4274…`, the id now on `G:\Engine Library`), and its playlists' rows changed in ways
  GLUE never writes (folders' songs, `isPersisted`, edit dates put back to 2024–2025). An Engine DJ rebuild is the
  likely cause **[UNVERIFIED]**.
- **What GLUE Home 0.79 did with it** (copies of the databases, compared with its own backups): its sync took the rebuilt
  Collection for changes against what it remembered (ADR 0170–0182). On 2026-11-25 at 20:31 and 20:33, with Engine DJ
  closed, it deleted the user's "2027" and the "Playlist" in it (made in Engine DJ on 2026-11-20) and made "2027 (2)",
  "2027 (3)" and "2027 (4)" in its GLUE folder, each with a "Breathing Space EP", one more each run. SQLite's checks and
  every playlist chain were sound: the databases were whole, and what was in them wrong.
- **This is the third time** GLUE's writes have left Engine DJ unusable: 2026-10-10 (ADR 0181, 0182), 2026-10-14 (ADR
  0184: every playlist locked). Each time GLUE was keeping a model of Engine DJ's private database that Engine DJ itself
  can change at any time, an update included.

## Decision
- **GLUE Home writes nothing into Engine DJ unless its settings say `engineWrites: true`.** There is no button: it's off.
  The sync (`djsync.rs` `dj_sync_held`, the one way in for every write: cues, grids, song info, playlists, the GLUE folder,
  drives' copies, the duplicates' relinking, new drive libraries) returns before it opens a database, makes a backup or
  takes anything in; its state is `off`. An edit of Engine DJ's playlists from GLUE (`djEdit`) is refused, not kept for
  later.
- **Reading stays:** Engine DJ's libraries are still found, read and followed live (`dj.rs`), so what the user changes in
  Engine DJ shows in GLUE.
- **The page** hears `writes` with the DJ status and doesn't offer what would write (Keep in step both ways, Keep in
  Engine DJ, the DJ collection's edits); an older GLUE Home doesn't say, and isn't offered it either.
- **The code stays,** tested with `engineWrites: true` (`crates/glue-engine/tests/engine.rs`, `e2e/homemode.spec.ts`), for
  what comes next.
- **The user's Collection was put back** (their go-ahead, 2026-11-25) as GLUE Home's backup had it at 20:31, before
  GLUE's first write to the rebuilt database: only GLUE's changes differed. The file as it was is kept beside it
  (`m - before GLUE undo 2026-11-25.backup`). F: had no playlist change from GLUE that night.

## Alternatives considered
- **Fix the sync for 5.3** (forget what it remembered, take the new database as the base): it would work until Engine DJ
  changes its database again; the third breakage says the approach, not this case, is wrong.
- **`djPlaylists: false`** (the existing pause): playlists only; cues, grids and song info were still written.
- **Stop in GLUE Home**: stops everything else too (the analysis, the library, other devices).

## Consequences
- GLUE's cues, grids, song info and playlists don't reach Engine DJ for now: the user moves them with Engine DJ itself
  (the drag dock and M3U still carry songs and playlists).
- What GLUE Home's cache remembers of Engine DJ (`dj/…`: the last agreed state, the GLUE folder's ids, waiting edits) is
  from before Engine DJ 5.3. **Before writes come back in any form, it has to be let go**, or it acts on the old state
  again.
- **What's next (to be designed, with the user):** GLUE keeping its own Engine DJ library, as a drive's is, holding only
  GLUE's playlists and their songs, so GLUE writes its own database and never Engine DJ's Collection. How Engine DJ 5.3
  finds and shows a drive's library has to be checked first.
- The October GLUE folder and its "Teste GLUE 123" lists are still in the Collection; they predate the update and can be
  taken out with the user.
