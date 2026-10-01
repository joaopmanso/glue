---
status: accepted
date: 2026-10-01
---
# 0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer

## Context
The user, 2026-10-01: "I want to improve your performance and reduce even more the context needed for tasks", with
[graphify](https://github.com/Graphify-Labs/graphify) (PyPI `graphifyy`).

- GLUE has about 570 source and doc files and 126 ADRs. Most of a session's context goes on finding things: grep
  output, reading whole files to learn what imports what.
- The vault (`SYSTEM.md`, the handoff, features, ADRs) already says how GLUE works and why. What a session lacks is
  a cheap answer to "where is this, and what does it touch?".
- graphify builds a graph from the repo:
  - code through tree-sitter (local, free): files, symbols, imports, calls;
  - docs through one semantic pass by the coding agent's subagents (tokens, once; cached by file hash afterwards).
  It answers `explain`, `path` and `query` with a small subgraph instead of whole files.

The user chose:
- install uv and graphify;
- code and the vault in the graph;
- the hooks as a nudge, not a block.

## Decision
- **graphify is a developer tool, outside GLUE.** It isn't a dependency of the website, GLUE Home or GLUE Cloud.
  It's installed per computer with `uv tool install graphifyy`.
- **What the graph covers:**
  - all code (TS, Svelte, Rust, JSON config);
  - the vault (ADRs, features, log, product, research), `src/help/*.md`, the README and CLAUDE.md;
  - `.graphifyignore` leaves out: `legacy/`, `public/`, test fixtures, the demo output, lock files, images and
    video, `vault/log/archive/`, `.claude/`.
- **Built per computer, not committed:**
  - `graphify-out/` is git-ignored;
  - a `post-commit` / `post-checkout` hook (`graphify hook install`) rebuilds the code part after each commit;
  - docs change the graph only through `/graphify . --update`.

  Committing `graph.json` (11 MB with the caches) would add a changed graph to every commit and need a merge driver.
- **Claude Code integration (in git):**
  - `.claude/skills/graphify/` is the skill;
  - `.claude/settings.json` holds PreToolUse hooks that remind a session to ask the graph before Grep/Read. They do
    nothing when graphify isn't installed;
  - CLAUDE.md's "graphify" section says how to use it. The vault stays the source of truth for how and why; the
    graph is for where.

## Alternatives considered
- **Code only (AST, no tokens):** free, but the ADRs and features are where a session spends context deciding what
  to read. One semantic pass (about 570k subagent tokens) is cheap next to that.
- **Strict hooks** (block Grep/Read until the graph was asked): too rigid when a session already knows the file and
  line.
- **Commit `graph.json`:** the laptop would get the doc graph without a pass, but every commit would carry the
  rebuilt graph. Copying `graphify-out/` once is simpler (handoff).

## Consequences
- Sessions on the desktop can orient with `graphify explain` / `path` before reading. Broad `query` questions return
  noise; name a file or symbol.
- **The doc part goes stale between `--update` runs.** New ADRs and help articles reach the graph only then. The
  code part is current after each commit.
- **Known gaps:**
  - `.sql` migrations aren't parsed (`tree_sitter_sql` missing: `uv tool install "graphifyy[sql]"` adds it);
  - 68 Svelte files are parsed only partly;
  - ADR 0056 produced nothing in the first pass and stays queued for the next update.
- **The laptop needs** uv, graphify and a graph (handoff). Until then the hooks do nothing.
- `graphify hook install` also adds a merge-driver line to `.gitattributes`. It isn't needed, since `graph.json` isn't
  committed; remove it after installing.
