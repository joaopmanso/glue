---
status: shipped
milestone: Speklone
updated: 2026-09-24
adrs: [0002]
---
# Deployment

## What it does
Publishes the app as a static site on GitHub Pages.

## Current state
- Repository `joaopmanso/speklone` (public, account joaopmanso / joao.pedro.manso@gmail.com). Commits
  use the no-reply address `66416655+joaopmanso@users.noreply.github.com`, set **locally** in the repo
  (the machine's global git identity is a work account and must not be used here).
- Pages serves `main` / root (legacy build). Live: https://joaopmanso.github.io/speklone/.
- `backup.html` in the working folder is the user's own file and is git-ignored on purpose.
- No GitHub CLI on the machine; the API is used with the token Git Credential Manager holds for
  `joaopmanso` (never printed).

## Planned (M0/M1)
- Rename the repo to `mco` → https://joaopmanso.github.io/mco/; a small `speklone` repo redirects the
  old address.
- M1: GitHub Actions builds with Vite and deploys to Pages (build type "workflow").
