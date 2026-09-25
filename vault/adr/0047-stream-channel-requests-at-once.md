---
status: accepted
date: 2026-09-25
---
# 0047. Stream channel: requests at the same time, tagged bytes, time limits

Refines the stream channel of [ADR 0045](0045-glue-home-companion.md) and
[ADR 0046](0046-glue-home-shares-analysis-and-sorts-incoming.md).

## Context
On the laptop, with a 7k-song desktop, the user (2026-09-25) saw:
- some songs stuck at "getting it from Desktop… 0%" until a page reload;
- after that, nothing played and most waveforms were gone;
- the track page blank while a song loaded.

The channel ran one request at a time on both ends, with no time limits.
- One slow request held up everything behind it, for example a song whose music folder was still
  being searched for, or an analysis made on demand.
- A request whose answer never came stopped the channel for good.

In GLUE Home, an urgent analysis asked for while the background analysis was busy waited for a
queue that nothing ran (a deadlock), and an analysis that never finished held every later one.

## Decision
- **At the same time:** every binary message starts with its request's number (4 bytes,
  `frame` / `unframe` in `core/transfer.ts`), so answers interleave. The website runs up to six
  requests per GLUE Home (two of them songs); GLUE Home handles each as it comes.
- **Time limits:** an answer must start within 40 s and keep coming (20 s between messages), else
  the request fails. Two time-outs in a row close the channel, and the next request reconnects.
- **Pending instead of waiting:** a track page asking for an analysis GLUE Home doesn't have yet
  waits at most 12 s, then gets `pending`. The analysis is made first in line and the page asks
  again every 8 s. Meanwhile the page shows the summary widgets, "Getting the full analysis
  from …" or "… is analysing this song now", and the song's download progress.
- **GLUE Home's analysis queue:** the background loop runs waiting urgent jobs itself, and each
  analysis has a 2-minute limit (the worker is replaced after it).
- **Waveforms** that aren't there yet are asked for again for longer (up to 10 times, the gap
  growing to a minute).

## Consequences
- An old GLUE Home (≤ 0.3.0) and a new website don't understand each other's binary messages: GLUE
  Home updates itself within hours, or with Check for updates.
- The ordering guarantee is per request now, not per channel.
