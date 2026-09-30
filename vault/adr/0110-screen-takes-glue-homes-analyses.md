---
status: accepted
date: 2026-09-30
---
# 0110. The screen takes GLUE Home's analyses when it needs them; a song page never re-analyses in Home mode

Amends [ADR 0104](0104-glue-home-is-the-librarys-engine.md) (what the tab takes from GLUE Home's cache).

## Context
On the user's desktop (2026-09-30):
- Songs showed a label but no Overview, and opening one analysed it again in the tab.
- GLUE Home's cache held about 12,000 analysed songs (mini spectrogram, waveform, details, fingerprint).
  The tab copied them only for the feed entries it saw while it was open, so everything GLUE Home had
  analysed while no tab was open stayed invisible.
- When GLUE Home wrote the song info into a file (`sharedSync.ts`, `writeUnwritten`), the file's size and
  date changed while its cached details kept the old stamps. So the details looked stale and the song was
  analysed again.

## Decision
- **Home mode reads GLUE Home's cache on demand** (`/cache` on the local link, `engineClient.fromCache`):
  - the Overview thumbnail and the waveform, when the browser's storage has none (`thumbs.fromHome`,
    `waves.fromHome`);
  - a song's details, when the browser's storage has none (`lib.detailsFromHome`). Their stamps are checked,
    and they're then kept in the browser's storage.
- **A song page in Home mode never analyses in the tab.** Without details it asks GLUE Home to analyse the
  song now, says "GLUE Home is analysing this song", and shows the results when they're ready.
- **Writing song info into a file restamps its cached analysis** (`cache.restamp`: the details' header and
  the stored result), in GLUE Home and after the tab's own writes (the `restamp` rpc). The file's analysis
  stays current.

## Alternatives considered
- Copy GLUE Home's whole cache into the browser when a tab attaches: about 12,000 songs of files, most
  never looked at.
- Let the tab analyse as before: the work is done twice, and a tab that closes loses it.

## Consequences
- Overviews and song pages show what GLUE Home analysed, whether or not a tab was open at the time.
- A song page without GLUE Home's details waits for GLUE Home (up to about 90 seconds) instead of
  analysing in the browser.
