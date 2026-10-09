---
status: accepted
date: 2026-10-09
---
# 0176. A streamed song's start timing in the console only

## Context
ADR 0174 and 0175 put a streamed song's start timing (a new connection or not, the first answer, the first music and
sound, the route) on the player: the tooltip of the line under the song's title on a computer, and a line under the
artist in the phone's player sheet. They served to find where a slow start's time went. With both ADRs in, the user
(2026-10-09): "it's working great … it's taking around 1 second to start now", and "that debug info on the player needs
to be hidden".

## Decision
- **Supersedes the display part of ADR 0174 and 0175:** the start's timing is no longer on either player (no tooltip,
  no line in the phone's sheet), nor in the help.
- It's still measured (`remoteFiles.lastStart`) and the console says it once the song plays (`GLUE: Started in …`), for
  when a start is slow again.

## Alternatives considered
- **Keep the computer's tooltip** (it shows only on hover): it's still diagnostic text in the player, and the console
  has the same line.
- **Remove the measuring too:** it costs nothing, and it's the quickest way to tell a connection's handshake from the
  relay or the first music when a start is slow again.

## Consequences
- The players show only what they did before ADR 0174.
- To diagnose a slow start: the browser's console (on an iPhone, Safari's Web Inspector from a Mac).
