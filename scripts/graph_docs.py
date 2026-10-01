"""Refresh the docs part of the code map (ADR 0129), without loading the /graphify skill. Run with graphify's Python:

  "$(cat graphify-out/.graphify_python)" scripts/graph_docs.py prepare
      Lists the docs changed since the last refresh (ADRs, features, SYSTEM.md, help…). For each batch it writes a
      prompt, graphify-out/.docs_NN.md: give a subagent "Follow the instructions in <that file>"; it writes
      graphify-out/.docs_NN.json.
  "$(cat graphify-out/.graphify_python)" scripts/graph_docs.py finish [--no-publish]
      Merges what the subagents wrote with the code (graphify update, no tokens), clusters, writes the report and
      the HTML view, saves the manifest and publishes to the branch graphify (scripts/graph.mjs).
  "$(cat graphify-out/.graphify_python)" scripts/graph_docs.py link
      Only the last part on the current graph: ADR labels, the code's ADR comments tied to the ADRs, clusters,
      report, HTML. CI runs it after graphify update, which drops those ties for the files it re-reads.

Unchanged docs are skipped by the manifest, and docs seen before by graphify's semantic cache (by content).
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'graphify-out'
# The prompt the semantic cache is stamped with: the first full pass used graphify's own spec.
SPEC = ROOT / '.claude' / 'skills' / 'graphify' / 'references' / 'extraction-spec.md'
PROMPT = ROOT / 'scripts' / 'graph-extract.md'
STATE = OUT / '.docs_state.json'
BATCH = 15
SEMANTIC = ('document', 'paper', 'image')
NODE_KEYS = {'id', 'label', 'file_type', 'source_file', 'source_location', 'source_url', 'captured_at', 'author',
             'contributor', 'rationale'}


def adr_files():
    return {p.name[:4]: p for p in (ROOT / 'vault' / 'adr').glob('[0-9][0-9][0-9][0-9]-*.md')}


def rel(f):
    return Path(f).resolve().relative_to(ROOT).as_posix()


def stem_id(path):
    return re.sub(r'[^a-z0-9]+', '_', Path(path).with_suffix('').as_posix().lower()).strip('_')


def prepare():
    from graphify.cache import check_semantic_cache
    from graphify.detect import detect_incremental

    r = detect_incremental(ROOT)
    docs = [f for t in SEMANTIC for f in r.get('new_files', {}).get(t, [])]
    cn, ce, ch, uncached = check_semantic_cache(docs, root=ROOT, prompt_file=SPEC)
    for old in OUT.glob('.docs_*'):
        old.unlink()
    batches = [uncached[i:i + BATCH] for i in range(0, len(uncached), BATCH)]
    corpus = {rel(f) for fl in r['files'].values() for f in fl}
    manifest = OUT / 'manifest.json'
    known = json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else {}
    gone = [k for k in known if k not in corpus]   # deleted, or left out since (.graphifyignore)
    STATE.write_text(json.dumps({'incremental': r, 'cached': {'nodes': cn, 'edges': ce, 'hyperedges': ch},
                                 'uncached': uncached, 'batches': len(batches), 'gone': gone}, ensure_ascii=False),
                     encoding='utf-8')
    template = PROMPT.read_text(encoding='utf-8')
    for i, batch in enumerate(batches, 1):
        prompt = template.replace('{{FILES}}', '\n'.join(f'- {rel(f)}' for f in batch))
        (OUT / f'.docs_{i:02d}.md').write_text(prompt.replace('{{OUT}}', str(OUT / f'.docs_{i:02d}.json')), encoding='utf-8')
    print(f'{len(docs)} changed docs: {len(docs) - len(uncached)} known from the cache, {len(uncached)} to read.')
    for i, batch in enumerate(batches, 1):
        print(f'  batch {i}: Follow the instructions in {OUT / f".docs_{i:02d}.md"}  ({", ".join(rel(f) for f in batch)})')
    if not batches:
        print('No subagents needed: run finish.')


def write(G, r):
    """Labels ADRs from their headings, ties the code's ADR comments to them, clusters, and writes graph.json, the
    report and the HTML view. Returns the communities."""
    from graphify.analyze import god_nodes, suggest_questions, surprising_connections
    from graphify.cluster import cluster, score_all
    from graphify.export import to_json
    from graphify.report import generate

    adrs = adr_files()
    refs = {}   # ADR number -> the code's comment nodes citing it (docref_adr_0124, or <file>_docref_adr_0124)
    for n in G.nodes:
        m = re.search(r'(?:^|_)docref_adr_(\d{4})$', n)
        if m:
            refs.setdefault(m.group(1), []).append(n)
    for p in adrs.values():   # "ADR 0124: No-file songs matched…", whatever label a merge kept
        i = stem_id(p.relative_to(ROOT)) + '_decision'
        if i in G:
            title = re.search(r'^# (.*)$', p.read_text(encoding='utf-8'), re.M).group(1)
            G.nodes[i]['label'] = f'ADR {p.name[:4]}: ' + re.sub(r'^\d{4}\.\s*', '', title)[:90]
            # The code's "ADR 0124" comments are nodes of their own: tie them to the ADR, so affected/explain
            # lead from code to its decisions and back.
            for ref in refs.get(p.name[:4], []):
                G.add_edge(ref, i, relation='references', confidence='EXTRACTED', confidence_score=1.0,
                           source_file=rel(p), source_location=None, weight=1.0)
    communities = cluster(G)
    cohesion = score_all(G, communities)
    # Each community is named after its most connected node, as graphify's own update does without an LLM.
    labels = {c: G.nodes[max(ids, key=G.degree)].get('label', str(c)) for c, ids in communities.items()}
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    questions = suggest_questions(G, communities, labels)
    to_json(G, communities, str(OUT / 'graph.json'), force=True, community_labels=labels)
    detection = {'files': r['files'], 'total_files': r.get('total_files', 0), 'total_words': r.get('total_words', 0)}
    (OUT / 'GRAPH_REPORT.md').write_text(generate(G, communities, cohesion, labels, gods, surprises, detection,
                                                  {'input': 0, 'output': 0}, '.', suggested_questions=questions),
                                         encoding='utf-8')
    (OUT / '.graphify_labels.json').write_text(json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False),
                                               encoding='utf-8')
    subprocess.run([sys.executable, '-m', 'graphify', 'export', 'html'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    return communities


def finish(publish):
    from graphify.build import build_merge
    from graphify.cache import save_semantic_cache
    from graphify.cli import _stamped_manifest_files
    from graphify.detect import save_manifest

    if not STATE.exists():
        sys.exit('Run prepare first.')
    st = json.loads(STATE.read_text(encoding='utf-8'))
    uncached = st['uncached']
    by_rel = {rel(f): f for f in uncached}
    by_name = {Path(f).name: f for f in uncached}
    adrs = adr_files()

    def source(s):   # back to the path the cache knows, whatever the subagent wrote
        s = str(s or '').replace('\\', '/')
        return by_rel.get(s) or by_name.get(s.rsplit('/', 1)[-1], s)

    def node_id(i):   # vault_adr_0124_decision (or a wrong slug) -> the ADR's real id
        m = re.fullmatch(r'vault_adr_(\d{4})(?:_[a-z0-9_]*)?_decision', i or '')
        return stem_id(adrs[m.group(1)].relative_to(ROOT)) + '_decision' if m and m.group(1) in adrs else i

    new = {'nodes': [], 'edges': [], 'hyperedges': []}
    failed = []
    for i in range(1, st['batches'] + 1):
        try:
            d = json.loads((OUT / f'.docs_{i:02d}.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            failed.append(i)
            continue
        for n in d.get('nodes', []):
            n = {k: v for k, v in n.items() if k in NODE_KEYS}
            n['id'], n['source_file'] = node_id(n['id']), source(n.get('source_file'))
            new['nodes'].append(n)
        for e in d.get('edges', []):
            e['source'], e['target'], e['source_file'] = node_id(e['source']), node_id(e['target']), source(e.get('source_file'))
            new['edges'].append(e)
        for h in d.get('hyperedges', []):
            h['nodes'], h['source_file'] = [node_id(x) for x in h.get('nodes', [])], source(h.get('source_file'))
            new['hyperedges'].append(h)
    save_semantic_cache(new['nodes'], new['edges'], new['hyperedges'], root=ROOT, allowed_source_files=uncached,
                        prompt_file=SPEC)

    # The code part first (tree-sitter, no tokens), so the graph below has both.
    subprocess.run([sys.executable, '-m', 'graphify', 'update', '.', '--no-cluster'], cwd=ROOT, check=True,
                   stdout=subprocess.DEVNULL)

    cached = st['cached']
    extraction = {k: cached[k] + new[k] for k in ('nodes', 'edges', 'hyperedges')}
    r = st['incremental']
    gone = st['gone']
    G = build_merge([extraction], graph_path=str(OUT / 'graph.json'), prune_sources=gone or None, root=ROOT,
                    directed=False)
    communities = write(G, r)

    # Docs whose batch failed stay unstamped, so the next prepare asks for them again.
    files = _stamped_manifest_files(r['files'], extraction, ROOT)
    stamped = {f for fl in files.values() for f in fl}
    cleared = set(uncached) - stamped
    save_manifest(files, root=ROOT, scan_corpus={f for fl in r['files'].values() for f in fl},
                  clear_semantic=cleared or None)
    for old in OUT.glob('.docs_*'):
        old.unlink()
    print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities; '
          f'{len(new["nodes"])} nodes from {len(uncached)} docs read, {len(gone)} files pruned.')
    if failed or cleared:
        print(f'Not merged (asked for again next time): batches {failed}, {sorted(rel(f) for f in cleared)}')
    if publish:
        subprocess.run(['node', 'scripts/graph.mjs', 'publish'], cwd=ROOT, check=True)


def link():
    from graphify.build import build_merge
    from graphify.detect import detect_incremental

    G = build_merge([{'nodes': [], 'edges': [], 'hyperedges': []}], graph_path=str(OUT / 'graph.json'), root=ROOT,
                    directed=False)
    communities = write(G, detect_incremental(ROOT))
    print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities.')


if __name__ == '__main__':
    os.chdir(ROOT)   # graphify's manifest and cache paths are relative to the scan root
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'prepare':
        prepare()
    elif cmd == 'link':
        link()
    elif cmd == 'finish':
        finish('--no-publish' not in sys.argv)
    else:
        sys.exit(__doc__)
