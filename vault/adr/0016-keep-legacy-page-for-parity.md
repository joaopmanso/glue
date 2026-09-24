---
status: accepted
date: 2026-09-24
---
# 0016. Keep the original Speklone page as the parity reference

## Context
M1 ported the single-file Speklone page into TypeScript modules and Svelte. The plan was to delete
`legacy/index.html` once parity passed. Two things changed: the user wants the original page to stay
live at joaopmanso.github.io/speklone, and the parity test (`tests/parity.test.ts`) is the cheapest
guard that later refactors don't silently change verdicts, tempo or key.

## Decision
Keep `legacy/index.html` in the repo, frozen. `tests/parity.test.ts` loads its pure code (everything
before its UI section) and compares parsing, verdicts, tempo and key with the new modules on the
fixtures, the example track and, when present on the machine, a real AIFF. The `joaopmanso/speklone`
repo serves a copy of this file.

When the new code is *meant* to diverge (an algorithm improvement), the parity test for that case is
changed on purpose in the same commit, with the reason in the changelog.

## Consequences
- Behaviour changes are always deliberate and visible in review.
- The file is ~2,800 lines of dead code for the app itself (not built or deployed with MCO).
