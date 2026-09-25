---
status: in-progress
milestone: M2
updated: 2026-09-25
adrs: [0028]
---
# Themes

## What it does
Choose how GLUE looks: a theme (colours, fonts, shape) and dark, light or match-the-system mode.

## Behaviour
- "Who's using GLUE?" › Appearance: four themes with live previews (Classic, Studio, Riso, Moss) and a
  Dark / Light / Match system switch. The header's sun/moon button flips dark and light anywhere.
- Remembered in the browser and in the GLUE folder ([ADR 0028](../adr/0028-themes.md)).

## Open
- The user tries Studio, Riso and Moss and picks the new default.

## GLUE Stick (2026-09-25)
- A fifth theme at the user's request: glue-stick yellow (#ffd100) on black, like the classic
  UHU stick; light mode uses a darker gold (#b58500) on cream so accent text stays readable.
  Heavy Archivo titles, 10 px corners.
- **The default theme** since 2026-09-25 (user's choice). Classic stays available on the profile
  screen. A browser that already picked a theme keeps it.
- The logo takes the theme's accent for the tube (so it's yellow here). Its glue is always cream
  and its band always dark, so it reads in every theme. The browser-tab icon is the yellow stick.
