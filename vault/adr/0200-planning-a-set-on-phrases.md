---
status: accepted
date: 2026-11-27
---
# 0200. Plan a set's hand-overs on phrases, in the set's style

## Context
- A set (ADR 0199) needs every hand-over placed before anything can be heard or exported.
- The user wants three automix styles: one song at a time, continuous mixing, double drops.
- **What's known of each song:**
  - its BPM and beat grid (the user's, the main DJ library's, or placed by GLUE);
  - its length;
  - its loudness every ~2 s (the sound profile, ADR 0197);
  - its key.

## Decision
`planSet` (`src/core/sets/plan.ts`), in the playlist's order:
- **Phrases are 16 bars** from a song's first downbeat. A song comes in on its first downbeat.
- **The outgoing song hands over on the last phrase that leaves room for the hand-over:**
  - before its outro: after the last moment within 6 dB of its loud level (its 90th percentile), letting the hand-over
    run half into the outro;
  - after at least its incoming hand-over plus 16 bars;
  - shorter hand-overs (16, 8, 4 bars) when the song is short.
- **Styles:**
  - *One at a time:* an 8-bar blend.
  - *Continuous:* a 32-bar bass swap (the bass swapped on the middle bar).
  - *Double drops:*
    - the incoming song's first drop (loudness rising 6 dB within ~6 s to near its loud level, on a bar) lands on the
      latest of the outgoing song's drops that fits;
    - both at full from there, the outgoing song's bass cut, the outgoing song fading over its last 8 beats, 16 bars
      after the drop;
    - only when their tempos are within 6 % and their keys fit (`keyFit` ≥ 0.5); otherwise a bass swap.
  - **Tempos more than 8 % apart:** a cut on the phrase, the tempo jumping to the new song's.
- **Decks** take turns (2 or 3 lanes).
- **Trim:** each song towards the set's median loudness, ±6 dB.
- **The plan is kept on the playlist.** It's planned again when its songs change or the style, decks, tempo or key lock
  do. A hand-over's style chosen by hand is kept until then.

## Alternatives considered
- **Hand-overs at a fixed time before the end:** off the phrase, often in the middle of a vocal or a drop.
- **Searching every pair of mix points for the best energy match:** worth it later. Phrases from the grid plus the
  outro rule give the hand-overs a DJ would pick most of the time, and the user can move them (S3).

## Consequences
- Songs without a sound profile have no outro or drops: they hand over on the last phrase that fits before their end,
  and never double drop.
- A wrong grid gives a hand-over off the beat. Such songs are marked "grid guessed", to fix in Prepare.
