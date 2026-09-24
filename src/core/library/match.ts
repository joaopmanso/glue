/* Link imported tracks to files in a granted folder (ADR 0020), and infer the folder's absolute path
   (ADR 0012). Matching: same file name, then the longest run of equal trailing path segments;
   file size breaks ties; anything still ambiguous stays unlinked. */
export interface FileEntry { rootId: string; relPath: string; size: number; mtime: number }
export interface Linkable { id: string; importPath: string | null; fileName: string; size: number | null }

const segs = (p: string) => p.replace(/\\/g, '/').split('/').filter(s => s && s !== '.' && s !== '..');

export function matchTracks(tracks: Linkable[], files: FileEntry[]): { links: Map<string, FileEntry>; rootPaths: Map<string, string> } {
  const byName = new Map<string, FileEntry[]>();
  for (const f of files) {
    const k = (segs(f.relPath).pop() || '').toLowerCase();
    const a = byName.get(k); if (a) a.push(f); else byName.set(k, [f]);
  }
  const links = new Map<string, FileEntry>(), used = new Set<FileEntry>();
  const votes = new Map<string, Map<string, number>>();   // rootId → abs prefix → count
  for (const t of tracks) {
    const path = t.importPath || t.fileName, ts = segs(path), tl = ts.map(s => s.toLowerCase());
    const cands = (byName.get(tl[tl.length - 1] || '') || []).filter(f => !used.has(f));
    if (!cands.length) continue;
    let best: FileEntry[] = [], bestScore = 0;
    for (const f of cands) {
      const fs = segs(f.relPath).map(s => s.toLowerCase());
      let k = 0; while (k < fs.length && k < tl.length && fs[fs.length - 1 - k] === tl[tl.length - 1 - k]) k++;
      if (k > bestScore) { bestScore = k; best = [f]; } else if (k === bestScore) best.push(f);
    }
    if (best.length > 1 && t.size) best = best.filter(f => f.size === t.size);
    if (best.length !== 1) continue;
    const f = best[0];
    links.set(t.id, f); used.add(f);
    // The part of the imported path before the matched relative path is where the root lives.
    const rel = segs(f.relPath);
    if (t.importPath && bestScore === rel.length && ts.length > rel.length) {
      const sep = /^[A-Za-z]:/.test(ts[0]) ? '\\' : '/';
      const prefix = (sep === '\\' ? '' : '/') + ts.slice(0, ts.length - rel.length).join(sep);
      const v = votes.get(f.rootId) || new Map<string, number>();
      v.set(prefix, (v.get(prefix) || 0) + 1); votes.set(f.rootId, v);
    }
  }
  const rootPaths = new Map<string, string>();
  for (const [root, v] of votes) {
    const sorted = [...v].sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] >= 2 || sorted.length === 1) rootPaths.set(root, sorted[0][0]);
  }
  return { links, rootPaths };
}
