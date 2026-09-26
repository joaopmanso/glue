/* The playlists as the sidebar shows them (ADR 0062), for pickers such as "Add to playlist": in the
   sidebar's order with their depth, the user's own first, then each import's tree on its own (its
   playlists are replaced when it's imported again). Lists the sidebar can't reach (their folder is
   gone) are left out, as there. */
import type { List } from '../../store/types';

export interface ListEntry { list: List; depth: number }
export interface ListTree { own: ListEntry[]; imports: { top: List; entries: ListEntry[] }[] }

/** `skip`: lists never offered (TO BE SORTED), with everything inside them. */
export function listTree(lists: Iterable<List>, skip: (l: List) => boolean = () => false): ListTree {
  const children = new Map<string | null, List[]>();
  for (const l of lists) { const k = l.parentId ?? null; const a = children.get(k); if (a) a.push(l); else children.set(k, [l]); }
  for (const a of children.values()) a.sort((x, y) => x.position - y.position || x.name.localeCompare(y.name));
  const walk = (l: List, depth: number, out: ListEntry[], seen: Set<string>) => {
    if (seen.has(l.id) || skip(l)) return;
    seen.add(l.id);
    out.push({ list: l, depth });
    for (const c of children.get(l.id) ?? []) walk(c, depth + 1, out, seen);
  };
  const tree: ListTree = { own: [], imports: [] }, seen = new Set<string>();
  for (const top of children.get(null) ?? []) {
    if (top.origin) { const entries: ListEntry[] = []; walk(top, 0, entries, seen); if (entries.length) tree.imports.push({ top, entries }); }
    else walk(top, 0, tree.own, seen);
  }
  return tree;
}
