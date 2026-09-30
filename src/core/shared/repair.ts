/* A shared collection's parts written under the wrong computer, folded back into the right one (ADR 0108).
   Pure. On 2026-09-30 the user's desktop had its own songs written under a stand-in ("this-computer"),
   because a store opened before it knew which computer it was on, and its entry claimed by another browser's
   own GLUE folder on the same computer. GLUE Home, which knows its computer from GLUE Cloud, puts it right:
   - each stand-in's copy of a song becomes the computer's, unless the computer already has that file there
     (then it was a duplicate, and goes); a different file of the computer's own is kept;
   - analyses: the newer one is the computer's;
   - music folders: the computer's, with a stand-in's added when it has one the computer doesn't;
   - DJ libraries read under a stand-in are the computer's;
   - the computer's entry is this GLUE folder's again.
   Songs that end up as the same file twice (two rows) are named, for the caller to fold one into the
   other (playlists, rating, notes: store/merge absorbTracks). */
import type { AnalysisSummary, Root, Source } from '../../store/types';
import { OLD_STAND_IN, type Copy, type SharedCollection, type SharedTrack } from './project';

export interface FoldInput {
  meta: SharedCollection;
  tracks: Map<string, SharedTrack>;
  analysis: Map<string, Record<string, AnalysisSummary>>;
  sources: Source[];
}
export interface FoldResult {
  meta: SharedCollection;
  /** Songs and analyses changed (ids), and libraries changed. */
  tracks: Map<string, SharedTrack>;
  analysis: Map<string, Record<string, AnalysisSummary>>;
  sources: Source[];
  /** [the row that goes, the row it folds into]: the same file on this computer twice. */
  twins: [string, string][];
  /** How much was put right, for the Activity page. */
  counts: { copiesMoved: number; copiesDropped: number; analysesMoved: number; twins: number };
}

/** The ids a GLUE folder's parts were wrongly written under: the old stand-in, and any other member whose
    entry names this folder (a computer is one member). */
export function strayIds(meta: SharedCollection, into: string, folder: string): string[] {
  const out = new Set<string>();
  const members = meta.members ?? {};
  for (const [id, m] of Object.entries(members)) if (id !== into && (id === OLD_STAND_IN || m.profile === folder)) out.add(id);
  if (meta.rootsBy?.[OLD_STAND_IN]) out.add(OLD_STAND_IN);
  return [...out];
}

/** Anything to put right: stray ids in the files, or the computer's entry naming another GLUE folder. */
export function needsFold(input: FoldInput, into: string, folder: string): boolean {
  const from = strayIds(input.meta, into, folder);
  if (from.length) return true;
  const mine = input.meta.members?.[into];
  if (mine && mine.profile !== folder) return true;
  for (const t of input.tracks.values()) if (t.copies?.[OLD_STAND_IN]) return true;
  for (const by of input.analysis.values()) if (by?.[OLD_STAND_IN]) return true;
  return input.sources.some(s => s.computer === OLD_STAND_IN);
}

const sameFile = (a: Copy, b: Copy) => (a.rootId ?? null) === (b.rootId ?? null) && (a.relPath ?? null) === (b.relPath ?? null) && (a.fileKey ?? null) === (b.fileKey ?? null);

export function foldComputer(input: FoldInput, into: string, folder: string, name?: string): FoldResult {
  const from = new Set(strayIds(input.meta, into, folder));
  // Stand-ins found only in songs or analyses (not in the collection's own file) are strays too.
  for (const t of input.tracks.values()) if (t.copies?.[OLD_STAND_IN]) from.add(OLD_STAND_IN);
  for (const by of input.analysis.values()) if (by?.[OLD_STAND_IN]) from.add(OLD_STAND_IN);
  if (input.sources.some(s => s.computer === OLD_STAND_IN)) from.add(OLD_STAND_IN);
  from.delete(into);
  const counts = { copiesMoved: 0, copiesDropped: 0, analysesMoved: 0, twins: 0 };

  // The collection's file: the computer's entry names this folder; its music folders take the strays'.
  const members = { ...(input.meta.members ?? {}) }, rootsBy = { ...(input.meta.rootsBy ?? {}) };
  const roots: Root[] = [...(rootsBy[into] ?? [])];
  for (const f of from) {
    for (const r of rootsBy[f] ?? []) if (!roots.some(x => x.id === r.id)) roots.push(r);
    delete rootsBy[f];
    delete members[f];
  }
  if (roots.length || rootsBy[into]) rootsBy[into] = roots;
  members[into] = { profile: folder, name: members[into]?.name ?? name ?? 'This computer' };
  const meta: SharedCollection = { ...input.meta, members, rootsBy };

  // Each song's copies.
  const tracks = new Map<string, SharedTrack>();
  for (const [id, t] of input.tracks) {
    if (!Object.keys(t.copies ?? {}).some(c => from.has(c))) continue;
    const copies = { ...t.copies };
    for (const f of from) {
      const c = copies[f];
      if (!c) continue;
      delete copies[f];
      if (!copies[into]) { copies[into] = c; counts.copiesMoved++; }
      else counts.copiesDropped++;   // the same file (a duplicate), or a different one: the computer's own stays
    }
    tracks.set(id, { ...t, copies });
  }

  // Analyses: the newer one is the computer's.
  const analysis = new Map<string, Record<string, AnalysisSummary>>();
  for (const [id, by] of input.analysis) {
    if (!by || !Object.keys(by).some(c => from.has(c))) continue;
    const out = { ...by };
    for (const f of from) {
      const a = out[f];
      if (!a) continue;
      delete out[f];
      const cur = out[into];
      if (!cur || (a.at ?? 0) > (cur.at ?? 0)) { out[into] = a; counts.analysesMoved++; }
    }
    analysis.set(id, out);
  }

  // DJ libraries read under a stray id.
  const sources = input.sources.filter(s => s.computer && from.has(s.computer)).map(s => ({ ...s, computer: into }));

  // The same file twice on this computer: the newer row folds into the older one.
  const byFile = new Map<string, { id: string; added: string }>(), twins: [string, string][] = [];
  const all = (id: string) => tracks.get(id) ?? input.tracks.get(id)!;
  const ids = [...input.tracks.keys()].sort((a, b) => (all(a).addedAt ?? '').localeCompare(all(b).addedAt ?? '') || a.localeCompare(b));
  for (const id of ids) {
    const c = all(id).copies?.[into];
    if (!c || (!c.relPath && !c.fileKey)) continue;
    const k = (c.rootId ?? '') + '|' + (c.relPath ?? '') + '|' + (c.fileKey ?? '');
    const first = byFile.get(k);
    // Only rows this repair touched: two rows of one file from before are another matter (duplicates).
    if (first && sameFile(all(first.id).copies[into], c) && (tracks.has(id) || tracks.has(first.id))) twins.push([id, first.id]);
    else if (!first) byFile.set(k, { id, added: all(id).addedAt ?? '' });
  }
  counts.twins = twins.length;
  return { meta, tracks, analysis, sources, twins, counts };
}
