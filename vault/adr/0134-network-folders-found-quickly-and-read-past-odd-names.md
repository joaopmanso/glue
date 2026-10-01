---
status: accepted
date: 2026-10-01
---
# 0134. Folders dropped in Home mode are looked for briefly, then asked for, with the page saying so; scans read past odd names

## Context
The user, 2026-10-01:
- **Windows desktop:** dropping a network folder, "it'll take maybe up to 10 seconds for a popup to appear from the
  home app to confirm the folder … the waiting time is bad because nothing happens on the screen."
- **Mac (the tester):** "never a folder confirmation screen, and even adding a network folder by using the +folder
  button is not working, it keeps showing 'Can't scan Música: Bad Path'." A subfolder sometimes works, and its
  songs seem to be analysed by the browser rather than GLUE Home.

What happens:
- **A dropped folder in Home mode** must be GLUE Home's (ADR 0122). GLUE Home looks for it by name and a song in it:
  the user's folders, then every drive, for up to 25 s, and its dialog asks only after that.
  - **Windows:** a network share (`\\NAS\Música`) is on no drive unless mapped, so the drop waited for the whole
    search with nothing on the page.
  - **Mac:** shares are under `/Volumes`, which is searched, so it's found without asking. That part works as
    intended.
- **GLUE Home's disk** (`disk.rs` `inside`) refused any name with `:` or `\` ("bad path"). Those are a drive or a
  stream on Windows, but ordinary characters on macOS and Linux: a song Finder shows as "Track 1/2" is
  `Track 1:2` on disk, common on music shares.
- **One such name failed the whole scan:** `scanFolder` stopped at the first folder it couldn't list, and
  `scanRoot` at the first song whose details it couldn't read.

## Decision
- **GLUE Home allows `:` and `\` in names except on Windows.** `.`, `..`, null and control characters stay refused
  everywhere. Rust tests run in CI on Windows and macOS.
- **A scan reads past what it can't read:**
  - a folder inside that can't be listed, or a song whose details can't be read, is skipped;
  - the scan's message says how many and which folders ("2 folders couldn't be read ("Remixes", …), skipped");
  - those songs stay as they were, never marked missing (`applyScan`'s `unsure`);
  - the music folder itself unreadable still fails the scan, as a network folder not connected should.
- **A dropped folder in Home mode:**
  - GLUE Home looks for 5 s (`find_folder` `secs`), then its dialog asks;
  - the page says what's happening: "Looking for "Música" on this computer (GLUE Home)…", then "Choose "Música" in
    GLUE Home's window (it may be behind this one)…";
  - + Folder in Home mode says the second.
  - The search when GLUE Home opens a collection keeps its 25 s.

## Alternatives considered
- **Skip the search for dropped folders and always ask:** a dropped local folder is found in well under a second
  most of the time, with no dialog. 5 s keeps that and caps the wait.
- **Detect network folders in the browser:** a dropped folder's handle has no path, so the browser can't tell.
- **Keep refusing `:` on macOS:** the songs with such names would never play or be analysed there.

## Consequences
- On Windows, a dropped network folder asks after about 5 s, and the page says so from the start.
- On a Mac, a network folder with odd names scans; anything still unreadable is named, not fatal.
- **Not confirmed:** the tester's report that GLUE Home doesn't analyse that Mac's songs. If it persists after
  0.41.1, GLUE Home's window (Activity) says why; "which computer this is isn't known yet" would mean ADR 0108's
  identity.
