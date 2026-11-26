---
status: accepted
date: 2026-11-26
---
# 0196. GLUE's playlists reach Engine DJ through a library of GLUE's own, shown as a drive

## Context
- **The rekordbox XML (ADR 0195) works, but nothing about it is automatic** (the user, 2026-11-26: "it works, but forces
  me to always manually update the rekordbox collection and import to EngineDJ. it would be better if it was
  automatic"). Engine DJ has no setting to read the XML again by itself: *Update Rekordbox Library* is a click, and the
  lists still have to be dragged into the Collection.
- **Engine DJ 5.3 merges every drive's library with its Collection each time it starts** ("Aggregating drives",
  [research](../research/engine-dj-write-back.md)). Tried with the user on 2026-11-26, Engine DJ closed and each database
  backed up first, with a library made as F:'s is and shown as drive Z: (`subst`):
  1. Z: showed as a drive and its playlist in the Collection; its songs played (by a path through Z:, and by their whole
     path, `F:/Music Collection/…`); moving songs in Engine DJ reached Z: too.
  2. Z: changed while Engine DJ was closed (a song taken out, one added, a new playlist): the Collection showed it when
     Engine DJ next started.
  3. A playlist deleted, one renamed, a folder with a playlist in it: all shown so; the nested list could be moved and
     added to in Engine DJ.
  Engine DJ made every database's playlists the same, with the same ids (the Collection's and F:'s ids, apart since the
  repair of 2026-11-25, now agree), with no loop or orphan. It knows a list by its name among its siblings: a list renamed
  is another list (the old one left empty and not shown), and it copies all the Collection's lists into Z: too.
- ADR 0194 stands: GLUE doesn't write Engine DJ's own databases.

## Decision
- **GLUE Home keeps an Engine DJ library of its own**, `<Music>/GLUE/Engine DJ/Engine Library/Database2/m.db` (`djDrive`
  in the settings: a folder; `false`: none), made as Engine DJ's Collection is (`create_like`), **shown to Engine DJ as a
  drive** (Windows: `subst`, the last free letter from Z:, again each time GLUE Home starts; left out of the drives GLUE
  Home searches).
- **It writes there the lists marked *Keep in Engine DJ*** (ADR 0195's tree, `dj_glued`) under the top "GLUE" folder:
  each list by its name among its siblings, made, emptied, re-filled, re-ordered or taken out as GLUE has them; a folder
  holds its lists' songs, each counted (`membershipReference`), as Engine DJ's do. Nothing outside "GLUE" is touched (the
  lists Engine DJ copies in stay as they are). What the user changes inside "GLUE" in Engine DJ is GLUE's again the next
  time GLUE writes it: one way, GLUE's.
- **Songs:** one Engine DJ has already (the Collection or a drive's library here, the same file) is that one, so it keeps
  Engine DJ's analysis and isn't a second copy; another goes into GLUE's library by its whole path, and Engine DJ
  analyses it. Songs not on this computer are left out and counted.
- **When:** on the DJ timer, only while Engine DJ is closed (ADR 0168), when GLUE's lists or the library's file changed
  (Engine DJ writes it too, when it merges). Worked out first in a transaction thrown away: when something changes, the
  library is backed up (GLUE Home's cache, the last 3) and then written.
- **The user's old top "GLUE" folder** (made by GLUE before 0.80) becomes this one (the user, 2026-11-26: "that older
  top-level Glue folder should become the one from the Z: drive. we can remove it and re-add if needed").
- The XML stays, for rekordbox and as a way that needs no drive.

## Alternatives considered
- **Write into the Collection while Engine DJ is closed** (ADR 0170–0182): left Engine DJ unusable three times.
- **The XML only:** a click and a drag each time.
- **A drive per music drive** (GLUE's library next to Engine DJ's on F:): two libraries on one drive; Engine DJ makes
  one per drive. One library of GLUE's, songs by whole path, needs nothing on the user's drives.
- **Pointing at another library's songs only** (no songs of its own): songs Engine DJ doesn't have yet couldn't go.

## Consequences
- GLUE's playlists are in Engine DJ by themselves, the next time it starts after a change; while it's open they wait.
- **Windows only for now:** macOS has no `subst`; a disk image or a folder in `/Volumes` is to be tried.
- `subst` lasts until the computer restarts: Engine DJ started before GLUE Home doesn't see the drive that time (the
  Collection keeps the lists it merged; their songs from GLUE's own library show as missing until it's back).
- A list renamed in GLUE leaves an empty, hidden list in each Engine DJ database (Engine DJ's way).
- GLUE's songs in its own library have no cues or grid from GLUE yet (Engine DJ analyses them); the XML carries them.
