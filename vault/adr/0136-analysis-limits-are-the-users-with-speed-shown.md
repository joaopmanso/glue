---
status: accepted
date: 2026-10-01
---
# 0136. Analysis limits are the user's to set, with the speed shown and a suggestion from it

Supersedes 0135's fixed "4 at a time from each network folder"; the rest of 0135 stands.

## Context
The user, 2026-10-01, on ADR 0135's cap of 4 songs at a time per network folder (chosen from their own NAS): "you
shouldn't limit based on my NAS, leave the limit selectable and users will tune it. you can suggest based on current
performance / read / write. we can display some stats such as disk read / songs analysed per minute / etc on the
home app."

## Decision
- **"From each network folder at a time"** is a setting in GLUE Home's window, next to "Songs at a time": No limit
  (unless set), or 1 to 16 (`networkAtOnce`). `lanes.ts` `pickNext` takes it; 0 means no limit.
- **GLUE Home measures each song it analyses:** its size, how long reading it took, and how long analysing it took
  (`cache.analyse`).
- **Its window shows the speed** over the last two minutes (`home/ui/speed.ts` `speedOf`):
  - songs analysed a minute;
  - MB/s read from this computer's drives and from network folders;
  - a song's average time to read and to analyse.
- **A suggestion from those numbers** (`suggest`), only when one stands out (5 songs or more):
  - **reading network folders' songs takes over twice their analysis**, with no limit or one above 4: fewer at once
    from each network folder (try 4);
  - **analysing takes longer than reading**, with fewer at a time than processors: try as many as the processors;
  - **more than one and a half times as many as the processors:** that many may be as fast, and leave the computer
    freer.

## Alternatives considered
- **A cap tuned to one computer (0135):** right for the user's NAS, wrong for a faster one; and the user can't see
  why.
- **GLUE Home tuning itself while it runs** (trying more or fewer and keeping what's faster): it would never settle
  on a library that changes between folders, and it's opaque. The numbers and a plain suggestion leave the choice
  with the user.
- **The processor's load in the window:** not available to GLUE Home's page without a native addition. Reading
  against analysing time says the same for this purpose.

## Consequences
- By default, network folders' songs can again take all the places. The suggestion says so when that's the limit.
- The suggestion's thresholds (twice, 4, one and a half times) are rules of thumb, shown as suggestions.
