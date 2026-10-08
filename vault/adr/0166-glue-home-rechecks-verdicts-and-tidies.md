---
status: accepted
date: 2026-10-08
---
# 0166. GLUE Home makes old verdicts again and repairs a collection when it opens

## Context
ADR 0162 stopped the page doing library work while GLUE Home runs. Two jobs the page did when a collection opened were
left with nobody doing them:
- **the verdict re-check** (`recheckVerdicts`): a rule change bumps `VERDICT_VERSION`, and stored verdicts a newer rule
  may change (suspect, bad, "Genuine hi-res") are judged again from the details kept, never the file;
- **the open-time repairs**: songs naming an import that's gone lose it, and one that was only that import's record goes
  (`tidyTracks`); songs without a file whose file is in the collection fold into the song that has it (`matchTracks`);
  in a shared collection, this computer's song that's the same file as another computer's song joins it
  (`copiesToJoin`, `joinCopies`, ADR 0130), on open and after a sync brings songs.

## Decision
- **GLUE Home does both, in Rust:**
  - `glue_audio::recheck` decodes the stored details (`d/…`, the header and the raw block) and runs the verdict and the
    summary on them. Held to the website by `tests/golden/<file>/recheck.json`.
  - The engine's `verdicts.rs` picks the verdicts due, as the page did, checks that the details are of the file as it
    is now (size, date), and puts the new verdicts in as one edit. The date of the analysis and the fingerprint stay as
    they were. One event says how many changed.
  - `glue_store::tidy` ports `tidyTracks`, `matchTracks` (the links), `copiesToJoin`, `joinCopies` and `addCopy` line
    for line. The store goldens `tidy` and `join` hold it to the website byte for byte.
  - The engine's `repairs.rs` runs them and saves the result as its own edit. More than 10 songs to join get a backup
    first (`backups/pre-join-copies-…zip`), as on the page.
- **When:** once per collection per run, when the analysis queue first looks at the collection, and only while no tab
  holds the lease. A tab that's the writer does them itself. The join runs again after a sync brings songs.
- **The page with GLUE Home** does neither (ADR 0162, unchanged).

## Alternatives considered
- **An RPC the page calls on open:** the page would still decide when library work happens, and the work would wait
  for a tab. With GLUE Home as the app, it runs whether or not a tab is open.
- **Re-analysing the songs whose verdicts are old:** it reads every file again, minutes of work for what the stored
  details answer in milliseconds.

## Consequences
- With GLUE Home running, a rule change reaches the library without a tab, and the "Lower quality" view follows.
- `core/audio/verdict.ts`, `library/summary.ts`, `store/details.ts` and their Rust change together. So do
  `store/merge.ts`'s repairs, `core/library/match.ts` and `glue_store::tidy` (`GOLDEN=1 npx vitest run
  tests/golden.test.ts tests/store.golden.test.ts`, then the port).
