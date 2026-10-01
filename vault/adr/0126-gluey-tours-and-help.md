---
status: accepted
date: 2026-10-01
---
# 0126. Gluey: a first tour once per person, a tour per feature, and help; seen kept across the account and the GLUE folder

## Context
The user, 2026-10-01: GLUE has many features, and several aren't obvious. They asked for:
- a tutorial for first-time users, shown on the first login, "not the first login on each device";
- a way to run it again, e.g. from "Who's using GLUE?";
- a knowledge base split by feature, with any one tutorial runnable on its own;
- a Clippy-style guide, drawn as the glue stick: Gluey;
- a new homepage.

Their choices:
- a short first tour that ends with offers of deeper ones;
- afterwards, a help button and one tip the first time each feature is opened, which can be turned off;
- a searchable help panel, and the same articles as a page (`#/help`);
- a shorter, current homepage with fresh media.

## Decision
- **Gluey** (`src/ui/guide/Gluey.svelte`) is the logo's glue stick with a face and arms, in four poses (wave,
  point, think, cheer), in the theme's colours. He bobs and blinks, except under reduced motion.
- **Tours are data** (`src/core/guide/tours.ts`):
  - each stop names a part of the UI by `data-guide="…"` (stable, apart from test ids);
  - each stop can open a page first (a route, a library view, the first song) and can be optional;
  - a test checks that every target exists in the UI.

  `GuideLayer.svelte` runs them: the page dimmed with a spotlight on the target, and Gluey's bubble with Back, Next,
  Skip and dots. Esc and the arrow keys work.
- **The first tour** (`welcome`, 8 stops; `welcome-phone`, 4 stops, on the phone) starts by itself on the
  person's first login, once the library is on screen.
  - **Seen** is kept in three places, and the union of them is the truth (`core/guide/state.ts` `mergeGuide`):
    - the browser (pref `guide`);
    - the GLUE folder (`mco.json` `guide`: every browser on the computer, including through GLUE Home);
    - the account (D1 `users.guide`, migration 0011; `/v1/me` returns it; `PATCH /v1/me/guide` merges it, never
      replaces it).
  - Whatever was seen anywhere counts everywhere, so a second device or a phone never shows it again.
  - Finishing or skipping either first tour counts as both.
- **People from before Gluey** (a collection or an account from before 2026-10-01) get an offer instead ("New: I'm
  Gluey… Show me / No thanks"). "No thanks" counts as seen.
- **Running a tour again:** "Who's using GLUE?" has a Gluey card with "Take the tour again", and Gluey's corner
  button opens his panel of tours.
- **Tests** never meet the first tour by itself (`e2e/launch.ts` sets `__glueNoGuide` unless `guide: true`).
- **Next (later batches):** the help centre (Markdown articles per feature, search, "Show me", `#/help`), a tour per
  feature, tips the first time a feature's view opens (kept in `guide.tips`, off with `quiet`), and the new homepage.

## Consequences
- A new user is shown around once, whichever device they start on.
- A renamed UI part fails a unit test until its tour is updated.
