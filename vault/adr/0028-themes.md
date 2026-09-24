---
status: accepted
date: 2026-09-24
---
# 0028. Themes: one token table, dark and light for each

## Context
The user finds the single look functional but generic ("AI like") and wants themes, chosen on the
"Who's using MCO?" screen, each with dark and light modes, more distinctive colours and fonts, while
staying professional. They'll try them and pick a new default (2026-09-24).

## Decision
- `src/lib/themes.svelte.ts` holds every theme: colour tokens (the same ones the app already uses:
  ground, surface, raised, lines, inks, accent, ok/warn/bad) for dark and light, a display / body /
  mono font trio, corner radius, title weight and tracking. The CSS for all themes is generated from
  that table into one `<style>`; the theme is `data-theme` + `data-mode` on `<html>`.
- Themes: **Classic** (the original, now with a light mode; Archivo + JetBrains Mono), **Studio**
  (walnut / paper and brass; Fraunces + Hanken Grotesk + IBM Plex Mono), **Riso** (risograph pink on
  navy or paper; Bricolage Grotesque + DM Mono), **Moss** (forest and stone greens; Instrument Serif +
  Geist + Geist Mono). Each new theme also has a small signature (Studio's italic logo and small-caps
  labels, Riso's printed offset shadows, Moss's italic serif logo and pill buttons).
- Fonts come from Google Fonts, loaded only for the active theme (and all of them while the picker
  is open, for the previews).
- Mode: dark, light or match the system; also a sun/moon button in the header.
- The choice is stored in the browser (`mco.theme`, `mco.mode`) and in `mco.json` (`appearance`), so
  the MCO folder opens with the same look elsewhere.
- Data displays keep their black plot areas and spectrogram palettes in light mode (as audio tools do);
  axes, labels and chrome follow the theme. Canvases redraw on a theme change (`themes.version`).

## Consequences
- A new theme is one entry in the table (plus optional signature CSS).
- Classic stays the default until the user picks another; changing the default is one line.
