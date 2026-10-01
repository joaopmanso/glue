---
status: shipped
milestone: GLUE Cloud
updated: 2026-10-01
adrs: [0126]
---
# Gluey: tours and help

## Now
- **Batch 1 (shipped 2026-10-01):**
  - Gluey, and his first tour on a person's first login (8 stops; 4 on the phone);
  - seen once per person, across the browser, the GLUE folder and the account;
  - an offer instead of a tour for people from before him;
  - "Take the tour again" in "Who's using GLUE?", and his corner button with the tours.
- **Batch 2 (shipped 2026-10-01):**
  - the help centre: 18 articles in `src/help/*.md`, searchable, in Gluey's panel and at `#/help` (also "Help" in
    the top bar, the phone's More, and GLUE Home's window);
  - a tour per feature ("Show me");
  - a tip the first time Duplicates, No file linked, Lower quality, Browse, the Calendar or Prepare opens (once per
    person), off with "Gluey's tips".
- **Batch 3 (shipped 2026-10-01):** the new homepage, introduced by Gluey, with fresh media (`homepage.md`).

## What it does
The first time someone uses GLUE, Gluey, the glue stick, walks them through the library in a minute:
- the views;
- adding music;
- the analysis;
- a song's page;
- playlists;
- devices;
- where help is.

He never does it again on another device. His button (bottom right) runs any tour again.

## How it works
- `src/help/*.md` (front matter: title, summary, keywords, tour, order) → `src/lib/help.ts` (bundled with
  `import.meta.glob`) → `src/core/guide/markdown.ts` (an escaping renderer and search) → `HelpBody.svelte`
  (Gluey's panel and `HelpPage.svelte` at `#/help`). Tips: `src/core/guide/tips.ts`, `guide.showTip`.
- `src/core/guide/tours.ts` (the tours as data), `src/core/guide/state.ts` (what's seen, merged as a union).
- `src/lib/guide.svelte.ts`: runs tours, syncs "seen" with the GLUE folder (`HomeStore.setGuide`) and the account
  (`account.addGuide`, `PATCH /v1/me/guide`).
- `src/ui/guide/Gluey.svelte`, `GuideLayer.svelte` (mounted in `App.svelte`); `data-guide` anchors in the sidebar,
  the analysis bar, the track page's tabs, the account button, and the phone's library and tabs.

## Tests
- `tests/guide.test.ts`: the merge, and every tour target being in the UI. `tests/cloud.test.ts`: `/v1/me` guide and
  the union merge.
- `e2e/guide.spec.ts`:
  - the first tour once, through every stop;
  - again from the panel and "Who's using GLUE?";
  - the offer for an old library;
  - the phone's tour;
  - an account that saw it elsewhere shows none;
  - every feature tour run from its article, each stop on its target;
  - tips once, and none when off;
  - `#/help` before any setup, links between articles.
