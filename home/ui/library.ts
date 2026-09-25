/* This computer's GLUE library, as GLUE Home sees it (ADR 0045): the website's GLUE folder, read-only
   (the website stays its only writer), and where its music folders are on disk. */
import { bridge, type HomeConfig } from './bridge';
import { shardOf, type Collection, type HomeIndex, type Profile, type Track } from '../../src/store/types';

async function json<T>(rel: string): Promise<T | null> {
  try { return JSON.parse(await bridge.glueRead(rel)) as T; } catch { return null; }
}

export interface LibraryInfo { profiles: { id: string; name: string; collections: { id: string; name: string; roots: Collection['roots'] }[] }[] }

/** The profiles and collections in the GLUE folder (and each collection's music folders). */
export async function describe(): Promise<LibraryInfo | null> {
  const index = await json<HomeIndex>('mco.json');
  if (!index) return null;
  const profiles: LibraryInfo['profiles'] = [];
  for (const ref of index.profiles) {
    const p = await json<Profile>(`profiles/${ref.id}/profile.json`);
    if (!p) continue;
    const collections = [];
    for (const c of p.collections) {
      const meta = await json<Collection>(`profiles/${p.id}/collections/${c.id}/collection.json`);
      if (meta) collections.push({ id: c.id, name: meta.name, roots: meta.roots });
    }
    profiles.push({ id: p.id, name: p.name, collections });
  }
  return { profiles };
}

let known: { home: string | null; music: string | null; documents: string | null; desktop: string | null; downloads: string | null; sep: string } | null = null;
const join = (base: string, rel: string) => { const sep = known?.sep ?? (base.includes('\\') ? '\\' : '/'); return base.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep); };

/** Where a music folder is: where the user put it, where the website knows it is, or the folder of
    that name in a usual place that has the collection's songs in it. */
export async function locate(root: Collection['roots'][number], sample: string | null, cfg: HomeConfig): Promise<string | null> {
  if (cfg.folders?.[root.id]) return cfg.folders[root.id];
  known ??= await bridge.knownFolders();
  const cands = [root.absPath, known.music && root.name.toLowerCase() === 'music' ? known.music : null,
    ...[known.music, known.documents, known.home, known.desktop, known.downloads].map(b => b ? join(b, root.name) : null)].filter((x): x is string => !!x);
  for (const c of [...new Set(cands)]) {
    if (!(await bridge.exists(c))) continue;
    if (!sample || await bridge.exists(join(c, sample))) return c;
  }
  return null;
}

/** A song's file on this computer, from its ids (asked for by the website on another computer). */
export async function trackPath(profile: string, collection: string, id: string, cfg: HomeConfig): Promise<{ path: string; name: string; folder?: { id: string; path: string } }> {
  const base = `profiles/${profile}/collections/${collection}`;
  const shard = await json<{ items: Record<string, Track> }>(`${base}/tracks/${shardOf(id)}.json`);
  const t = shard?.items[id];
  if (!t) throw new Error('That song isn’t in this computer’s GLUE library.');
  if (t.fileKey?.startsWith('copy:')) return { path: join(cfg.glue!, t.fileKey.slice(5)), name: t.fileName };
  if (!t.rootId || !t.relPath) throw new Error('That song was added on its own in the browser; GLUE Home can’t find its file.');
  const meta = await json<Collection>(`${base}/collection.json`);
  const root = meta?.roots.find(r => r.id === t.rootId);
  if (!root) throw new Error('That song’s music folder isn’t in the collection any more.');
  const dir = await locate(root, t.relPath, cfg);
  if (!dir) throw new Error('GLUE Home doesn’t know where the music folder “' + root.name + '” is: choose it in GLUE Home’s settings.');
  return { path: join(dir, t.relPath), name: t.fileName, folder: cfg.folders?.[root.id] ? undefined : { id: root.id, path: dir } };
}
