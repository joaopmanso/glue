---
status: accepted
date: 2026-10-09
---
# 0181. An Engine DJ library found in the Music folder; one made where a song's drive has none, once it's known safe

## Context
A song GLUE adds to Engine DJ (ADR 0171, 0179, 0180) goes into the collection of the Engine DJ database on its file's
drive, its path from that `Engine Library` folder: Engine DJ keeps one database per drive with music, and a path is
relative to its own drive's.

The user's song (2026-10-09) was in GLUE Home's incoming folder (TO BE SORTED), `C:\Users\…\Music\GLUE Incoming`; their
library is on F:. GLUE Home looked for Engine DJ's databases only at each drive's top and where the library was read
from, found none for C:, and the song stayed out ("its drive (C:) has no Engine DJ library…"). Engine DJ keeps the start
disk's library in the Music folder (`…\Music\Engine Library`), not at the drive's top. The user: "I want it to be added
automatically and if needed it'll get analysed next time I open engine dj".

## Decision
- **Looked for in the Music folder too:** the start disk's Engine DJ library (`known_folders().music`), with the drives'
  tops and the library's own.
- **A file's real place:** links and junctions followed before its drive is chosen.
- **Made where there's none: held** (2026-10-10). The GLUE folder GLUE Home made in F:'s library isn't shown in Engine
  DJ (though Engine DJ sees its name), so what Engine DJ does with what GLUE writes into its databases is checked on
  the user's databases first. Until then a song on such a drive stays in GLUE's playlist and says why. Ready for then
  (`enginedb::create_like`, tested):
  - the Music folder's for the start disk, the drive's top for another drive GLUE Home sees;
  - its tables, indexes, views and triggers copied from the main library's database, its version (`user_version`,
    `Information`) the same, with its own id;
  - then the song is added there as to any other, and Engine DJ analyses it when it next opens.
  - Never over a database that's there; said in GLUE Home's activity.

## Alternatives considered
- **Ask the user to add one song from that drive in Engine DJ first:** the user wants it automatic.
- **Copy or move the file onto the library's drive:** GLUE doesn't move a user's music without being asked (sorting
  TO BE SORTED into a music folder is the user's move).
- **A path from the main library to another drive:** Engine DJ's paths are relative to their own drive's library;
  there's no relative path across Windows drives.

## Consequences
- A song anywhere GLUE Home can reach goes into Engine DJ.
- **[UNVERIFIED]** that Engine DJ uses a database GLUE made on a drive (as it does those other tools make for USB
  drives). If it doesn't, the songs there show as missing in Engine DJ's playlists; the database can be deleted, and
  sorting the songs into a music folder on the library's drive puts it right. The user's first case was settled by
  that sort, so this hasn't been seen yet.
