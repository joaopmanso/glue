---
title: DJ libraries
summary: Import rekordbox, Engine DJ, Serato, Traktor and Apple Music; followed live.
keywords: dj, rekordbox, engine, serato, traktor, apple music, itunes, m3u, import, playlists, xml, m.db, nml, main, main dj library
tour: dj-libraries
order: 4
---
GLUE reads your DJ apps' libraries. It doesn't write into them: GLUE's own playlists reach Engine DJ and rekordbox through a file of GLUE's (below).

## Importing
- **Found for you:** GLUE looks for DJ libraries in your music folders and the places you point it at ("Look in…"). They show under **DJ libraries found**; click **Add**, or **×** to take one off the list.
- **By hand:** **+ Import** takes a rekordbox XML, an Engine DJ `m.db`, a Serato database, a Traktor collection, an Apple Music library or an M3U playlist.
- **Engine DJ** keeps a database on every drive it's used with; GLUE shows the set as one library and reads them together.

## Kept up to date
An imported library is followed: when the DJ app changes it, GLUE reads it again. Its playlists are browsed under DJ libraries and brought into GLUE when you want them.

With **GLUE Home** running, GLUE Home does this itself: it finds the libraries in your music folders, reads them when you click **Add**, and follows their changes within seconds, even with no GLUE tab open. A dot next to a library says it's followed live. **Refresh** reads it again now.

## Your main DJ library
Right-click a DJ library › **Make it the main DJ library** (or **Make it main** on a song's Prepare tab). Its beat grids and cues become every song's by default: the BPM in your lists, the grid and the cue pads in Prepare. What you set in GLUE still comes first. It's marked **main**, and it's the library GLUE will keep in step with both ways.

## GLUE's playlists in Engine DJ
With **GLUE Home** running, right-click one of your playlists or folders under **Playlists** › **Keep in Engine DJ**.
They show up in Engine DJ by themselves, in a **GLUE** folder among its playlists, the next time you start it. There's
nothing to set up in Engine DJ.

How: GLUE Home keeps an Engine DJ library of its own (normally `Music\GLUE\Engine DJ`), which Engine DJ sees as one more
drive (a drive letter such as **Z:**). Each time Engine DJ starts, it takes in what's on its drives, GLUE's too. GLUE
never writes Engine DJ's own files.
- GLUE Home writes only while **Engine DJ is closed**. Changes you make in GLUE while it's open reach it the next time
  you close it and start it again.
- Songs Engine DJ already has are its own, with its analysis. Others are added, and Engine DJ analyses them.
- Only songs whose file is on this computer go in. GLUE Home's settings (**Folders › Engine DJ**) say how many were left
  out, and turn it off.
- The **GLUE** folder is GLUE's: what you change inside it in Engine DJ is put back as GLUE has it. Copy a playlist out
  of it to make it Engine DJ's own.
- Windows only for now. On a Mac, use the rekordbox file below.

### The rekordbox file
GLUE Home also keeps the same playlists, with their hot cues, saved loops and beat grids, in a rekordbox XML file
(normally `Music\GLUE\GLUE.xml`). rekordbox can read it as its **rekordbox xml** library. Engine DJ can too: in
**Preferences › Library › rekordbox**, choose the file, then click the **rekordbox** icon in the Collection pane ›
**Update Rekordbox Library** each time you want GLUE's latest.

## Kept in step both ways (Engine DJ): paused
**GLUE doesn't write into Engine DJ for now** (since November 2026). After Engine DJ 5.3 rebuilt its library, GLUE took the
rebuilt library for changes, removed playlists made in Engine DJ and added copies of its own. Until it comes back,
differently, GLUE only reads Engine DJ: what you change there shows in GLUE, and changes go into Engine DJ from Engine
DJ itself. The options below aren't offered meanwhile; this is how it worked:

With GLUE Home running, right-click your main Engine DJ library › **Keep in step both ways…**. The hot cues, saved loops and beat grids you set in GLUE are written into Engine DJ, and what you change in Engine DJ comes into GLUE.
- GLUE Home writes only while **Engine DJ is closed**: a few seconds after you quit it. The ⇄ by the library turns amber while changes wait.
- It backs Engine DJ's library up before it writes, once each time Engine DJ has been closed (the last three are kept).
- GLUE's pads A–H are Engine DJ's hot cues (a loop on a pad goes as a hot cue at its start); GLUE's memory loops are its saved loops. Memory cues and Engine DJ's main cue stay where they are.
- A song changed in both since they were last in step: its Prepare tab asks which to keep.
- **Its playlists stay in its DJ collection** (under the library in the sidebar). Import one to have GLUE's own copy under **Playlists**: it follows Engine DJ, and deleting it only takes GLUE's copy away.
- **Engine DJ's Collection:** GLUE shows and changes the playlists of Engine DJ's Collection (the one it shows on this computer), and makes each change in a drive's copy too when it holds that drive's songs, as Engine DJ does.
- **Change Engine DJ's own playlists there**, without importing them:
  - right-click a playlist or folder: **New playlist inside…**, **New folder inside…**, **Rename…**, **Move to**, **Delete in Engine DJ…**; right-click the library for a new one at the top;
  - drop songs on a playlist, or use a song's **Add to Engine DJ playlist**; a song Engine DJ doesn't have yet is added to its collection;
  - in a playlist's view, drag its songs to reorder them, and **Remove from playlist** (or Delete) takes them out.
  - It shows at once, with an amber ● while it waits: GLUE Home writes it into Engine DJ when Engine DJ is closed, after a backup.
  - **Make the drives' copies match…** (right-click a playlist or folder, or the library for all): a drive's copy of it (a drive Engine DJ keeps playlists on) is made as the Collection has it, after a backup. Use it if Engine DJ won't let you change a new playlist there.
- **GLUE's own playlists in Engine DJ:** right-click one of yours under Playlists › **Keep in Engine DJ**: it goes into a **GLUE** folder there, both ways. See [Playlists](#/help/playlists).
- **Song info both ways:** a song's title, artist, album, genre, comment, label, year and rating, edited in GLUE, are written into Engine DJ; changed in Engine DJ, they come into GLUE. Changed on both sides since they were last in step, GLUE's is kept.
- After a duplicates clean-up, Engine DJ's playlists play the copy GLUE kept: its song points at that file (with its cues), or the song Engine DJ already has for it takes its places.

## Songs with no file
A DJ library can list files that aren't in your music folders (moved, or removed as duplicates). They show under **No file linked**, where GLUE finds most of them in your library. See [No file linked](#/help/no-file).
