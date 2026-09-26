---
updated: 2026-09-26
---
# Dragging songs from GLUE into Engine DJ and Rekordbox

Tested on the user's desktop on 2026-09-26, with their permission: Engine DJ 5.1.0 and Rekordbox 7.2.13
installed. A probe moved the real mouse (SendInput) on the left screen, a short test song was dropped
into Engine DJ's track list, and Engine's databases were checked afterwards. Scripts:
`scratchpad/dnd/` (not in the repo).

## What Engine DJ accepts
| Dragged from | Data | Engine DJ |
|---|---|---|
| a native window (probe) | the real file path (`CF_HDROP`, as Explorer) | **accepted**; track added, pointing at the original file |
| a native window (probe) | only a file link (`UniformResourceLocatorW` + text `file:///…`) | **accepted**; track added, pointing at the original file |
| a native window (probe) | only the path as plain text | refused |
| Edge, a web page (`http://127.0.0.1`) | `text/uri-list` + `text/plain` = `file:///…` | **refused** (`dropEffect=none`) |
| Edge, a web page | `DownloadURL` (a copy of the file, GLUE's drag-out today, ADR 0027) | **refused** |
| Edge, a web page | both of the above | **refused** |

So Engine takes a real path or a file link from a native program, but nothing a web page can drag.
Chromium doesn't pass a page's `file:///` links on as the same Windows data, most likely on purpose
**[UNVERIFIED: the exact formats Chromium sets weren't dumped]**.

## Handing a drag from the browser to a native program
- The page can't start a native drag, so the idea was: the button goes down in the page, and GLUE Home
  starts a native drag (`DoDragDrop` with the real paths) while it's still held.
- **Doesn't work:**
  - with a plain `DoDragDrop` it ended at once, with no effect (the button was pressed in another
    process);
  - after `AttachThreadInput` to the browser's thread, the button still read as up;
  - with a custom `IDropSource` reading the physical button (`GetAsyncKeyState`), OLE refused to start
    (`E_FAIL`).
- A native drag has to start from a press on a native window.

## Rekordbox
- Not tested: started from a script, it stopped with "Communication with rekordboxAgent failed".
- A drag from Explorer (a real path) is what its manual documents. The table above suggests it
  behaves like Engine: native drags yes, web-page drags no **[UNVERIFIED]**.

## The drag dock (built, [ADR 0054](../adr/0054-drag-dock-in-glue-home.md))
- A drag from GLUE Home's dock window, with the dock filled through the local link, delivered the real
  file: dropped on the desktop, it was copied there.
- Engine DJ had quit by then, and wasn't restarted (the user may have been at the computer). It
  accepted the same kind of drag (a real path) from the probe.

## What this means for GLUE
- Dragging straight from the website into a DJ app isn't possible.
- It works from a **native window of GLUE Home**: the drag has to start there, from a press on it.
- The dependable route for playlists, cues and grids stays the rekordbox XML export (both apps read
  it, step 3 of Prepare).
- Clean-up for the user: Engine DJ's computer library has two test tracks, "GLUE drop test (hdrop)"
  and "(url)", also in the playlist "cenas". GLUE doesn't write to Engine's library (ADR 0010), so the
  user removes them.
