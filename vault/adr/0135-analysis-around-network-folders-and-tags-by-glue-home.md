---
status: accepted
date: 2026-10-01
---
# 0135. Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, one "left" count

## Context
The user, 2026-10-01, on the desktop, after adding a network folder of 9,807 songs:
- "the browser analysing - XXXX left text … does not match the Home App, there's always at least 20 or 30
  discrepancy";
- the progress bar is "stuck saying Reading tags… 0/9807 without doing nothing";
- "it takes quite some time to analyse the tracks but my CPU doesn't really go over 60% even while running 24
  tracks … I want to be able, if I have for example 10k tracks to analyse, to max out the capabilities."

Found:
- **The count:**
  - the tab showed GLUE Home's queued plus running;
  - GLUE Home's window showed queued ("to go") with the running ones apart;
  - with 24 at a time, they always differed by about 24.
- **Reading tags:** the tab read the first 512 KB of each new song through GLUE Home's local link, one song at a
  time, and updated the count every 200. For 9,807 songs on the NAS that's about 5 GB, competing with the analyses
  reading the same files whole: not stuck, but very slow and silent. GLUE Home's analysis brings the tags anyway
  (`analysed.ts`, `fillInfo`).
- **The processor:**
  - **Measured on the desktop** (16 logical processors, 24 at a time): the NAS share gave 12 MB/s reading one file
    and 24 MB/s reading eight at once, and its songs average 59 MB. That's about 0.4 songs a second, whatever the
    processor.
  - **Why it showed:** GLUE Home reads a song whole before analysing it and took songs in order, so a run of NAS
    songs held most of the 24 places waiting on the network, with the processor at 60%.

## Decision
- **One "left":** what isn't done yet, queued plus running.
  - GLUE Home's window: "Analysing 24 at a time · 9,830 left".
  - The tab shows GLUE Home's own number while GLUE Home has work. Once that's 0, it shows what the tab hasn't taken in
    yet, so "All analysed" means the results (titles included) are there too. (Showing only GLUE Home's number
    said "All analysed" before the results arrived, which the end-to-end test caught.)
- **A network folder's songs take turns** (`home/ui/lanes.ts`):
  - a song in a network folder (`\\server\share` or `//server/share`) starts only while fewer than 4 from that
    folder are running;
  - the other places go to songs on this computer's own drives, which the processor limits;
  - in order otherwise. "Songs at a time" still sets the total.
- **GLUE Home reads tags in batches** (0.41.2): `/fs/read-tags` takes a music folder and up to 500 paths, and
  reads only the tags (lofty, no audio, no pictures), 8 files at a time.
  - In Home mode the scan asks it 200 songs at a time, and the count moves after each request.
  - Without it (no GLUE Home, or an older one) the page reads each file's start as before, and the count moves with
    each song.

## Alternatives considered
- **More songs at a time:** with the NAS the limit, more parallel reads don't help, and can slow a NAS down.
- **Skip the quick tags in Home mode, leaving them to the analysis:** rows would show file names for hours on a big
  network folder. Reading only the tags is cheap.
- **Pre-reading the next songs while others analyse:** a 59 MB song each, many at once, is a lot of memory for a
  network that's the limit anyway.

## Consequences
- **Network folder and local songs together:** the processor works on the local songs while the NAS's songs come
  at the NAS's pace.
- **A network folder alone** still takes its time: about 1,500 songs an hour from this NAS. The help says so.
- The cap of 4 per network folder is a fixed number, not tuned per NAS. A faster network may want more.
