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
- when docs in the code map changed (ADRs, features, `SYSTEM.md`, product, research, help, README, CLAUDE.md),
  refresh it before the commit (ADR 0129): `"$(cat graphify-out/.graphify_python)" scripts/graph_docs.py prepare`,
  one subagent per batch it lists (model haiku: "Follow the instructions in <file>"), then
  `… scripts/graph_docs.py finish` (it publishes). Not through the skill.

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
  `e2e/launch.ts` (no GPU process, pages see two cores; any other launch takes its `EDGE_ARGS`: Edge's tabs kept out of
  Windows' Alt+Tab). `FFMPEG` is ffmpeg's path: don't set it to 1,
  or the ffmpeg tests skip themselves. Per-test times land in `test-results/durations.json`. While
  working, `npx playwright test --only-changed`; the full suite before each deploy.
- `src/core/` pure logic (no DOM): `audio/`, `formats/`, `stems/`, `interop/` (DJ-library parsers),
  `library/` (scan, tags, path matching, analysis summary) · `src/store/` JSON store (home, collection,
  merge of imports/scans, migrations) · `src/platform/` folder access + IndexedDB handles ·
  `src/workers/` module workers · `src/lib/` state + orchestration (`library.svelte.ts` the library's state, its methods by concern in
  `lib/library/*.ts`, ADR 0146;
  `pool.ts` background analysis, `app.svelte.ts` analyze-a-file, `player`, `stems`, `route`, `view`) ·
  `src/ui/` components (`ui/library/` for the library) + canvas renderers.
- `cloud/`: the GLUE Cloud Worker (API, D1 migrations, signaling Durable Object). Tests in
  `tests/cloud.test.ts`; deploy via `.github/workflows/cloud.yml`. Cloud credentials: GitHub secrets,
  never in the repo.
- `home/`: GLUE Home, a Tauri 2 tray app (ADR 0044). `home/src-tauri` Rust (tray, settings file,
  incoming-folder writes, autostart, `gluehome://`,
  `local.rs`: the local link on 127.0.0.1:47400–47409, ADR 0048), `home/ui` its settings window and drag dock (its service is the engine's, ADR 0160).
  Both computers build and test it: the desktop (JMansoPC) runs GLUE Home; on the laptop Rust lives in `C:\Work\rust`
  (`CARGO_HOME`, `RUSTUP_HOME`; its policy blocks programs under `%USERPROFILE%\.cargo`), so a Bash session first runs
  `export RUSTUP_HOME=/c/Work/rust/rustup CARGO_HOME=/c/Work/rust/cargo PATH="/c/Work/rust/cargo/bin:$PATH"`.
  `.github/workflows/home.yml` builds Windows + macOS on every push to `main` that
  touches it; when the version in `home/src-tauri/tauri.conf.json` (also `Cargo.toml`, `Cargo.lock`) has no release
  yet, that build publishes it (tag `home-v<version>`, the release the website links to). Don't push tags. `npm run home:ui` / `home:dev`; tests drive `home/ui` with `e2e/tauri-mock.ts` (the engine the real one, run by `e2e/fakeHome.ts`; the connections to other devices stood in for by `e2e/home-rtc.ts`, in GLUE Home's background page `__e2e/home.html`, served from `.e2e-home/`).
- `crates/glue-audio`: the native analysis engine (ADR 0147), a line-for-line Rust port of `src/core`'s analysis with
  JavaScript's numbers (`src/js.rs`). `cargo test --manifest-path crates/glue-audio/Cargo.toml` compares it with the
  TypeScript's results in `tests/golden` (regenerate with `GOLDEN=1 npx vitest run tests/golden.test.ts` after changing
  the JavaScript analysis, then port the change). `scripts/jsmath.mjs` checks the maths against V8.
- `crates/glue-store`: the library store in Rust (ADR 0152), held byte for byte to `src/store/collection.ts` by
  `tests/golden/store` (regenerate with `GOLDEN=1 npx vitest run tests/store.golden.test.ts` after changing the store,
  then port the change). `cargo test --manifest-path crates/glue-store/Cargo.toml`.
