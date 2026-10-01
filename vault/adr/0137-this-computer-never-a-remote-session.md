---
status: accepted
date: 2026-10-01
---
# 0137. This computer's browser is never a remote session, and isn't counted; the direct link isn't dropped on one slow answer

## Context
The user, 2026-10-01, analysing a network folder (limited to 4 at a time) and local folders on the desktop:
- **The desktop's GLUE page** kept saying "no direct link". After a reload it showed "linked directly" for a couple
  of seconds, then broke again.
- **The iPhone** couldn't connect ("Couldn't connect to Desktop (… Desktop local, public; failed)").
- **Stopping the analysis** fixed both at once.
- And: "local session that link directly don't count towards the max session limit, they will always have unlimited
  access to glue home. those limits are just for remote sessions."

What the code did:
- **A failed request to GLUE Home drops the link:** the page's link check (`localHome.check`) asked `/hello` with
  1.5 s to answer, and dropped the link if it didn't come.
  - The page sends everything to 127.0.0.1: the engine's status every 3 to 4 s, a long-held wait, files, covers,
    Overviews.
  - A browser keeps at most 6 connections to one address.
  - When GLUE Home's page answers slowly under the analysis, the check can wait in that queue past 1.5 s.
- **With the link down,** `remoteFiles.tend` treated this computer's GLUE Home as any other. It opened a remote
  session to it (ADR 0133), which counts against "Most at once" and fails under the same load.
- **GLUE Home counted every session,** this computer's own browser included.
- **Measured afterwards** (analysis stopped): GLUE Home's `/hello` answered in about 2 ms. The slowness is under the
  analysis only.

## Decision
- **The page never opens a remote session to this computer's own GLUE Home**: the one linked directly, or the one
  that's the companion of this browser. It's reached on 127.0.0.1 only.
- **GLUE Home lets its own computer's browser in always, and doesn't count it** (`sessions.ts` `admit`, `own`).
  "Most at once" counts other devices only.
- **The direct link is dropped only when GLUE Home doesn't answer twice:** `/hello` with 3 s, then 5 s.

## Alternatives considered
- **A longer single time-out:** a GLUE Home that really stopped would take longer to notice, and the browser's
  queue of 6 can hold a single request for longer anyway.

## Consequences
- The desktop's page keeps its direct link through a slow moment.
- **Not settled here:** why the analysis starves GLUE Home's answers and the phone's connection. Two causes fit:
  - 24 analyses on 16 processors leave too little for GLUE Home's own work;
  - every song's bytes pass through GLUE Home's main page, 4 MB at a time.

  To be measured with the analysis running, then decided in its own ADR.
