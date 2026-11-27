---
status: accepted
date: 2026-11-27
---
# 0203. Whose bass plays in a hand-over: chosen, and where it changes hands, moved

## Context
- **The user, on sets (ADR 0199–0202):** "the ability to choose which song has full bass going on, perhaps even choosing
  more than one to be on at the same time for maximum double bass effect".
- **They chose:** per hand-over, plus a swap point dragged on the timeline.
- **What the styles do with the bass:**
  - bass swap, layer and double drop hand it over at a point;
  - blend, filter and echo keep both;
  - a cut switches at its end.

## Decision
- **The model:** `SetItem.fx.bass`:
  - `auto`: the style's;
  - `out`: the outgoing song's all through, the incoming one's held back;
  - `in`: the reverse;
  - `both`: double bass.
- **`SetItem.fx.swap`:** beats into the hand-over where the bass changes hands, on a bar line. It applies when `bass` is
  auto, in any style.
- **The rule** (`automation.ts` `handOver`): the style's controls first, then only the lows overridden. Volumes stay
  the style's; two basses at full are handled by the equal-power headroom (ADR 0201).
- **`bassSwapAt(fx, len)`:** the swap as moved, else the style's own point, else none. It places the marker.
- **The hand-over's box:** a Bass row (Auto, Outgoing, Incoming, Both). Auto also forgets a moved swap point.
- **The timeline:** the open hand-over shows an orange "bass" marker and a dashed line where the bass changes hands.
  Dragging it moves the swap a bar at a time and sets the choice back to Auto.

## Consequences
- Plans made before keep the style's bass (`bass` and `swap` absent).
- A blend, filter or echo has no marker until its bass is given to one side. "Both" is what it already does.
