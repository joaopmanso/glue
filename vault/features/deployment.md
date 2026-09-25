---
status: shipped
milestone: Speklone
updated: 2026-09-24
adrs: [0002]
---
# Deployment

## What it does
Publishes the app as a static site on GitHub Pages.

## Current state (2026-09-25)
- Repository **`joaopmanso/glue`** (public; `speklone` → `mco` on 2026-09-24, `mco` → `glue` on
  2026-09-25 with the rename to GLUE, [ADR 0035](../adr/0035-rename-to-glue.md)). Account joaopmanso /
  joao.pedro.manso@gmail.com. Commits use the no-reply address
  `66416655+joaopmanso@users.noreply.github.com`, set **locally** in the repo (the machine's global git
  identity is a work account and must not be used here).
- Live: **https://joaopmanso.github.io/glue/**. Same origin as before, so browser data (folder
  permissions, IndexedDB, settings) carried over.
- **`joaopmanso/mco`** is a new tiny repo whose Pages site forwards every /mco/… address (with its
  `#/…` route) to /glue/. Recreating the old name ends GitHub's git redirect; the local remote points
  at `glue`.
- **`joaopmanso/speklone`** is now a separate repo that serves the **original Speklone page**
  (a frozen copy of `legacy/index.html`) at https://joaopmanso.github.io/speklone/, at the user's
  request (2026-09-24); its `404.html` sends unknown paths to it. It briefly forwarded to /mco/ first.
  Because it reuses the old name, GitHub's automatic git redirect from `speklone` to `mco` no longer
  applies; the local remote points at `glue` directly. Changes to GLUE don't reach it; update it only by
  re-uploading `legacy/index.html` on purpose.
- `backup.html` in the working folder is the user's own file and is git-ignored on purpose.
- No GitHub CLI on the machine; the API is used with the token Git Credential Manager holds for
  `joaopmanso` (never printed).

## Build & deploy (since M1)
- `.github/workflows/deploy.yml`: on push to `main` → `npm ci`, `npm run check`, `npm test`,
  `npm run build`, upload `dist/`, deploy to Pages (Pages build type "workflow").
- Vite `base: '/glue/'`. Local preview: `npm run build && npm run preview` → http://localhost:5174/glue/.
- Playwright browser tests run locally against the preview server with the installed Edge
  (`npx playwright test`); not in CI yet.
