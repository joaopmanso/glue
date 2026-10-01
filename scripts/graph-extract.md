You extract a knowledge-graph fragment from GLUE's docs for graphify (ADR 0129). Work in G:\Coding\GLUE.

Read EVERY file below, fully:
{{FILES}}

Then write ONE JSON object with the Write tool (no scripts, no other files) to:
{{OUT}}
and reply only "done N nodes, M edges".

## The JSON
{"nodes":[...],"edges":[...],"hyperedges":[...],"input_tokens":0,"output_tokens":0}
- node: {"id","label","file_type","source_file","source_location":null,"source_url":null,"captured_at":null,"author":null,"contributor":null}
  and optionally "rationale" (why it was decided: trade-offs, intent). No other keys.
- edge: {"source","target","relation","confidence","confidence_score","source_file","source_location":null,"weight":1.0}
- hyperedge (at most 3 per file set, only for 3+ nodes forming one flow): {"id","label","nodes":[ids],"relation":"participate_in|implement|form","confidence","confidence_score","source_file"}
- `source_file`: the file's path EXACTLY as listed above (repo-relative, forward slashes).

## What to extract
- Named concepts, mechanisms, decisions, features. Keep a decision's reasons as the `rationale` attribute of
  its node; never a separate node for a reason. `file_type` is one of: document, rationale (ideas, principles,
  mechanisms), concept, code, paper, image.
- Main node per file: an ADR `vault/adr/0124-no-file-songs-matched-and-linked.md` → `vault_adr_0124_no_file_songs_matched_and_linked_decision`;
  a feature `vault/features/guide.md` → `vault_features_guide_feature`; a help article `src/help/duplicates.md` →
  `src_help_duplicates_article`. Label an ADR's main node "ADR 0124: <its title>". Other files: `{stem}_{entity}`.
- An ADR cited by number ("ADR 0051", "supersedes 0118") → a `cites` edge to `vault_adr_00NN_decision`
  (the slug is filled in afterwards).
- A code file named in a doc (`src/lib/relink.svelte.ts`) → a `references` edge to that file's stem id
  (`src_lib_relink_svelte`), EXTRACTED.
- A help article's `tour:` front matter → a `references` edge to `src_core_guide_tours_tour_<id>`.
- `semantically_similar_to` (INFERRED) only for genuinely non-obvious cross-file similarity.

## IDs
Lowercase `[a-z0-9_]` only. `{stem}_{entity}`: stem = the repo-relative path without its extension, every
non-alphanumeric run → `_`; entity normalised the same way. Deterministic from the label; no suffixes.

## Edges
- relation: references, cites, implements, conceptually_related_to, shares_data_with, semantically_similar_to,
  rationale_for, calls.
- confidence EXTRACTED (stated in the text) → confidence_score 1.0. INFERRED → exactly one of 0.95, 0.85, 0.75,
  0.65, 0.55. AMBIGUOUS → 0.1–0.3. Never 0.5.
