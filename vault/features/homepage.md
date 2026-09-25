---
status: shipped
milestone: GLUE Cloud
updated: 2026-09-25
adrs: [0002]
---
# Product homepage

## What it does
The first screen a visitor sees before any profile exists (`Homepage.svelte`, shown by
`Welcome.svelte` above the setup form `#get-started`). It shows the real app, not illustrations:
- Hero: "The GLUE between your DJ apps." with the glue-stick logo large beside it (glowing,
  bobbing gently), a one-paragraph lede, "Get started, free" (scrolls to
  the setup) and "Check one file first →" (`#/analyze`), the apps it reads, and a large looping
  clip of the library.
- Chapters 01–04, alternating sides: library, quality verdict (with a "wall at 17.1 kHz"
  callout), the playlist builder (clip), playlist insights.
- Two tiles: duplicates found by sound, the column value filter.
- 05 the track page with the live 3D view (clip); 06 GLUE Cloud with the device diagram and the
  cloud panel.

## Behaviour
- Soft fields of colour (GLUE yellow, orange, violet, pink, teal, blue) sit behind the sections
  and drift slowly, so the dark page isn't flat black; fainter, multiplied, in light mode.
- Sections fade and rise in as they scroll into view; headline words rise one by one; the hero
  frame tilts slightly with the pointer. All of it is off with `prefers-reduced-motion`.
- Clips are muted, looping H.264 mp4s with a webp poster, and only play while visible.

## Media
All media is generated, never from a real collection:
1. `node scripts/demo/make-audio.ts` synthesises 24 fictional tracks + 1 duplicate in several
   formats (FLAC, AIFF, MP3 320/128, AAC, a transcoded WAV, an upsampled 96 kHz file) and a
   rekordbox XML, into `scripts/demo/out/` (git-ignored). Needs ffmpeg.
2. `npm run build && npx vite preview --port 5175 --strictPort`, then
   `node scripts/demo/capture.ts` (`ONLY=library,clip-live` to redo some) drives headless Edge
   through the app and writes `public/home/*.webp|mp4` (about 3.4 MB in total).

Recapture after visible UI changes so the homepage doesn't show an old app.

## Limits & open questions
- The clips show the dark GLUE Stick theme in both site themes.
