---
title: GLUE Home
summary: The app for your computer: analysis with the browser closed, songs on your other devices, the drag dock.
keywords: glue home, app, tray, playing, slow to start, hard disk, sleep, session, connected, devices connected, most at once, disconnect, engine, background, stream, drag dock, incoming, stop, start, restart, download, windows, mac
tour: glue-home
order: 12
---
GLUE Home is a small app for Windows and macOS (it sits by the clock). It's optional, and makes GLUE better:
- **It's the library's engine:** it analyses your songs and keeps your library with the browser closed.
- **No folder permissions:** a GLUE page on that computer uses GLUE Home's access to your folders.
- **Your songs on your other devices:** your laptop and phone play this computer's songs, straight from it.
- **TO BE SORTED:** songs sent from your other devices land in its incoming folder.
- **The drag dock** carries songs and playlists into Engine DJ, rekordbox or a folder.
- **Song info into files,** and duplicates moved aside or recycled.

## Getting it
Download it from GLUE (Devices › + GLUE Home), install, and connect it with the code GLUE shows. It updates itself.

## Start, Stop, Restart
**Stop** (in its window or menu) stops everything: the website on that computer then carries on by itself. **Start** goes back; **Restart** starts its engine and analysis over.

## Devices connected
Each of your other devices keeps a private connection with GLUE Home while GLUE is open on it (one per browser tab): its songs, waveforms and covers come through it, encrypted end to end, and GLUE Home tells it at once when something's ready. Its window lists the devices connected, with **Disconnect** (that tab is refused for an hour). **Most at once** (5 unless you change it) is how many it takes: when that many are connected, another device is told GLUE Home is full.

## Playing comes first
A song you play, on this computer or streamed to another device, goes ahead of the analysis: the analysis pauses its reads while the song loads, and songs have a connection of their own to GLUE Home. If the first song after a while still takes several seconds, a hard disk may be waking up: Windows turns hard disks off when they've been idle (20 minutes, unless changed in Power Options), and spinning up takes the drive a few seconds.

## How fast it analyses
GLUE Home's window shows how fast it's going (Activity › Speed): songs a minute with a chart of the last ten minutes, how fast it reads your drives and network folders, and two meters. **Places in use** shows the songs being analysed now, reading their file (orange) or analysing it (green): mostly orange means the drive or network is the limit, mostly green the processor. **A song's time** shows the same, on average. When something stands out it suggests a change.
- **Songs at a time:** more is faster on this computer's own drives, and uses more of its processor.
- **From each network folder at a time** (no limit unless you set one): a song on a network folder (a NAS) is read over the network before it's analysed. When reading takes most of the time, fewer at once from each network folder leaves the other places for songs on this computer's drives. A NAS that reads 25 MB a second gets through about 1,500 hi-res songs an hour, however fast the computer.
