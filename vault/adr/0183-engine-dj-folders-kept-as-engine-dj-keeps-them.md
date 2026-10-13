---
status: accepted
date: 2026-10-13
---
# 0183. Keep Engine DJ's folders as Engine DJ keeps them

## Context
- **The symptom (the user, 2026-10-12–13, GLUE Home quit):** in Engine DJ, a playlist made inside "2022" could only be
  renamed: no songs could be added, and it couldn't be moved or deleted.
- **What a folder holds** (seen in copies of the user's databases, `vault/research/engine-dj-write-back.md`):
  - an Engine DJ list with lists in it holds each song of those lists once, with `PlaylistEntity.membershipReference`
    set to the number of them that hold it;
  - it can also hold songs of its own (reference 0, held by none of its lists): "Tugaria" has 449.
- **The Collection follows this rule** in 15,627 folder entries (1,255 of them the folders' own songs), all but 614
  that GLUE wrote:
  - 208 entries with the wrong reference;
  - 406 songs GLUE added to a list but not to its folders.
- **F: doesn't:** 12,261 of 16,331 folder entries are wrong.
- **Why:** GLUE wrote every entry with reference 0 and never a folder's entries:
  - the restore into F: (0.68);
  - the catch-up (0.73.1);
  - copying changes into the drive (ADR 0182);
  - "Make the drives' copies match…" (0.73.3).
- **Engine DJ updates those references** in the Collection and the drive whenever a list in a folder changes.
  **[UNVERIFIED]** that the wrong ones are why it refused; it fits every case the user saw, and the user's test will
  tell.

## Decision
- **At the end of every sync with Engine DJ** (with Engine DJ closed and playlists on), GLUE Home makes every folder in
  the Collection's database, then in each drive's, hold what Engine DJ's rule says (`enginedb::fix_folders`). It
  writes only where something is wrong, after a backup.
- **What the repair changes:**
  - only folders' entries; lists, their order and their songs aren't touched;
  - an entry stays where it is, and its reference is set to the number of the folder's lists that hold it;
  - a song a list holds and the folder doesn't is put at the folder's end;
  - in the Collection, a song none of the folder's lists holds stays as the folder's own;
  - in a drive's copy, it stays only if the Collection's folder holds it as its own (`folders_own`); otherwise it is a
    copy GLUE made, and it goes.
- **GLUE's mirror of its own playlists** (ADR 0180) leaves a folder's songs to Engine DJ: it neither sends GLUE's (a
  GLUE folder has none) nor takes Engine DJ's.
- **The first sync after updating** repairs what GLUE left. On copies of the user's databases, the repair changed:
  - the Collection: 614 entries, exactly GLUE's;
  - F:: 15,244 entries;
  - a second run: none.

## Alternatives considered
- **Keep the references in each write** (insert, remove, `set_items`, moves): every write path would have to know a
  folder's rule. It would also leave what GLUE has already written. A repair after the writes covers both in one place.
- **Copy the Collection's folders into the drive as they are:** a drive's lists hold only the songs on that drive, so
  its folders can't hold what the Collection's do.
- **Leave folders alone:** the damage stays, and Engine DJ stays stuck.

## Consequences
- **Every sync reads every entry of each Engine DJ database** (about 25,000 for the user's): a few milliseconds. It
  writes only when something is wrong.
- **Something new to watch:** a folder's songs follow its lists from now on, as in Engine DJ. A GLUE folder in Engine DJ
  holds its playlists' songs.
- **If Engine DJ still refuses** a change to a new list in "2022" once its folders are right, the cause is elsewhere.
  Fresh copies of the databases are the next step.
