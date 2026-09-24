# MCO: Music Collection Organizer

Local-first web app for DJs: builds a music collection from folders and DJ-app libraries (Rekordbox,
Engine DJ, Traktor, Apple Music), analyses quality / BPM / key in the background, manages playlists,
shows and sessions, finds duplicates, and exports back to Rekordbox and Engine DJ. Grew out of
**Speklone** (spectral forensics: "is this hi-res actually hi-res?"), which becomes the per-track
Inspector and "Analyze a file" mode.

## The vault is the source of truth
Before working, read:
1. `vault/product/roadmap.md` (current milestone),
2. the feature file(s) in `vault/features/` you're touching,
3. the ADRs they link in `vault/adr/`.

After working:
- update the feature's `status` and notes, the roadmap if a milestone moved, and
  `vault/log/changelog.md` (dated entry);
- every new architectural decision gets a new ADR (`vault/adr/NNNN-slug.md`, from `_template.md`);
  never rewrite an accepted ADR, supersede it;
- research findings go in `vault/research/` with sources; mark unverified claims **[UNVERIFIED]**.

## Non-negotiables
- Client-only, no server, no accounts; audio never leaves the machine (ADR 0002).
- MCO's data is JSON files in the user's MCO folder, no database (ADR 0009).
- Never write into another app's library in v1 (ADR 0010).
- OS access only through `src/platform/` (ADR 0007).

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

## Current code (until M1 lands)
- `index.html`: the whole Speklone app (HTML + CSS + one script).
- `serve.mjs`: static preview server (`npm start` → http://localhost:5174).
