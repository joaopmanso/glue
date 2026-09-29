---
status: accepted
date: 2026-09-29
---
# 0103. GLUE Home analyses its computer's songs; the tab takes the results; Stop, Analyse now, and what GLUE Home is doing

## Context
The user closed the browser with 5,100 songs left to analyse while GLUE Home ran, and nothing moved:
only an open GLUE tab analysed for the library, and GLUE Home made waveforms for other devices only. The
user (2026-09-29) also asked for:
- right-click "Analyse now";
- a way to stop the analysis;
- GLUE Home showing what it's doing, with toast-like messages (songs being analysed, a song received…).

## Decision
- **GLUE Home analyses its computer's songs** (`home/ui/analysis.ts`), with the website's own analysis
  code and half the computer's cores (at most 4).
  - Its queue: songs asked for now first, then songs never analysed or whose file changed, oldest added
    first. It scans the GLUE folder at most every 5 minutes, listing the shards that are there.
  - Each result goes to GLUE Home's cache (`home/ui/cache.ts`): the library's part `s/…/<id>.json`
    (`core/library/analysed`: the summary and the file's facts), the fingerprint `p/…/<id>.bin`, and,
    as before, the mini spectrogram, waveform, details and cover.
  - A file that can't be read is recorded as such, and not tried again until it changes.
  - The results waiting to be taken in are kept across restarts (`s/pending.json`).
- **The collection's writer takes the results in (one writer, ADR 0051):**
  - no tab holds the lease: GLUE Home writes them into the collection itself (`CollectionStore` through
    the local link), then syncs the account's copy;
  - a GLUE tab in Home mode, signed in, with its GLUE Home answering (`lib/homeAnalysis.svelte.ts`):
    - it runs no analysis of its own;
    - every 4 s it asks GLUE Home `{t: 'analysis', take: true}` (which tells GLUE Home the tab takes
      the results in);
    - it fetches up to 30 results (`{t: 'cache'}`, 6 files each), puts them into the collection and this
      browser's cache (details, fingerprint, mini spectrogram, waveform), and says which it took;
  - a tab in Home mode that can't reach GLUE Home over the channel (not signed in, an older GLUE Home)
    analyses by itself, as before. GLUE Home leaves the songs to it while it holds the lease.
- **Right-click "Analyse now"** is also offered for another computer's songs with no analysis: their
  computer's GLUE Home does them first. On this computer in Home mode, GLUE Home does it.
- **Stop:** the library's analysis bar has **Stop** while analysing. It stops what runs at once, and turns
  background analysis off until it's turned on again. In Home mode, turning background analysis off or
  on pauses or resumes GLUE Home. What was running when stopped is dropped, never stored as failed.
- **GLUE Home's window: Activity** (`home/ui/Settings.svelte`):
  - what it's analysing and how many are left;
  - analysed and failed since it started, and how many wait to go into the library (and who takes them);
  - Pause / Resume (`HomeConfig.analysisPaused`, which a GLUE tab's pause also sets);
  - "Lately": its recent events (analysing N songs, a song received from a device, analyses put into the
    library, changes taken in from other devices, paused, resumed);
  - each new event shows as a toast for a few seconds.

## Alternatives considered
- GLUE Home analysing only while no tab is open, and the tab taking over when it opens: two analysers
  in turn, each with its own progress and its own stop; what the user saw as "why did it stop?".
- A route on the local link for the results: a Rust change, when the channel both already use carries
  the requests and the files.

## Consequences
- In Home mode the tab's analysis bar shows GLUE Home's work ("by GLUE Home").
- A tab not signed in doesn't hand its analysis over (the channel needs the account's signaling room).
- GLUE Home doesn't match duplicates itself yet: its fingerprints reach this computer's tab, which
  matches and publishes them (ADR 0098).
