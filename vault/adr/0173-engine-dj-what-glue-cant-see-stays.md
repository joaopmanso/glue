---
status: accepted
date: 2026-10-09
---
# 0173. Engine DJ: what GLUE can't see stays where it is; one backup each time Engine DJ closes

## Context
On 2026-10-09 the user's Engine DJ playlists lost about 3,400 entries to GLUE Home 0.68–0.69's playlist sync (ADR 0171).

**The setup:**
- Engine DJ's playlists hold songs of every drive the user ever plugged in, eight databases in all.
- GLUE reads the databases of the drives there now (F:, C:, G:). Its copy of a playlist holds only the songs it can name.

**What happened:**
- **The first sync** (no agreed state yet) took the union of the two sides. That kept the other drives' songs but moved
  them to the end, and it recorded that as agreed.
- **The next sync** saw Engine DJ's side unchanged and GLUE's without those songs. So it took them for songs removed in
  GLUE, and removed them from F:'s database (13,013 entries left, all of the three drives).
- **When Engine DJ reopened,** it reconciled the copies of the tree that each drive's database holds. Lists GLUE hadn't
  edited came back from C: and G:. The ones it had edited, now the newest, won, and C: and G: took them.
- **What's still lost:** about 3,400 entries of four drives that aren't plugged in, in 17 playlists of the 2022, 2023 and
  2024 folders.

**Two smaller faults showed at the same time:**
- **A backup of the 163 MB database at every sync that changed anything:** three in 20 seconds, and the last 3 kept,
  so every copy from before the damage was gone.
- **More than one round to settle.**

## Decision
- **GLUE merges only the playlist entries it knows.** These are the songs of the databases it has read (its records,
  ones it added, ones a relink pointed at).
  - The other entries are left out of the merge, on both sides and in the agreed state, and stay where they are
    (`glue_interop::sync::splice`).
  - The known entries take the known places in the merged order. One removed leaves its own place. One added goes after
    its neighbour in the merge.
  - The same holds for the order of playlists among their siblings: a playlist GLUE has no copy of keeps its place.
- **One backup per database each time Engine DJ has been closed:** GLUE Home remembers which databases it copied
  (`DjWatch.backed`) and forgets them when it sees Engine DJ open. The 3 kept then reach back three sessions, not three
  syncs.
- **Recovery:** `crates/glue-interop/examples/restore_lists.rs` puts the entries back into the library's database.
  - **Its sources:** another copy of the tree, either a drive's database (as of when that drive was last in) or an older
    copy of the library, read entry by entry if the copy is damaged.
  - **What it touches:** playlists found by folder path. It re-adds only the songs of databases GLUE doesn't read, each
    after the one it followed.
  - **How it runs:** it reports before writing, and writes only with Engine DJ closed and a backup made. It's run by
    hand, with the user's go-ahead.

## Alternatives considered
- **Holding back the whole sync of a playlist with songs GLUE can't name:** safe, but the user's playlists mix drives,
  so nearly all of them would never sync.
- **Reading every database a playlist names before syncing it:** they're on drives that aren't there.
- **A backup before each write, kept longer:** at 163 MB each, the cache would grow by gigabytes a day.
- **Waiting for Engine DJ to put the songs back from the drives when they're plugged in:** it reconciles to the newest
  edit, and GLUE's damaged lists are the newest. The drives would lose their copies too.

## Consequences
- Syncing can be switched back on with 0.70: songs of drives that aren't in are never removed or moved.
- **What the user must know:** a drive with Engine DJ's tree from before 2026-10-09 is a recovery source until the lists
  are restored. Plug it in with Engine DJ closed, or Engine DJ copies the damaged lists over it.
- **What the restore can't know:** songs removed on purpose from those 17 playlists after the source copy was made come
  back with it. The restore's report is checked with the user first.
- Engine DJ's reconciling of the drives' trees by the latest edit is observed, not documented [UNVERIFIED].
