---
status: accepted
date: 2026-10-02
---
# 0141. Songs played get their own port, and a file read looks up only its own folder

## Context
The user, 2026-10-02, on GLUE Home 0.42.1: GLUE opened from GLUE Home's button, the first song played (a 52 MB WAV
on F:, a local drive) took 34 s to start; the songs after it started at once, a song from the NAS in under 2 s.
"Analysis should always be a parallel process and never impact functionalities."

Measured on the desktop afterwards:
- **The song itself is fast:** the same WAV through the local link, from a test browser of its own, played in 0.4 s,
  then 17 ms. GLUE Home's engine answered in about 10 ms while analysing.
- **F: is a hard disk** (a 4 TB Toshiba, also D: and E:), and Windows turns it off after 20 minutes idle. The
  analysis was on the NAS, so F: may have been asleep.
- **Every file read looked up every folder** (`disk.rs` `root`, `main.rs` `allowed`): it resolved each of GLUE Home's
  21 music folders (`canonicalize`) until one matched. Two NAS folders and five F: folders come before `F:\Music`.
  So a read of a local song asked the NAS too, and a read on one drive could wake another. The analysis's reads
  (`allowed`) did the same, every time.
- **The browser opens at most 6 connections to 127.0.0.1:47400** (ADR 0138), and the page's other requests to GLUE
  Home share them: the engine's feed (a 40 s long poll, always one), its status, the covers read from tags (3 at a
  time), the GLUE folder's files, the cache's HTTP fallback. Chrome had 6 open when looked at.

What held the 34 s isn't known for sure: a sleeping disk, a full set of connections, or the NAS. The two
mechanisms above are certain, and either can hold a song up.

## Decision
- **Songs played get their own port** (`local.rs` `PLAY_PORT`, GLUE Home 0.42.2): the same local link, the same
  answers and checks, on a second address (127.0.0.1, a free port), told to the website in `/hello` and `/connect`
  (`playPort`).
  - The website plays from it: a song in Home mode (`platform.fileLink(…, play)`, `HomeDisk.fileUrl`), a song in
    the incoming folder (`localHome.playUrl`).
  - Nothing else goes there: covers, the GLUE folder's files, the engine. In the browser, a port is its own set of
    6 connections, so a song clicked never waits for one.
  - An older GLUE Home (no `playPort`): the usual port, as before.
- **A file read looks up only its own folder** (`main.rs` `resolved`, `roots_for`):
  - the website names a root as GLUE Home's settings write it (`/fs/roots`), so that one folder is resolved and no
    other;
  - each folder's resolved name is remembered (10 minutes; one that couldn't be reached, 30 s), looked up outside
    the lock, so a slow network folder holds no other request up;
  - a file GLUE Home reads for itself is matched against the folder its path is written under first.

## Alternatives considered
- **All the page's other requests onto the socket** (ADR 0139), leaving HTTP to the songs: right in the end, but
  it's every request (the engine's, the GLUE folder's files, covers). A port of their own gives the songs the same
  guarantee now, whatever else the page asks.
- **Keeping the drive awake:** it's the user's power setting, not GLUE's.
- **Another host name (localhost):** not the same server in every browser (IPv6), ADR 0138.

## Consequences
- **A song plays without waiting on the page's other loads**, and a local song never waits on the NAS or wakes
  another drive.
- **What's left is the drive itself:** a hard disk asleep takes its seconds to spin up, for GLUE as for any app.
- **A second port to keep in step:** the website's play addresses carry the same token, and the stand-in in the e2e
  tests (`e2e/fakeHome.ts`) listens on both (`played`: what came on the songs' port).
- **A folder moved to another drive letter** is seen within 10 minutes (or when GLUE Home restarts).
