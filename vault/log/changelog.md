---
updated: 2026-09-24
---
# Changelog

Newest first. Each entry: date, milestone, what changed, links.

## 2026-09-24 · M1 shipped
- Ported to **TypeScript 6 + Svelte 5 + Vite 8** ([ADR 0008](../adr/0008-typescript-svelte-vite.md)).
  TypeScript 7 (the Go compiler) isn't supported by svelte-check yet, hence 6.
- `src/core/`: analysis, parsers, clues, verdict, key notation, WAV writers, stem constants and the
  float64 patcher, logic unchanged apart from types. `src/workers/`: real module workers for analysis
  and stems (the old `Function.toString` worker would not survive minification).
- UI rebuilt as Svelte components; same look (the stylesheet carried over as `src/styles/app.css`),
  now branded MCO, "Analyze a file" mode.
- Bugs fixed while porting: analysis results could reach the wrong file when a second file was
  dropped mid-analysis (request ids + "latest wins"); stem Cancel during model load / audio prep was
  lost (per-run job ids); busy bar stuck after a superseded example; a quick pause/play could start a
  second play loop; ID3 UTF-16 text without a BOM lost its first character; "an WAV wrapper" wording.
- The stem model cache is shared with the legacy Speklone page (same origin): MCO reuses its copy
  instead of downloading 166 MB again.
- Tests: 34 Vitest (parsers on real ffmpeg-encoded fixtures, verdicts on synthetic signals, tempo/key,
  patcher, WAV round trips, **parity with the legacy page** incl. a real AIFF) and 7 Playwright tests
  in headless Edge (incl. real stem separation + cancel). `legacy/index.html` kept for parity
  ([ADR 0016](../adr/0016-keep-legacy-page-for-parity.md)).
- GitHub Actions: check + test + build + deploy to Pages on every push to `main`.

## 2026-09-24 · M0 shipped
- AI vault created: vision, roadmap, glossary, 19 feature docs, 15 ADRs, research notes.
- `CLAUDE.md` added as the agent entry point.
- MCO plan agreed: web-first local DJ collection manager; JSON files in `Documents/MCO`.
- Repo renamed `joaopmanso/speklone` → `joaopmanso/mco`; site now at https://joaopmanso.github.io/mco/.
  A new `joaopmanso/speklone` repo keeps the original Speklone page live at /speklone/ (frozen copy of
  `legacy/index.html`; briefly a redirect to /mco/ before the user asked to keep the old page).

## 2026-09-24 · Speklone
- Stem separation made fully client-side (WebGPU, model from Hugging Face + Cache Storage); local
  native engine removed. Deployed to GitHub Pages (joaopmanso/speklone).

## 2026-09-23 · Speklone
- First release and iterations: quality forensics, AIFF fix, MP4 audio-track fix, player, pause fix,
  live view, sidebar layout, start page, tempo & key, stem separation.
  See [2026-09-23-speklone.md](2026-09-23-speklone.md).
