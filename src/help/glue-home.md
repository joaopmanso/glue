---
title: GLUE Home
summary: The app for your computer: analysis with the browser closed, songs on your other devices, the drag dock.
keywords: glue home, app, window, desktop, open library, browser, tray, first run, setup, guide, glue folder, sign in, playing, slow to start, hard disk, sleep, session, connected, devices connected, most at once, disconnect, engine, background, stream, drag dock, incoming, stop, start, restart, download, windows, mac
tour: glue-home
order: 12
---
GLUE Home is a small app for Windows and macOS (it sits by the clock). It's optional, and makes GLUE better:
- **It's the library's engine:** it analyses your songs, syncs them with your account, makes the day's backup and keeps your library with the browser closed. While it runs, GLUE in your browser is only its screen.
- **No folder permissions:** a GLUE page on that computer uses GLUE Home's access to your folders.
- **Your songs on your other devices:** your laptop and phone play this computer's songs, straight from it.
- **TO BE SORTED:** songs sent from your other devices land in its incoming folder.
- **The drag dock** carries songs and playlists into Engine DJ, rekordbox or a folder.
- **Song info into files,** and duplicates moved aside or recycled.

## Getting it
Download it from GLUE (Devices › + GLUE Home) and install it. It updates itself.

The first time it opens, its window shows a short guide:
- **Your GLUE account:** open GLUE, sign in and choose "This computer, with GLUE Home": one click connects GLUE Home.
  Or type the code GLUE shows (Devices › + GLUE Home). Optional: without an account GLUE works on this computer only.
- **Where GLUE keeps your library:** the folder GLUE already uses on this computer, found by itself; or **Make a GLUE
  folder in Documents** for a new library (GLUE sets it up the first time it opens it: your profile, then your music).
- **Songs sent to this computer:** the incoming folder, which you can change.
- **Start with this computer,** so it's ready without opening it first.

Then **Open GLUE library**. GLUE without a folder for its data asks for one on its first screen: with GLUE Home, that's
GLUE Home's own folder window.

## GLUE in its own window
A click on GLUE Home's icon (or **Open GLUE library**) opens GLUE in GLUE Home's own window: the same GLUE as on the
website, without the browser around it. Songs and folders dropped on it are added as in a browser, exports go to your
Downloads folder, and links to other sites open in your browser. It opens straight on your library, and when GLUE Home
is connected to your account the window is signed in by GLUE Home, as this computer: no second sign-in. (Signed out
there on purpose, it stays signed out.)
Closing it leaves GLUE Home running by the clock. To open GLUE in your browser instead: GLUE Home's settings ›
This computer's library › **Open the library in** › My browser.

## Start, Stop, Restart
**Stop** (in its window or menu) stops everything: the website on that computer then carries on by itself. **Start** goes back; **Restart** starts its engine and analysis over.

## Devices connected
Each of your other devices keeps a private connection with GLUE Home while GLUE is open on it (one per browser tab): its songs, waveforms and covers come through it, encrypted end to end, and GLUE Home tells it at once when something's ready. Its window lists the devices connected, with **Disconnect** (that tab is refused for an hour). **Most at once** (5 unless you change it) is how many it takes: when that many are connected, another device is told GLUE Home is full.

## Playing comes first
A song you play, on this computer or streamed to another device, goes ahead of the analysis: the analysis pauses its reads while the song loads, and songs have a connection of their own to GLUE Home. If the first song after a while still takes several seconds, a hard disk may be waking up: Windows turns hard disks off when they've been idle (20 minutes, unless changed in Power Options), and spinning up takes the drive a few seconds.

## How fast it analyses
A folder you add is listed once and its songs appear at once with their file names; GLUE Home then reads each one's tags (artist, title…) and analyses it, a few songs at a time, never more than its setting.
GLUE Home's window shows how fast it's going (Activity › Speed): songs a minute with a chart of the last ten minutes, how fast it reads your drives and network folders, and two meters. **Places in use** shows the songs being analysed now, reading their file (orange) or analysing it (green): mostly orange means the drive or network is the limit, mostly green the processor. **A song's time** shows the same, on average. When something stands out it suggests a change.
- **Songs at a time:** more is faster on this computer's own drives, and uses more of its processor.
- **From each network folder at a time** (no limit unless you set one): a song on a network folder (a NAS) is read over the network before it's analysed. When reading takes most of the time, fewer at once from each network folder leaves the other places for songs on this computer's drives. A NAS that reads 25 MB a second gets through about 1,500 hi-res songs an hour, however fast the computer.
