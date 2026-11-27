---
status: accepted
date: 2026-11-27
---
# 0205. Bring the incoming song in on its drop; let the bass be cut or opened over part of a song; select several songs

## Context
- **The user (2026-11-27), after ADR 0204:**
  - "we need to take account as to where the music drops when mixing, looking to the initial part of the song sometimes
    doesn't match on the drop";
  - "we likely want to never have a song stay for over 4 bars with the bass cut while the others intro still has 16 bars
    to go";
  - "I should be able to choose multiple clips, cut and open the bass on parts of the track, not just the full track";
  - "clicking without scrolling or moving the mouse for a bit should grab a track and allow me to move it around".
- **What the planner did (ADR 0200):**
  - each song came in on its first downbeat;
  - a 32-bar bass swap changed hands on its middle bar, wherever the incoming song's intro ended.
  - So with a 32-bar intro, the outgoing song lost its bass 16 bars before the incoming one's arrived.
- **What it knew of drops:**
  - only the loudness curve (2 s steps).
  - A house intro with a kick is often as loud as its drop, so where the bassline comes in didn't show.
  - The Prepare waveform has the lows (< 200 Hz) at 150 points a second, kept in the cache.
- **The bass by hand:** ADR 0203 let a hand-over's bass be chosen as a whole, and its swap point moved. It didn't cover
  part of a song outside a hand-over.

## Decision
- **Drops from the lows** (`plan.ts`):
  - `bassBars` gives each bar's 30th percentile of the waveform's lows, as a share of the song's.
    - A kick alone falls away between the beats; a bassline holds the lows up.
    - The waveform's curve (255·x^0.75) is undone first.
  - A bar has its bassline at 0.45 of the song's level or more.
  - `introOf`: the first bar where the bassline comes in and holds (3 of the next 4 bars). Without a waveform, it's the
    first bar where the loudness holds within 3 dB of the song's loud level for 8 s.
  - `dropsOf`: where the bassline comes back after at least 4 bars mostly without it. Without a waveform, the loudness
    rule as before. The double drops (ADR 0201) use it.
  - **[UNVERIFIED]** On real songs: the thresholds are from synthetic tests. The user's listening decides.
- **The incoming song comes in on its drop:**
  - its in-point is chosen so its first drop lands where the bass changes hands:
    - a bass swap's middle;
    - a blend's end;
    - straight to the drop on a cut;
  - with a shorter intro, it comes in from its first downbeat, and the bass changes hands on its drop (`fx.swap`, set by
    the planner);
  - the outgoing song's mix-out is placed as before (phrases, before its outro).
  - **So the outgoing song never plays without its bass while the incoming one is still in its intro.**
  - **A layer** (3 decks): the bass changes hands 16 bars before the end, or on the incoming song's drop when that comes
    later.
  - **Before planning a new set,** the songs' waveforms are made where the cache has none ("Finding the drops"). A set
    planned before keeps its plan until it's planned again.
- **A bass swap and a layer turn on the swap point** (`automation.ts`): the incoming song fades in up to it, the
  outgoing one out after it.
  - Before, only the lows moved with a swap point moved by hand; the volumes stayed on the middle bar.
  - Choosing Auto again keeps the swap point.
- **The bass by hand over part of a song:**
  - `SetItem.lows`: spans `{from, to, on}` in beats from the song's start, cut (`on` false) or opened (true), over
    whatever its hand-overs do there;
  - `controlsAt` applies them last;
  - `edit.ts`: `setLows` (whole bars, over any span there, neighbours that agree joined) and `clearLows`;
  - trimming a song's start keeps its spans, and the incoming hand-over's swap and drop, where they play.
  - **On the timeline:**
    - a selected song has a **bass** strip along its foot. Dragged across, it cuts the bass over those bars, or opens
      it where it was cut;
    - stretches are drawn hatched red (cut) or orange (opened);
    - the song's box lists them, and a click lets one go.
- **Several songs selected:**
  - Shift or Ctrl + click adds a song or takes it out;
  - dragging any of them moves them together (`moveSongs`), and the others stay where they are;
  - their box sets level and key lock, and brings them in earlier or later.
- **Press and hold:** pressing on a song not selected and holding still for 350 ms selects it and grabs it to drag. It's
  drawn lifted.
- **The Rust mixer** (`crates/glue-sets`, ADR 0204) follows: `LowSpan`, the swap point as the pivot, the spans in
  `controls_at`.
  - The new golden case `layer-swap-lows` and spans in `layer-double-bass` hold it to the TypeScript.
  - GLUE Home 0.85.

## Alternatives considered
- **A drop from the loudness curve only:** misses intros with a kick as loud as the drop, the case the user heard.
- **A new low-band curve in the analysis** (both engines, a new `ANALYSIS_VERSION`, the collection analysed again): the
  Prepare waveform already has the lows, and it's cached.
- **Moving the swap point to the drop and keeping B's in-point at its first downbeat:** the swap would land wherever the
  intro ends, not on the outgoing song's phrase, and a long intro would make a long hand-over.
- **A multi-select that ripples like a single drag:** it would be the same as selecting the first song alone.

## Consequences
- A set planned again may bring songs in later in their intro: shorter intros, drops that line up.
- An older GLUE Home (0.84) mixing a plan with `lows` ignores them (serde skips unknown fields), and turns a moved bass
  swap on its middle bar. It updates itself to 0.85.
- `tests/golden/sets` is regenerated; `tests/sets.test.ts` covers drops from the lows, the in-point on the drop, the
  spans, the trims and the group moves.
