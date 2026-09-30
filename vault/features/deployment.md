---
status: shipped
milestone: Speklone
updated: 2026-09-30
adrs: [0002]
---
# Deployment

## What it does
Publishes the app as a static site on GitHub Pages.

## Current state (2026-09-25)
- Repository **`joaopmanso/glue`** (public; renamed from `speklone` in 2026-09, [ADR 0035](../adr/0035-rename-to-glue.md)). Account joaopmanso /
  joao.pedro.manso@gmail.com. Commits use the no-reply address
  `66416655+joaopmanso@users.noreply.github.com`, set **locally** in the repo (the machine's global git
  identity is a work account and must not be used here).
- Live: **https://joaopmanso.github.io/glue/**. Same origin as before, so browser data (folder
  permissions, IndexedDB, settings) carried over.
- **One repository, `joaopmanso/glue`.** The old name's forwarding repo (`joaopmanso/mco`, which sent /mco/…
  addresses to /glue/) was retired on 2026-09-30 at the user's request; old /mco/ links no longer forward. The
  local remote is `https://github.com/joaopmanso/glue.git` (lowercase: a capitalised URL made every push say
  "This repository moved").
- **`joaopmanso/speklone`** is now a separate repo that serves the **original Speklone page**
  (a frozen copy of `legacy/index.html`) at https://joaopmanso.github.io/speklone/, at the user's
  request (2026-09-24); its `404.html` sends unknown paths to it. Because it reuses the old name,
  GitHub's automatic git redirect from `speklone` no longer applies. Changes to GLUE don't reach it; update it only by
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

## GLUE Home builds faster: the Rust build cache (2026-09-26)
- Asked by the user: GLUE Home's workflow took about 10 minutes.
- Measured on the 0.6.0 release: Windows 7 min (6.5 min compiling), macOS 5 min (5.1 min compiling,
  both chips). The npm install was cached; Rust wasn't, so all ~400 crates were compiled each time.
- **Now:** `Swatinem/rust-cache` for `home/src-tauri`, one cache per OS.
  - Only builds on `main` save it; release tags read it (GitHub keeps a tag's cache private to that
    tag).
  - The release optimisation (LTO, one codegen unit) stays, so the last step still takes a while.
- **Measured** on GLUE Home 0.7.0 (2026-09-26), the release build reading the cache `main` had just
  filled:

  | Job | Before (cold) | With the cache |
  |---|---|---|
  | Windows | 7.9 min (compiling 6.6) | 3.9 min (compiling 2.6) |
  | macOS | 6.5 min (compiling 5.8) | 4.6 min (compiling 4.0) |

  A release now takes about 4.5 minutes, from about 8. macOS gains less: it compiles for both chips,
  and the final optimised compile of GLUE Home itself isn't cached.
- Further options, not done: a lighter check (no LTO) on `main`, since only tags publish, and one
  build per commit instead of both `main` and the tag.

## Tauri's npm and Rust packages move together (2026-09-27)
- `tauri build` refuses different major.minor versions of a Tauri npm package and its crate
  (`@tauri-apps/api` and `tauri`, each plugin and its crate). A new plugin's npm package can pull a
  newer `@tauri-apps/api` than crates.io's `tauri`: pin them (`~2.11.1`) and check with a local
  `npx tauri build --no-bundle` in `home/` before tagging.

## GLUE Home: one build per change (2026-09-30)
- The user: "Home app always triggers two different builds, one for main and one for the home-xx tag… they take
  almost 6 min each". A push to main built it, then the tag built it again.
- Now `home.yml` runs on pushes to main only. When the version in `tauri.conf.json` has no release yet, the same
  build creates the tag and the release (`gh release create --target`), and `latest.json` follows. Releasing is
  bumping the version; no tag is pushed.
