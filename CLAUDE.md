# GLUE: Global Library Unified Exporter

The name is always written **GLUE**, in capitals, everywhere people can see it (the theme is
"GLUE Stick", the headline "The GLUE between…"); the user asked for this on 2026-09-25.

Internal identifiers use the prefix `mco` (`mco.json`, `mco-backup.json`, IndexedDB `mco`, prefs `mco.*`, picker
ids `mco-home`…): keep them, existing data folders, backups and settings depend on them.
Repo `joaopmanso/glue`, live at https://joaopmanso.github.io/glue/.

Local-first web app for DJs: builds a music collection from folders and DJ-app libraries (Rekordbox,
Engine DJ, Traktor, Apple Music), analyses quality / BPM / key in the background, manages playlists,
shows and sessions, finds duplicates, and exports back to Rekordbox and Engine DJ. Grew out of
**Speklone** (spectral forensics: "is this hi-res actually hi-res?"), which becomes the per-track
Inspector and "Analyze a file" mode.

## The vault is the source of truth
Before working, read only:
1. `vault/SYSTEM.md`: how GLUE works now (about 13 KB);
2. `vault/log/handoff.md`: the current state, what's waiting on the user, what's next;
3. `vault/product/roadmap.md` if the work belongs to a milestone.

Then look things up, don't read in bulk:
- the "Now" section of the feature file(s) you're touching (`vault/features/`), and the dated sections
  below it only for the part you change;
- an ADR only when you need why something is the way it is: `grep -l` `vault/adr/` for the term. Don't
  read the ADR index, the changelog or the archive whole.

After working:
- update `vault/SYSTEM.md` in the same commit when how GLUE works changed (it must stay true);
- update the feature's "Now" and `status`, the roadmap if a milestone moved, and
  `vault/log/changelog.md` (dated entry; entries older than about two weeks move to
  `vault/log/archive/`);
- rewrite `vault/log/handoff.md` at the end of a session (state, waiting on the user, next);
- every new architectural decision gets a new ADR (`vault/adr/NNNN-slug.md`, from `_template.md`);
  never rewrite an accepted ADR, supersede it;
- research findings go in `vault/research/` with sources; mark unverified claims **[UNVERIFIED]**.

## Non-negotiables
- No GLUE server that sees your music: the website works on its own, accounts are optional, and audio
  goes only between the user's own computers (ADR 0002, 0036, 0037). GLUE Home is the user's own
  program on their own computer; when it runs, the website uses it as its disk and engine over the
  local link (ADR 0051).
- GLUE's data is JSON files in the user's GLUE folder, no database (ADR 0009).
- Never write into another app's library in v1 (ADR 0010).
- OS access only through `src/platform/` (ADR 0007): the browser's handles, or GLUE Home's disk in
  Home mode (ADR 0051).
- One writer of the GLUE folder at a time: a tab in Home mode writes only while it holds GLUE Home's
  lease; GLUE Home writes only while no lease is held (ADR 0051).

## Repo & deploy
- GitHub: `joaopmanso` account (joao.pedro.manso@gmail.com). This repo's git identity is set locally
  to `joaopmanso <66416655+joaopmanso@users.noreply.github.com>`; the machine's global identity is a
  work account and must not be used here.
- No GitHub CLI installed; use the GitHub API with the token Git Credential Manager holds for
  `joaopmanso` (`printf "protocol=https\nhost=github.com\nusername=joaopmanso\n\n" | git credential fill`),
  never print it.
- `backup.html` is the user's own file: git-ignored, don't touch.
- Testing in headless Edge: only close test browsers you started (match the scratch profile path);
  never kill all `msedge.exe`.

## Code
- TypeScript 6 + Svelte 5 + Vite 8. `npm run dev` · `npm run check` · `npm test` · `npx playwright test`
  (uses the installed Edge) · `STEMS=1 npx playwright test e2e/stems.spec.ts` (slow).
- E2E: two projects in `playwright.config.ts`. `heavy` holds the multi-browser and GLUE Home tests (by
  file, or tagged `@heavy`), two at a time; `e2e` holds the rest, fully parallel. Browsers come from
  `e2e/launch.ts` (no GPU process, pages see two cores). `FFMPEG` is ffmpeg's path: don't set it to 1,
  or the ffmpeg tests skip themselves. Per-test times land in `test-results/durations.json`. While
  working, `npx playwright test --only-changed`; the full suite before each deploy.
- `src/core/` pure logic (no DOM): `audio/`, `formats/`, `stems/`, `interop/` (DJ-library parsers),
  `library/` (scan, tags, path matching, analysis summary) · `src/store/` JSON store (home, collection,
  merge of imports/scans, migrations) · `src/platform/` folder access + IndexedDB handles ·
  `src/workers/` module workers · `src/lib/` state + orchestration (`library.svelte.ts` library,
  `pool.ts` background analysis, `app.svelte.ts` analyze-a-file, `player`, `stems`, `route`, `view`) ·
  `src/ui/` components (`ui/library/` for the library) + canvas renderers.
- `cloud/`: the GLUE Cloud Worker (API, D1 migrations, signaling Durable Object). Tests in
  `tests/cloud.test.ts`; deploy via `.github/workflows/cloud.yml`. Cloud credentials: GitHub secrets,
  never in the repo.
- `home/`: GLUE Home, a Tauri 2 tray app (ADR 0044). `home/src-tauri` Rust (tray, settings file,
  incoming-folder writes, autostart, `gluehome://`,
  `local.rs`: the local link on 127.0.0.1:47400–47409, ADR 0048), `home/ui` its settings and hidden service pages.
  The desktop (JMansoPC) has Rust and runs GLUE Home, so it can build and test it locally; the laptop has
  no Rust. `.github/workflows/home.yml` builds Windows + macOS on every change; a tag
  `home-v<version>` (version in `home/src-tauri/tauri.conf.json`) publishes the release the website
  links to. `npm run home:ui` / `home:dev`; tests drive `home/ui` with `e2e/tauri-mock.ts`.
- Routes: `#/` library, `#/track/<id>` track page, `#/events` calendar (`#/events/<id>` an event),
  `#/analyze` analyze a file, `#/admin`.
- GLUE Home updates are signed: private key = GitHub secret `TAURI_SIGNING_PRIVATE_KEY` (copy in
  `%USERPROFILE%\.glue-secrets\glue-home-updater.key`), public key in `tauri.conf.json`. Never print it.
- E2E library tests use a temporary persistent browser profile and fake the folder pickers with OPFS
  folders (`e2e/library.spec.ts`); Playwright's default contexts crash when reading a stored handle.
- `legacy/index.html`: original Speklone page, frozen; `tests/parity.test.ts` compares against it
  (ADR 0016). Change a parity expectation only on purpose, with a changelog note.
- Push to `main` = checks, tests, build and deploy to https://joaopmanso.github.io/glue/.