- `crates/glue-engine`: GLUE Home's library engine (ADR 0153, 0154): the local link's `/rpc`, the stores, jobs, repair
  and the analysis queue; `home/src-tauri/src/engine.rs` hosts it in GLUE Home, its binary `glue-engine-test` in the e2e
  tests (`e2e/fakeHome.ts` runs it; Playwright's global setup `e2e/engine-build.ts` builds it, so the e2e tests need
  cargo). It reads real files: an e2e test's GLUE Home songs and GLUE folder go on disk (`e2e/homeDisk.ts`). Its shared
  sync (ADR 0155) is held to `src/store/shared/engine.ts` by `tests/golden/sync` (regenerate with
  `GOLDEN=1 npx vitest run tests/sync.golden.test.ts` after changing the sync, then port the change).
- `crates/glue-rtc`: GLUE Home's connections to other devices (ADR 0150), webrtc-rs speaking the website's protocol
  (src/core/transfer.ts). `cargo test --manifest-path crates/glue-rtc/Cargo.toml`; against Edge:
  `cargo build --release --example probe --manifest-path crates/glue-rtc/Cargo.toml && node scripts/rtc-probe.mjs`.
- Routes: `#/` library (`#/<view>` on a view: `#/duplicates`, `#/playlist/<id>`…, `viewHash`), `#/track/<id>` a song's page (a sheet over the library), `#/events` calendar (`#/events/<id>` an event),
  `#/analyze` analyze a file, `#/help` help (`#/help/<article>`), `#/admin`.
- Gluey (ADR 0126): when a feature changes, update its help article (`src/help/*.md`) and its tour
  (`src/core/guide/tours.ts`, pointing at `data-guide` attributes; `tests/guide.test.ts` checks they exist).
- GLUE Home updates are signed: private key = GitHub secret `TAURI_SIGNING_PRIVATE_KEY` (copy in
  `%USERPROFILE%\.glue-secrets\glue-home-updater.key`), public key in `tauri.conf.json`. Never print it.
- E2E library tests use a temporary persistent browser profile and fake the folder pickers with OPFS
  folders (`e2e/library.spec.ts`); Playwright's default contexts crash when reading a stored handle.
- `legacy/index.html`: original Speklone page, frozen; `tests/parity.test.ts` compares against it
  (ADR 0016). Change a parity expectation only on purpose, with a changelog note.
- Push to `main` = checks, tests, build and deploy to https://joaopmanso.github.io/glue/.

## graphify: the code map (ADR 0127, 0128)
`graphify-out/graph.json` maps the code (tree-sitter: files, symbols, imports, calls, the SQL migrations) and the
vault and help (ADRs, features, articles). **The order stays: the vault first (how and why), graphify to find the
files, the source last.** A lookup costs about 100–1,500 tokens and gives `file:line`, against reading files one by
one.
- **Before planning a change:** `graphify affected "<symbol or file>" --depth 2` shows what depends on it, the
  related ADRs and SYSTEM.md sections included. Use it as the starting list of files for the plan.
- `graphify god-nodes --top 10`: the hubs (`Library`, `Track`, `CollectionStore`, `HomeStore`…). A change on
  one gets extra care.
- `graphify explain "<symbol>"` (a node and its neighbours) · `graphify path "<A>" "<B>"` (how two connect).
- **Labels must be distinctive:** `shared/engine.ts`, not `engine.ts` (four files have that name). "No unique node
  match" means qualify it.
- **Never `graphify query "<natural language>"`:** a keyword-seeded search that returns a padded node dump of
  thousands of tokens. A targeted grep beats it.
- **Never load the `/graphify` skill to answer a question** (41 KB): it's for building the graph.
- **Freshness:**
  - CI publishes the graph for every push to `main` (branch `graphify`, `.github/workflows/graph.yml`); its
    interactive view is at https://joaopmanso.github.io/glue/graph/;
  - git hooks rebuild the code part locally after each commit where `graphify hook install` was run;
  - stale after uncommitted edits: `graphify update . --no-cluster`;
  - docs: every session that changes them refreshes them (above, "After working"). `vault/log/` isn't in the graph.
- **No graph on this computer?** A session-start hook fetches CI's (`node scripts/graph.mjs fetch`, git only). No `graphify`
  CLI? `uv tool install "graphifyy[sql]==0.9.73"` (or `pipx install`). If neither works, work as before.
