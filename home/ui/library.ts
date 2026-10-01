/* This computer's GLUE library, as GLUE Home sees it (ADR 0045): the website's GLUE folder, read-only
   (the website stays its only writer), and where its music folders are on disk: found by itself. */
import { bridge, type HomeConfig } from './bridge';
import { INCOMING_ROOT, shardOf, type Collection, type HomeIndex, type Profile, type Track } from '../../src/store/types';
import { collectionHere, meFor, toLocal, unknownComputer, type SharedCollection, type SharedTrack } from '../../src/core/shared/project';

/** A collection as this computer has it: a shared one (ADR 0094) seen as this computer (its music
    folders, its copy of each song); any other as it is. `computer`: this computer as GLUE Home knows it (ADR
    0108); not known yet, the member this folder's entry names (for reading only: nothing is written from here). */
export function here(meta: Collection | SharedCollection | null, pid: string, cid: string, computer?: string | null) {
  const sc = meta && (meta as SharedCollection).shared ? meta as SharedCollection : null;
  const me = sc ? (!unknownComputer(computer) ? computer! : meFor(sc, pid) ?? '') : '';
  return {
    meta: sc ? collectionHere(sc, me) : meta as Collection | null,
    track: (t: Track | SharedTrack): Track => sc ? toLocal(t as SharedTrack, { me, collection: cid, members: sc.members ?? {} }) : t as Track,
  };
}

async function json<T>(rel: string): Promise<T | null> {
  try { return JSON.parse(await bridge.glueRead(rel)) as T; } catch { return null; }
}

/** The profile folder a collection is in, asked for with another folder's id (a computer's entry that named
    the wrong one, ADR 0108): the one that has it. Remembered for a minute (a song streams in many parts). */
const folders = new Map<string, { p: string; at: number }>();
export async function folderOf(profile: string, collection: string): Promise<string> {
  const k = profile + '/' + collection, known = folders.get(k);
  if (known && Date.now() - known.at < 60_000) return known.p;
  let p = profile;
  if (!await json(`profiles/${profile}/collections/${collection}/collection.json`)) {
    const index = await json<HomeIndex>('mco.json');
    for (const ref of index?.profiles ?? []) { const pf = await json<Profile>(`profiles/${ref.id}/profile.json`); if (pf?.collections.some(c => c.id === collection)) { p = pf.id; break; } }
  }
  folders.set(k, { p, at: Date.now() });
  return p;
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
      const meta = here(await json<Collection | SharedCollection>(`profiles/${p.id}/collections/${c.id}/collection.json`), p.id, c.id).meta;
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
  const h = here(await json<Collection | SharedCollection>(`profiles/${profile}/collections/${collection}/collection.json`), profile, collection);
  for (const a of HEX) for (const b of HEX) {
    if (out.size >= want.size) return out;
    const shard = await json<{ items: Record<string, Track> }>(`profiles/${profile}/collections/${collection}/tracks/${a + b}.json`);
    for (const t of Object.values(shard?.items ?? {}).map(h.track)) if (t.rootId && t.relPath && want.has(t.rootId) && !out.has(t.rootId)) out.set(t.rootId, { relPath: t.relPath, importPath: t.importPath });
  }
  return out;
}

let known: { home: string | null; music: string | null; documents: string | null; desktop: string | null; downloads: string | null; sep: string } | null = null;
const join = (base: string, rel: string) => { const sep = known?.sep ?? (base.includes('\\') ? '\\' : '/'); return base.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep); };
const slashes = (p: string) => p.replace(/\\/g, '/');

/** A music folder set in the settings that isn't reachable now (a network folder not connected, a drive not plugged
    in): its songs wait for it, they aren't failures. */
export class FolderAway extends Error {
  constructor(name: string, at: string) { super('“' + name + '” isn’t reachable right now (' + at + '): a network folder not connected, or a drive not plugged in'); this.name = 'FolderAway'; }
}
/** A music folder found by looking (not where the settings put it): told, so it's remembered (set by the service). */
export const found: { f: ((id: string, at: string) => Promise<void>) | null } = { f: null };
/** The drive searches running or just done, by music folder: one for all its songs (each song searched every drive
    for itself, up to 25 s, several at once, and a dropped folder's songs were never analysed, 2026-10-01). */
const searches = new Map<string, Promise<string | null>>();

/** Where a music folder is on this computer, checked with one of its songs:
    1. where it was put (settings), 2. where the song's DJ app said the song is, 3. where the website
    knows the folder is, 4. a folder of that name in Music, Documents, home, Desktop or Downloads, or inside a
    music folder GLUE Home knows, 5. a search of this computer's drives for a folder of that name with the song
    in it (one at a time per folder; a folder that isn't found isn't searched for again for a minute). What's
    found by 2–5 is remembered (`found`). */
