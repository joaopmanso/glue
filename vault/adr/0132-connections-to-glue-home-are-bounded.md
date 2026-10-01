---
status: accepted; "at most 20 being set up at once" superseded by 0133 (sessions: at most "Most at once")
date: 2026-10-01
---
# 0132. Connections to GLUE Home are bounded: abandoned set-ups let go, failures said, reconnects paced

## Context
The user, 2026-10-01, a few hours after ADR 0131 went live:
- **On the laptop:** no waveform showed, and playing a song failed: "Couldn't connect to Desktop, even through the
  relay (this device: local, public, relay; Desktop: no addresses; new)".
- **On the iPhone:** songs streamed, but a song's page said "Desktop: The connection closed".

What happened:
- GLUE Home's service page makes an `RTCPeerConnection` for each offer (`home/ui/service.ts`). It let one go only
  when it reached "failed" or "closed", or when the other side said "bye".
- The website never said "bye" when it gave up on a connection that didn't open (`connectHome`'s time-out).
- A connection whose candidates never came stays "new" for good. Each failed attempt therefore left one behind.
- A Chromium page can hold 500 (measured: "Cannot create so many PeerConnections" at the 501st). After that, every
  offer threw inside `onSignal`. GLUE Home answered nobody new ("Desktop: no addresses; new"), and a device whose
  link closed couldn't make a new one.
- **ADR 0131 made it come sooner.** Rows on screen asked again every 1 to 15 s when they couldn't reach the other
  computer. Each ask after a failed connection started a new one, about one every 20 s while a screen waited.

## Decision
- **GLUE Home (0.40.2):**
  - a connection not open within 30 s is let go;
  - at most 20 are being set up at once: the oldest go first;
  - an offer it can't take is answered with "bye" and why, and noted in its activity, never left unanswered;
  - "bye" also forgets candidates that were waiting.
- **The website:**
  - a connection given up before it opened says "bye", so GLUE Home lets its side go at once;
  - after a failed connection to a GLUE Home, background asks (row thumbnails, waveforms, covers) wait 5, 10,
    20… up to 60 s before connecting again;
  - what the user asked for (playing, a song's page) tries at once.

## Alternatives considered
- **Only the website's "bye":** a device that's closed, crashed or offline never sends it. GLUE Home has to bound
  its own side.
- **Only GLUE Home's limits:** rows asking again would still make a connection every few seconds while it's down,
  for nothing.

## Consequences
- A GLUE Home that can't be reached costs a waiting screen at most one connection every minute, and GLUE Home
  holds at most 20 half-made ones.
- A GLUE Home already at the limit needs a restart: Stop and Start in its window, or quitting it, or the update
  to 0.40.2.
