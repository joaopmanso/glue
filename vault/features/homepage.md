---
status: shipped
milestone: GLUE Cloud
updated: 2026-10-01
adrs: [0002, 0126]
---
# Product homepage

## Now
Rewritten 2026-10-01 (ADR 0126, batch 3): shorter, current, introduced by Gluey, with media recaptured from the
current app. It's the first screen a visitor sees before any profile exists (`Homepage.svelte`, shown by
`Welcome.svelte` above the setup form `#get-started`).

## What it does
- **Hero:**
  - "The GLUE between your DJ apps.", with Gluey waving ("Hi, I'm Gluey! I'll show you around.");
  - a one-paragraph lede;
  - "Get started, free" (scrolls to the setup), "Check one file first →" (`#/analyze`) and "How it works"
    (`#/help/getting-started`);
  - the apps it reads, and the looping library clip.
- **How it starts,** three steps: where GLUE keeps its data → your music and DJ libraries → GLUE Home if you like. A
  "What you need" line: Chrome or Edge on a computer, the phone through the account, GLUE Home for Windows and macOS
  (this computer's highlighted).
- **01 One library from every DJ app** (the playlist and its insights).
- **02 Know what you really have** (the verdict; duplicates and No file linked beside it).
- **03 Ready for the gig** (Prepare; the builder clip and the calendar beside it).
- **04 Every device. Your music stays yours** (the phone), with the GLUE Cloud sign-in panel.
- Each chapter has "More in the help →". The end is Gluey cheering, with "Get started" and "Help".
- A chapter's pictures are all full size, side by side to scroll through (`Slides.svelte`: arrows, dots, a caption,
  swipe, ← →), the next peeking in.

## Behaviour
- Soft fields of colour drift behind the sections (fainter, multiplied, in light mode).
- Sections fade and rise in as they scroll into view; the headline's words rise one by one; the hero frame tilts
  with the pointer. All of it is off with `prefers-reduced-motion`.
- Clips are muted, looping H.264 mp4s with a webp poster, and only play while visible.

## Media
All media is generated, never from a real collection (about 1.9 MB):
1. `node scripts/demo/make-audio.ts` synthesises 24 fictional tracks, a duplicate and a rekordbox XML into
   `scripts/demo/out/` (git-ignored). The XML includes three records of "removed duplicates" (files that aren't
   there), for No file linked. Needs ffmpeg.
2. `npm run build && npx vite preview --port 5175 --strictPort`, then `node scripts/demo/capture.ts`
   (`ONLY=relink,prepare` to redo some). It drives headless Edge through the app (Gluey hidden and quiet) and writes
   `public/home/`: relink, insights, clip-library, quality, clip-builder, duplicates, prepare, calendar, phone.

Recapture after visible UI changes, so the homepage doesn't show an old app.

## Limits & open questions
- The pictures show the dark GLUE Stick theme in both site themes.
