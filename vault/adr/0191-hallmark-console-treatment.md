---
status: accepted
date: 2026-11-01
---
# 0191. Give every theme Hallmark's Console treatment: the colours kept, the type and surfaces made one system

## Context
The user (2026-11-01): "I want to use the hallmark github repo to have a more unique and professional looking design …
the best one fits our feature set. remember that we want to keep the color scheme and have minimal ui changes as we
are already very user friendly." Then "go for it".

Hallmark is a design skill with 50 themes and a linter (`sloplint`) for the defaults generated UIs fall into. It was
run on GLUE as an **app screen** at **restyle** depth: layout, routes, words and wiring kept, the system changed.
Of its themes, **Console** fits best:
- a near-black ground in three steps with one amber-yellow signal, which is GLUE Stick's palette already;
- a measured face (a mono) only for what an instrument measured, which is most of what GLUE shows (BPM, key, kHz,
  times);
- hairline panels and 10 px corners, as GLUE Stick has.

Rim (square, orange) and Ultraviolet (violet, lowercase) would have changed the colours or the shape. The audit before
(`.hallmark/before.txt`, not in git): 281 Floor failures.

## Decision
- **Colours:** every theme keeps its own (ADR 0028). Console lends type, surfaces, labels and controls.
- **Type** (GLUE Stick and Classic):
  - Archivo heavy stays for titles and the wordmark;
  - Host Grotesk for reading;
  - Atkinson Hyperlegible Mono only for what was measured or written by the system (`--font-outlier`).
  - Studio, Riso and Moss keep their faces.
- **Labels:** sentence case, untracked, in the body face: no tracked capitals anywhere, no mono label.
- **Shared tokens** in the theme table, where literals were:
  - `--stage` (the ground, deeper: never pure black), `--on-stage*`, `--stage-glass`, `--stage-line`;
  - `--scrim`, `--shadow-pop` (the one shadow a floating layer has), `--bad-ink`;
  - in `app.css`: `--brand-*` (the logo and Gluey) and `--field-*` (the homepage's colour fields).
- **Rules** that now hold across the website:
  - disabled controls change fill, ink and cursor, not opacity alone;
  - progress bars and Gluey's bubble move by transform, never width or left;
  - `overflow-x: clip` on the page, and no `100vw` widths;
  - no emoji as icons: `Icon.svelte`, a few line icons;
  - no middle-dot meta strings: `Parts.svelte` parts them with hairlines, the words kept;
  - no dashes in copy: ranges say "to";
  - no eyebrows: the homepage's and "Now playing";
  - the homepage's scroll reveal removed (Console keeps still).
- **Not changed:** the layout, the colours, the words (except where a Floor rule named them), every id, handler and
  test hook (`sloplint --kept`: 40/40 links, 4/4 fields, 518/518 handlers, 4/4 test hooks, 17/17 headings).

## Alternatives considered
- **A full Hallmark redesign:** new compositions per screen. The user asked for minimal UI changes.
- **Console's own palette:** its graphite and amber are close but not GLUE's. The user asked to keep the colours.
- **Console's medium-weight titles:** GLUE Stick's identity is the heavy grotesque, so it stays for titles.

## Consequences
- **A new component** uses the tokens (`--stage`, `--scrim`, `--shadow-pop`), `Icon`, `Parts`, and sentence-case
  labels. Literal colours belong in the theme table.
- **Tests** that read a meta line check its parts (`.parts > span`), not a dotted string.
- **Left open:**
  - `sloplint` still reports two sticky bars in different screens (TrackSheet's close button and Duplicates' bar,
    never on screen together);
  - accent words in headings are the brand's (the GLUE initials, "actually").
- **The homepage's screenshots and clips** were captured again with the new look (`scripts/demo/capture.ts`).