export async function locate(root: Collection['roots'][number], sample: Sample | null, cfg: HomeConfig, opts: { search?: boolean } = {}): Promise<string | null> {
  // This computer's incoming folder (ADR 0051): wherever GLUE Home keeps it.
  if (root.id === INCOMING_ROOT) return cfg.incoming || await bridge.defaultIncoming();
  known ??= await bridge.knownFolders();
  const ok = async (dir: string | null | undefined): Promise<boolean> => !!dir && await bridge.exists(sample ? join(dir, sample.relPath) : dir);
  const chosen = cfg.folders?.[root.id];
  if (chosen && await ok(chosen)) return chosen;
  // Where it was put, gone (not mounted): the usual places only, no drive search for each song meanwhile.
  const gone = !!chosen && !await bridge.exists(chosen);
  const at = await look(root, sample, cfg, ok, gone ? { ...opts, search: false } : opts);
  if (at && root.id && at !== chosen) await found.f?.(root.id, at).catch(() => {});
  return at;
}
async function look(root: Collection['roots'][number], sample: Sample | null, cfg: HomeConfig, ok: (dir: string | null | undefined) => Promise<boolean>, opts: { search?: boolean }): Promise<string | null> {
  const k = known!;
  if (sample?.importPath) {
    const ip = slashes(sample.importPath).replace(/^file:\/\/(localhost)?\/?(?=[A-Za-z]:)/, '').replace(/^file:\/\/(localhost)?/, '');
    if (ip.toLowerCase().endsWith('/' + sample.relPath.toLowerCase())) {
      const dir = ip.slice(0, ip.length - sample.relPath.length - 1);
      const native = k.sep === '\\' ? dir.replace(/\//g, '\\') : dir;
      if (await ok(native)) return native;
    }
  }
  if (root.absPath && await ok(root.absPath)) return root.absPath;
  const cands = [k.music && root.name.toLowerCase() === 'music' ? k.music : null,
    ...[k.music, k.documents, k.home, k.desktop, k.downloads, ...Object.values(cfg.folders ?? {})].map(b => b ? join(b, root.name) : null)];
  for (const c of cands) if (c && await ok(c)) return c;
  if (opts.search === false || !sample) return null;
  let s = searches.get(root.id);
  if (!s) {
    s = bridge.findFolder(root.name, sample.relPath).catch(() => null);
    searches.set(root.id, s);
    void s.then(at => setTimeout(() => searches.delete(root.id), at ? 0 : 60_000));
  }
  const at = await s;
  return at && await ok(at) ? at : null;
}

/** The folders a search found that the settings should take: only new places, and only for folders the
    settings didn't change since the search began (`before`); a folder picked meanwhile stays as picked.
    Null: nothing to save. */
export function newlyFound(before: Record<string, string>, found: Record<string, string>, cur: Record<string, string>): Record<string, string> | null {
  const add: Record<string, string> = {};
  for (const [id, at] of Object.entries(found)) if (at !== before[id] && cur[id] === before[id]) add[id] = at;
  return Object.keys(add).length ? { ...cur, ...add } : null;
}

/** Find every music folder of every shared collection; returns what was found, and what wasn't. */
export async function locateAll(cfg: HomeConfig): Promise<{ folders: Record<string, string>; missing: { id: string; name: string; collection: string }[] }> {
  const lib = await describe(), folders: Record<string, string> = {}, missing: { id: string; name: string; collection: string }[] = [];
  for (const p of lib?.profiles ?? []) for (const c of p.collections) {
    if (!shared(cfg, p.id, c.id) || !c.roots.length) continue;
    const s = await samples(p.id, c.id, c.roots.map(r => r.id));
    for (const r of c.roots) {
      if (folders[r.id] || r.id === INCOMING_ROOT) continue;
      if (!s.has(r.id)) continue;   // no songs in it (yet)
      const at = await locate(r, s.get(r.id)!, cfg);
      if (at) folders[r.id] = at; else missing.push({ id: r.id, name: r.name, collection: p.name + ' · ' + c.name });
    }
  }
  return { folders, missing };
}

/** A song's file on this computer, from its ids (asked for by the website on another computer). */
/** mtime and size: as the collection has them (an analysis is of the file as the collection knows it). */
export async function trackPath(profile: string, collection: string, id: string, cfg: HomeConfig): Promise<{ path: string; name: string; mtime: number; size: number | null; folder?: { id: string; path: string } }> {
  if (!shared(cfg, profile, collection)) throw new Error('That collection isn’t shared by GLUE Home (see its settings).');
  const base = `profiles/${profile}/collections/${collection}`;
  const shard = await json<{ items: Record<string, Track> }>(`${base}/tracks/${shardOf(id)}.json`);
  const h = here(await json<Collection | SharedCollection>(`${base}/collection.json`), profile, collection, cfg.computer);
  const t = shard?.items[id] ? h.track(shard.items[id]) : null;
  if (!t) throw new Error('That song isn’t in this computer’s GLUE library.');
  if (t.fileKey?.startsWith('copy:')) return { path: join(cfg.glue!, t.fileKey.slice(5)), name: t.fileName, mtime: t.mtime ?? 0, size: t.size };
  if (t.remote) throw new Error('That song isn’t on this computer.');
  // Added on its own, where GLUE Home found it (ADR 0125).
  if ((!t.rootId || !t.relPath) && t.filePath) {
    if (!await bridge.exists(t.filePath)) throw new FolderAway(t.fileName, t.filePath);
    return { path: t.filePath, name: t.fileName, mtime: t.mtime ?? 0, size: t.size };
  }
  if (!t.rootId || !t.relPath) throw new Error('That song was added on its own in the browser; GLUE Home can’t find its file.');
  const meta = h.meta;
  const root = meta?.roots.find(r => r.id === t.rootId);
  if (!root) throw new Error('That song’s music folder isn’t in the collection any more.');
  const dir = await locate(root, { relPath: t.relPath, importPath: t.importPath }, cfg);
  if (!dir) {
    const chosen = cfg.folders?.[root.id];
    if (chosen && !await bridge.exists(chosen)) throw new FolderAway(root.name, chosen);
    throw new Error('GLUE Home couldn’t find the music folder “' + root.name + '” on this computer (with ' + t.fileName + ' in it).');
  }
  return { path: join(dir, t.relPath), name: t.fileName, mtime: t.mtime ?? 0, size: t.size, folder: cfg.folders?.[root.id] === dir ? undefined : { id: root.id, path: dir } };
}
