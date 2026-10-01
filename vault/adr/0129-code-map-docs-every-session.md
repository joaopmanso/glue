---
status: accepted
date: 2026-10-01
---
# 0129. Refresh the code map's docs in every session that changes them, without the skill; browse it on the site

Supersedes 0128's "the docs part after a batch, through `/graphify . --update`" and its "not the HTML view".

## Context
The user, 2026-10-01, on refreshing the graph's docs part only after a batch of ADRs: "it should be done every time
no? the vault needs to always be kept up to date, it is the source of truth for all that we do". They don't want
extra costs (no API key; 0128), and they asked to browse the graph without running anything locally.

- The vault itself is always current; it's read directly. What goes stale is the graph's view of it. A session that
  orients with `affected` would then miss a decision taken the session before.
- **Through the skill, a refresh costs about 60 KB of instructions per session** (the 41 KB skill, the update
  procedure and the extraction spec) before any doc is read.
- **The changelog and the handoff change in every session.** The changelog is long, so re-reading it would make
  every refresh expensive. The handoff is read whole at the start of each session anyway.
- graph.yml publishes the code part for every push. Without care, a run that started earlier could overwrite a docs
  refresh published after it.

## Decision
- **Every session that changes docs in the graph refreshes them before its commit** (CLAUDE.md, "After working"):
  1. `scripts/graph_docs.py prepare` lists the changed docs and writes one ready prompt per batch of 15,
     `graphify-out/.docs_NN.md`, built from `scripts/graph-extract.md`;
  2. one subagent per batch ("Follow the instructions in …") reads only those docs and writes `.docs_NN.json`;
  3. `scripts/graph_docs.py finish`:
     - mends what the subagents wrote: paths back to the files, ADR ids to their real slugs, stray keys;
     - fills the semantic cache;
     - updates the code part (`graphify update`);
     - merges, prunes deleted or newly ignored files, clusters and writes the report and the HTML;
     - saves the manifest, and publishes to the branch `graphify`.

  Docs whose batch failed stay unstamped and come back next time. Docs seen before (by content) come from the cache.
- **The graph ties code to decisions:**
  - every ADR's main node is labelled from its heading ("ADR 0124: …");
  - the code's "ADR 0124" comments, which graphify makes nodes of their own, get an edge to that ADR. This added
    about 450 edges, so `affected` on a file reaches the ADRs it cites, and an ADR's `explain` lists the code
    citing it.

  `scripts/graph_docs.py link` does this on the current graph. `finish` runs it, and graph.yml runs it after
  `graphify update`, which drops those edges for the files it re-reads.
- **The /graphify skill isn't used for refreshes;** it remains for a full rebuild only.
- **`vault/log/` is left out of the graph** (`.graphifyignore`): the changelog, the handoff and the archive.
- **graph.yml publishes with a lease.** If the branch moved since its fetch (a docs refresh), it fetches again and
  updates on top, up to three times.
- **The graph's interactive view is on the website** at https://joaopmanso.github.io/glue/graph/:
  - `graph.html` is published with the graph;
  - the site's deploy copies it from the branch.

  The repo is public, so the map shows nothing that isn't already there.

## Alternatives considered
- **The skill's `/graphify . --update` each session:** about 60 KB of instructions every time; that's the cost the
  graph exists to save.
- **A paid key for CI** (0128): the user doesn't want extra costs. Their Pro subscription's token in CI would share
  the allowance their own sessions use.
- **A separate Pages deployment for the graph:** a Pages site has one deployment; a second would replace the
  website.

## Consequences
- **Cost per refresh:** measured on the first one (7 docs, Sonnet), about 73k subagent tokens. Most of that is a
  subagent's own start-up, not the docs, so batches run on Haiku, the cheapest on the Pro allowance. Sessions that
  change only code or the log need none.
- **CI's graph and the site's view:** each push gets the latest docs refresh, and the code from that push. The
  site's view can lag one push when graph.yml is slower than the deploy.
- **The refresh runs before the commit.** That way the post-commit hook (code only) and the refresh never write the
  graph at once.
- **Upgrading graphify** may change the functions `graph_docs.py` calls (pinned at 0.9.73 in CI and in CLAUDE.md).
