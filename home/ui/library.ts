/* This computer's GLUE library, as GLUE Home sees it (ADR 0045): the website's GLUE folder, read-only
   (the website stays its only writer), and where its music folders are on disk: found by itself. */
import { bridge, type HomeConfig } from './bridge';
import { shardOf, type Collection, type HomeIndex, type Profile, type Track } from '../../src/store/types';

async function json<T>(rel: string): Promise<T | null> {
  try { return JSON.parse(await bridge.glueRead(rel)) as T; } catch { return null; }
}

export interface LibraryInfo { profiles: { id: string; name: string; collections: { id: string; name: string; roots: Collection['roots'] }[] }[] }
export const collectionKey = (profile: string, collection: string) => profile + '/' + collection;
/** Shared with the account's other computers (on unless turned off in the settings). */
export const shared = (cfg: HomeConfig | null, profile: string, collection: string) => cfg?.serve?.[collectionKey(profile, collection)] !== false;

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

type Sample = { relPath: string; importPath: string | null };
const HEX = '0123456789abcdef';
/** One song of each music folder of a collection (to check where a folder is). */
export async function samples(profile: string, collection: string, roots: string[]): Promise<Map<string, Sample>> {
  const out = new Map<string, Sample>(), want = new Set(roots);
  for (const a of HEX) for (const b of HEX) {
    if (out.size >= want.size) return out;
    const shard = await json<{ items: Record<string, Track> }>(`profiles/${profile}/collections/${collection}/tracks/${a + b}.json`);
    for (const t of Object.values(shard?.items ?? {})) if (t.rootId && t.relPath && want.has(t.rootId) && !out.has(t.rootId)) out.set(t.rootId, { relPath: t.relPath, importPath: t.importPath });
  }
  return out;
}

let known: { home: string | null; music: string | null; documents: string | null; desktop: string | null; downloads: string | null; sep: string } | null = null;
const join = (base: string, rel: string) => { const sep = known?.sep ?? (base.includes('\\') ? '\\' : '/'); return base.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep); };
const slashes = (p: string) => p.replace(/\\/g, '/');

/** Where a music folder is on this computer, checked with one of its songs:
    1. where it was put (settings), 2. where the song's DJ app said the song is, 3. where the website
    knows the folder is, 4. a folder of that name in Music, Documents, home, Desktop or Downloads,
    5. a search of this computer's drives for a folder of that name with the song in it. */
export async function locate(root: Collection['roots'][number], sample: Sample | null, cfg: HomeConfig, opts: { search?: boolean } = {}): Promise<string | null> {
  known ??= await bridge.knownFolders();
  const ok = async (dir: string | null | undefined): Promise<boolean> => !!dir && await bridge.exists(sample ? join(dir, sample.relPath) : dir);
  const chosen = cfg.folders?.[root.id];
  if (chosen && await ok(chosen)) return chosen;
  if (sample?.importPath) {
    const ip = slashes(sample.importPath).replace(/^file:\/\/(localhost)?\/?(?=[A-Za-z]:)/, '').replace(/^file:\/\/(localhost)?/, '');
    if (ip.toLowerCase().endsWith('/' + sample.relPath.toLowerCase())) {
      const dir = ip.slice(0, ip.length - sample.relPath.length - 1);
      const native = known.sep === '\\' ? dir.replace(/\//g, '\\') : dir;
      if (await ok(native)) return native;
    }
  }
  if (root.absPath && await ok(root.absPath)) return root.absPath;
  const cands = [known.music && root.name.toLowerCase() === 'music' ? known.music : null,
    ...[known.music, known.documents, known.home, known.desktop, known.downloads].map(b => b ? join(b, root.name) : null)];
  for (const c of cands) if (c && await ok(c)) return c;
  if (opts.search !== false && sample) return bridge.findFolder(root.name, sample.relPath).catch(() => null);
  return null;
}

/** Find every music folder of every shared collection; returns what was found, and what wasn't. */
export async function locateAll(cfg: HomeConfig): Promise<{ folders: Record<string, string>; missing: { id: string; name: string; collection: string }[] }> {
  const lib = await describe(), folders: Record<string, string> = {}, missing: { id: string; name: string; collection: string }[] = [];
  for (const p of lib?.profiles ?? []) for (const c of p.collections) {
    if (!shared(cfg, p.id, c.id) || !c.roots.length) continue;
    const s = await samples(p.id, c.id, c.roots.map(r => r.id));
    for (const r of c.roots) {
      if (folders[r.id]) continue;
      if (!s.has(r.id)) continue;   // no songs in it (yet)
      const at = await locate(r, s.get(r.id)!, cfg);
      if (at) folders[r.id] = at; else missing.push({ id: r.id, name: r.name, collection: p.name + ' · ' + c.name });
    }
  }
  return { folders, missing };
}

/** A song's file on this computer, from its ids (asked for by the website on another computer). */
export async function trackPath(profile: string, collection: string, id: string, cfg: HomeConfig): Promise<{ path: string; name: string; folder?: { id: string; path: string } }> {
  if (!shared(cfg, profile, collection)) throw new Error('That collection isn’t shared by GLUE Home (see its settings).');
  const base = `profiles/${profile}/collections/${collection}`;
  const shard = await json<{ items: Record<string, Track> }>(`${base}/tracks/${shardOf(id)}.json`);
  const t = shard?.items[id];
  if (!t) throw new Error('That song isn’t in this computer’s GLUE library.');
  if (t.fileKey?.startsWith('copy:')) return { path: join(cfg.glue!, t.fileKey.slice(5)), name: t.fileName };
  if (!t.rootId || !t.relPath) throw new Error('That song was added on its own in the browser; GLUE Home can’t find its file.');
  const meta = await json<Collection>(`${base}/collection.json`);
  const root = meta?.roots.find(r => r.id === t.rootId);
  if (!root) throw new Error('That song’s music folder isn’t in the collection any more.');
  const dir = await locate(root, { relPath: t.relPath, importPath: t.importPath }, cfg);
  if (!dir) throw new Error('GLUE Home couldn’t find the music folder “' + root.name + '” on this computer (with ' + t.fileName + ' in it).');
  return { path: join(dir, t.relPath), name: t.fileName, folder: cfg.folders?.[root.id] === dir ? undefined : { id: root.id, path: dir } };
}
