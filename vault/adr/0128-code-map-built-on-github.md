---
status: accepted
date: 2026-10-01
---
# 0128. Build the code map on GitHub for every push, and use it by fixed rules

Supersedes 0127's "built per computer, not committed" and its hooks; the rest of 0127 stands.

## Context
The user, 2026-10-01, the same day as 0127:
- They shared the rules colleagues use with graphify:
  - orient with `affected` / `god-nodes` / `explain` / `path`;
  - never `query` with natural language;
  - never load the skill to answer a question;
  - use distinctive labels;
  - refresh by hand with `update . --no-cluster`;
  - the order is the vault first, graphify to find the files, the source last.

  The user asked that GLUE follow a similar approach where it makes sense.
- They also asked for graphify to run on GitHub Actions, so sessions don't depend on a local build ("there may be
  some instances where that is not possible").

Measured on GLUE's graph:
- `affected "relink.ts" --depth 2` is about 750 bytes, and finds the ADR 0124 and SYSTEM.md sections as well as the
  code. A broad `query` returned a 400-node dump of unrelated matches.
- `engine.ts` matches four files; `shared/engine.ts` resolves.
- A code-only `graphify update .` on a fresh clone, on top of the last graph, takes about 25 s with no API key, and
  keeps the docs part (the vault's nodes) from the last semantic pass.
- graphify's own Claude Code hook fired on every Bash call and Read with "MANDATORY: run graphify query", which
  contradicts the rules above. Its skill's description ("use for any question about a codebase") would load the
  41 KB skill to answer questions.

## Decision
- **CI builds the code part** (`.github/workflows/graph.yml`, every push to `main`):
  1. install `graphifyy[sql]==0.9.73`;
  2. fetch the last published graph (its docs part and caches);
  3. `graphify update . --force` (tree-sitter, no tokens);
  4. publish to the branch **`graphify`**.

  The branch holds one commit, replaced each time: `graph.json`, `GRAPH_REPORT.md`, the manifest, the labels and the
  caches. It has no history to grow, and no other workflow runs on it.
- **`scripts/graph.mjs`** (`fetch` / `publish`) moves the graph between `graphify-out/` and the
  branch with git alone, through a private index. The repo's index and working tree are never touched.
- **The docs part** still comes from a semantic pass by a Claude Code session (`/graphify . --update`; tokens), then
  `node scripts/graph.mjs publish`. CI has no LLM key. With one (an Anthropic key, or Claude Code's token for Actions) it could
  run `graphify extract` itself; that's the user's call, since it bills per push.
- **Claude Code hooks** (`.claude/settings.json`):
  - a session-start hook fetches CI's graph when the computer has none;
  - a one-line nudge appears before Grep and Glob only, worded as the rules. graphify's own hook is removed.
- **Usage rules** in CLAUDE.md, the colleagues' adapted:
  - before planning, `affected --depth 2` gives the starting list of files;
  - `god-nodes` for the hubs;
  - `explain` and `path`;
  - distinctive labels;
  - never `query`;
  - never the skill to answer questions; its description now says so.

  The colleagues' note on a multi-repo union graph doesn't apply: GLUE is one repo.
- Local git hooks stay where installed (the desktop); they keep the local graph current between pushes.

## Alternatives considered
- **Commit `graph.json` to `main`:** a changed 5 MB graph in every commit, and a rebuild loop with the hooks.
- **A workflow artifact or a release asset:** artifacts expire and need a token to download, and a release per push
  clutters the releases the website links to. A branch is fetched with plain git.
- **The semantic pass in CI now:** needs a paid key per push. Deferred to the user.

## Consequences
- Any checkout of the repo can get a current code map in seconds, with git alone. Querying it still needs the
  `graphify` CLI (Python; uv or pipx).
- **The docs part is as fresh as the last `node scripts/graph.mjs publish` after a semantic pass.** New ADRs or articles aren't in
  CI's graph until then.
- `--force` in CI lets the graph shrink when code is deleted; the docs part isn't affected.
- A skill update (`graphify install`) would overwrite the corrected skill description: put it back.
