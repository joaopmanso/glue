---
status: shipped
milestone: Speklone
updated: 2026-09-24
adrs: [0002]
---
# Deployment

## What it does
Publishes the app as a static site on GitHub Pages.

## Current state (2026-09-24)
- Repository **`joaopmanso/mco`** (public; renamed from `speklone` on 2026-09-24). Account joaopmanso /
  joao.pedro.manso@gmail.com. Commits use the no-reply address
  `66416655+joaopmanso@users.noreply.github.com`, set **locally** in the repo (the machine's global git
  identity is a work account and must not be used here).
- Pages serves `main` / root (legacy build). Live: **https://joaopmanso.github.io/mco/**.
- **`joaopmanso/speklone`** is now a separate two-file repo (`index.html`, `404.html`) whose Pages site
  forwards https://joaopmanso.github.io/speklone/ (keeping `#hash`) to /mco/. Because it reuses the old
  name, GitHub's automatic git redirect from `speklone` to `mco` no longer applies; the local remote
  points at `mco` directly.
- `backup.html` in the working folder is the user's own file and is git-ignored on purpose.
- No GitHub CLI on the machine; the API is used with the token Git Credential Manager holds for
  `joaopmanso` (never printed).

## Planned (M1)
- GitHub Actions builds with Vite and deploys to Pages (Pages build type switches to "workflow").
- Vite `base: '/mco/'`.
