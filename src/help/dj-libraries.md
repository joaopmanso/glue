---
title: DJ libraries
summary: Import rekordbox, Engine DJ, Serato, Traktor and Apple Music; followed live.
keywords: dj, rekordbox, engine, serato, traktor, apple music, itunes, m3u, import, playlists, xml, m.db, nml, main, main dj library
tour: dj-libraries
order: 4
---
GLUE reads your DJ apps' libraries. It writes into one only when you ask it to keep your main Engine DJ library in step (below).

## Importing
- **Found for you:** GLUE looks for DJ libraries in your music folders and the places you point it at ("Look in…"). They show under **DJ libraries found**; click **Add**, or **×** to take one off the list.
- **By hand:** **+ Import** takes a rekordbox XML, an Engine DJ `m.db`, a Serato database, a Traktor collection, an Apple Music library or an M3U playlist.
- **Engine DJ** keeps a database on every drive it's used with; GLUE shows the set as one library and reads them together.

## Kept up to date
An imported library is followed: when the DJ app changes it, GLUE reads it again. Its playlists are browsed under DJ libraries and brought into GLUE when you want them.

With **GLUE Home** running, GLUE Home does this itself: it finds the libraries in your music folders, reads them when you click **Add**, and follows their changes within seconds, even with no GLUE tab open. A dot next to a library says it's followed live. **Refresh** reads it again now.

## Your main DJ library
Right-click a DJ library › **Make it the main DJ library** (or **Make it main** on a song's Prepare tab). Its beat grids and cues become every song's by default: the BPM in your lists, the grid and the cue pads in Prepare. What you set in GLUE still comes first. It's marked **main**, and it's the library GLUE will keep in step with both ways.

## Kept in step both ways (Engine DJ)
With GLUE Home running, right-click your main Engine DJ library › **Keep in step both ways…**. The hot cues, saved loops and beat grids you set in GLUE are written into Engine DJ, and what you change in Engine DJ comes into GLUE.
- GLUE Home writes only while **Engine DJ is closed**: a few seconds after you quit it. The ⇄ by the library turns amber while changes wait.
- It backs Engine DJ's library up before it writes, once each time Engine DJ has been closed (the last three are kept).
- GLUE's pads A–H are Engine DJ's hot cues (a loop on a pad goes as a hot cue at its start); GLUE's memory loops are its saved loops. Memory cues and Engine DJ's main cue stay where they are.
- A song changed in both since they were last in step: its Prepare tab asks which to keep.
- **Its playlists stay in its DJ collection** (under the library in the sidebar). Import one to have GLUE's own copy under **Playlists**: it follows Engine DJ, and deleting it only takes GLUE's copy away.
- **Change Engine DJ's own playlists there**, without importing them:
  - right-click a playlist or folder: **New playlist inside…**, **New folder inside…**, **Rename…**, **Move to**, **Delete in Engine DJ…**; right-click the library for a new one at the top;
  - drop songs on a playlist, or use a song's **Add to Engine DJ playlist**; a song Engine DJ doesn't have yet is added to its collection;
  - in a playlist's view, drag its songs to reorder them, and **Remove from playlist** (or Delete) takes them out.
  - It shows at once, with an amber ● while it waits: GLUE Home writes it into Engine DJ when Engine DJ is closed, after a backup.
- **GLUE's own playlists in Engine DJ:** right-click one of yours under Playlists › **Keep in Engine DJ**: it goes into a **GLUE** folder there, both ways. See [Playlists](#/help/playlists).
- **Song info both ways:** a song's title, artist, album, genre, comment, label, year and rating, edited in GLUE, are written into Engine DJ; changed in Engine DJ, they come into GLUE. Changed on both sides since they were last in step, GLUE's is kept.
- After a duplicates clean-up, Engine DJ's playlists play the copy GLUE kept: its song points at that file (with its cues), or the song Engine DJ already has for it takes its places.

## Songs with no file
A DJ library can list files that aren't in your music folders (moved, or removed as duplicates). They show under **No file linked**, where GLUE finds most of them in your library. See [No file linked](#/help/no-file).
