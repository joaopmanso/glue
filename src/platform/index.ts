/* Everything GLUE asks of the operating system goes through here (ADR 0007), so a desktop client can
   replace it later. Two web flavours: Chromium's File System Access pickers (full), and the
   origin-private file system for Safari/Firefox (reduced: no music folders, files come by drop).
   Home mode (ADR 0051): where GLUE Home runs and knows the GLUE folder, the GLUE folder and the music
   folders are GLUE Home's disk instead, chosen with GLUE Home's own folder dialog. */
import { idbDel, idbGet, idbSet } from './idb';
import { HomeDir, HomeDisk, type HomeRoots } from './homeDisk';
export { HomeDown } from './homeDisk';
import { INCOMING_ROOT, type Root } from '../store/types';

// ─── Home mode ───────────────────────────────────────────────────────────────
let disk: HomeDisk | null = null, roots: HomeRoots | null = null, active = false;
let downHook: (() => void) | null = null;
/** Called when a request finds GLUE Home gone (lib/localHome checks, and the library falls back). */
export function onHomeDown(f: () => void) { downHook = f; if (disk) disk.onDown = f; }
/** This computer's GLUE Home answers on the local link (or stopped answering: null). */
export function setHomeLink(link: { port: number; token: string } | null) {
  disk = link ? new HomeDisk('http://127.0.0.1:' + link.port, link.token) : null;
  if (disk) disk.onDown = () => downHook?.();
  roots = null;
  if (!disk) active = false;
}
/** GLUE Home is back: its GLUE folder, if it's the one this library uses (`current`: the browser's
    handle it carried on with). Home mode from then on. */
export async function homeDirFor(current: Dir | null): Promise<Dir | null> {
  const r = await homeRoots(true);
  if (!r?.glue || !disk) return null;
  const dir = disk.dir(r.glue);
  if (current && !(current instanceof HomeDir) && !(await sameText(current, dir))) return null;
  active = true;
  return dir;
}
/** GLUE Home stopped: the browser's own handles from now on (until homeDirFor). */
export function leaveHome() { active = false; roots = null; }
/** The GLUE folder this browser keeps its own handle to (to carry on without GLUE Home), and whether
    it may be used without asking. */
export async function browserHome(): Promise<{ dir: Dir; granted: boolean } | null> {
  let saved: { dir: Dir; kind: 'folder' | 'private' } | undefined;
  try { saved = await idbGet(HOME_KEY); } catch { saved = undefined; }
  if (saved?.kind !== 'folder') return null;
  return { dir: saved.dir, granted: await permission(saved.dir, 'readwrite', false) };
}
/** The GLUE folder and music folders are GLUE Home's (decided when the GLUE folder opens). */
export const homeMode = () => active && !!disk;
async function homeRoots(fresh = false): Promise<HomeRoots | null> {
  if (!disk) return null;
  try { if (fresh || !roots) roots = await disk.roots(); return roots; } catch { return null; }
}
/** GLUE Home's incoming folder, in Home mode (ADR 0051). */
export async function incomingFolder(): Promise<{ dir: Dir; path: string } | null> {
  const r = homeMode() ? await homeRoots() : null;
  return r && disk ? { dir: disk.dir(r.incoming), path: r.incoming } : null;
}
const sameText = async (a: Dir, b: Dir) => {
  const read = async (d: Dir) => { try { return await (await (await d.getFileHandle('mco.json')).getFile()).text(); } catch { return null; } };
  return (await read(a)) === (await read(b));
};

type Dir = FileSystemDirectoryHandle;
type PermHandle = FileSystemHandle & {
  queryPermission(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
};
type Picker = (o: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string | FileSystemHandle }) => Promise<Dir>;

const picker = (): Picker | null => (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker ?? null;
export const canPickFolders = () => homeMode() || (!!picker() && window.isSecureContext);

const HOME_KEY = 'home';

export type HomeState = { dir: Dir; kind: 'folder' | 'private'; granted: boolean } | null;

/** The GLUE folder remembered from last time, and whether we may still use it without asking. */
export async function restoreHome(): Promise<HomeState> {
  let saved: { dir: Dir; kind: 'folder' | 'private' } | undefined;
  try { saved = await idbGet(HOME_KEY); } catch { saved = undefined; }
  // GLUE Home's GLUE folder, unless this browser keeps its data elsewhere (another folder, or the
  // browser's own storage): then it stays in browser mode rather than show another library.
  const r = await homeRoots(true);
  if (r?.glue && disk) {
    const dir = disk.dir(r.glue);
    const mine = saved?.kind === 'folder' && await permission(saved.dir, 'readwrite', false) ? saved.dir : null;
    // Can't read this browser's own folder without a click: the same folder name is taken as the same
    // folder (GLUE Home found it where the website keeps it), so no prompt is needed.
    const same = mine ? await sameText(mine, dir) : saved?.kind === 'folder' && saved.dir.name === dir.name;
    if (!saved || same) { active = true; return { dir, kind: 'folder', granted: true }; }
  }
  active = false;
  if (!saved) return null;
  if (saved.kind === 'private') return { ...saved, dir: await navigator.storage.getDirectory(), granted: true };
  return { ...saved, granted: await permission(saved.dir, 'readwrite', false) };
}

/** Ask the user for the folder GLUE keeps its data in (they create "GLUE" inside Documents). */
export async function pickHome(): Promise<Dir> {
  if (disk) {
    const r = await disk.pick('glue', 'Choose the folder GLUE keeps its data in');
    if (!r.path) throw Object.assign(new Error('No folder chosen'), { name: 'AbortError' });
    roots = null; active = true;
    return disk.dir(r.path);
  }
  const p = picker();
  if (!p) throw new Error('This browser can’t open folders.');
  return p({ id: 'mco-home', mode: 'readwrite', startIn: 'documents' });
}
/** Use this folder for GLUE's data from now on. */
export const rememberHome = async (dir: Dir) => { if (!(dir instanceof HomeDir)) await idbSet(HOME_KEY, { dir, kind: 'folder' }); };
export const isHomeDir = (d: unknown) => d instanceof HomeDir;

export interface FolderLook { hasMco: boolean; audio: number; folders: number; files: number }
const AUDIO = /\.(flac|wav|aiff?|aifc|m4a|mp3|aac|ogg|opus|alac|wv)$/i;
/** A quick look inside a folder (top level plus one level down) before GLUE writes into it. */
export async function lookInto(dir: Dir): Promise<FolderLook> {
  const out: FolderLook = { hasMco: false, audio: 0, folders: 0, files: 0 };
  type E = { entries(): AsyncIterable<[string, FileSystemHandle]> };
  for await (const [name, h] of (dir as unknown as E).entries()) {
    if (name === 'mco.json' && h.kind === 'file') out.hasMco = true;
    if (h.kind === 'directory') {
      out.folders++;
      if (out.folders <= 20 && name !== 'profiles' && name !== 'files') {
        let n = 0;
        for await (const [child, ch] of (h as unknown as E).entries()) { if (ch.kind === 'file' && AUDIO.test(child)) out.audio++; if (++n > 200) break; }
      }
    } else { out.files++; if (AUDIO.test(name)) out.audio++; }
  }
  return out;
}

/** Forget everything GLUE keeps in the browser: folder handles, stored analyses, preferences. */
export async function wipeBrowserData(privateRoot: boolean) {
  await new Promise<void>(res => { try { const r = indexedDB.deleteDatabase('mco'); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('cache', { recursive: true }).catch(() => {});
    if (privateRoot) for (const n of ['profiles', 'files', 'mco.json']) await root.removeEntry(n, { recursive: true }).catch(() => {});
  } catch { /* no private storage */ }
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('mco.')) localStorage.removeItem(k); } catch { /* storage blocked */ }
}

/** The browser's private storage, for browsers without folder pickers. */
export async function privateHome(): Promise<Dir> {
  const dir = await navigator.storage.getDirectory();
  try { await navigator.storage.persist?.(); } catch { /* best effort */ }
  await idbSet(HOME_KEY, { kind: 'private' });
  return dir;
}

export const forgetHome = () => idbDel(HOME_KEY);

/** Check, and optionally ask for (needs a click), access to a handle. */
export async function permission(h: FileSystemHandle, mode: 'read' | 'readwrite', ask: boolean): Promise<boolean> {
  const ph = h as PermHandle;
  if (!ph.queryPermission) return true;   // OPFS and test doubles
  try {
    if (await ph.queryPermission({ mode }) === 'granted') return true;
    return ask ? await ph.requestPermission({ mode }) === 'granted' : false;
  } catch { return false; }
}

/** Ask for a music folder (`id`: the collection's id for it); its handle is stored under a key the
    collection remembers. In Home mode GLUE Home remembers where it is, and says its path. */
export async function pickMusicFolder(id: string): Promise<{ dir: Dir; key: string; path?: string }> {
  if (homeMode() && disk) {
    const r = await disk.pick(`folder:${id}`, 'Choose a music folder');
    if (!r.path) throw Object.assign(new Error('No folder chosen'), { name: 'AbortError' });
    roots = null;
    return { dir: disk.dir(r.path), key: 'home:' + id, path: r.path };
  }
  const p = picker();
  if (!p) throw new Error('This browser can’t open folders; drop files onto GLUE instead.');
  return rememberFolder(await p({ id: 'mco-music', mode: 'read', startIn: 'music' }));
}
/** Keep a folder handle (picked, or dropped onto the page) for later visits. */
export async function rememberFolder(dir: Dir): Promise<{ dir: Dir; key: string }> {
  const key = 'root:' + crypto.randomUUID();
  await idbSet(key, dir);
  return { dir, key };
}
/** A collection's music folder: in Home mode where GLUE Home says it is, else the browser's handle. */
export async function musicFolder(root: Root): Promise<Dir | null> {
  if (homeMode()) { const r = await homeRoots(); const at = root.id === INCOMING_ROOT ? r?.incoming : r?.folders[root.id]; return at && disk ? disk.dir(at) : null; }
  return root.handleKey.startsWith('home:') ? null : folderHandle(root.handleKey);
}
export async function folderHandle(key: string): Promise<Dir | null> {
  try { return (await idbGet<Dir>(key)) ?? null; } catch { return null; }
}
export const forgetFolder = (key: string) => idbDel(key);

/** Extra places where GLUE looks for DJ libraries (e.g. Documents › Native Instruments), remembered. */
export async function libraryPlaces(): Promise<{ key: string; dir: Dir }[]> {
  try { return (await idbGet<{ key: string; dir: Dir }[]>('library-places')) ?? []; } catch { return []; }
}
export async function addLibraryPlace(startIn: 'music' | 'documents' | 'desktop' = 'documents'): Promise<{ key: string; dir: Dir }> {
  const p = picker();
  if (!p) throw new Error('This browser can’t open folders; use Import instead.');
  const dir = await p({ id: 'mco-libraries', mode: 'read', startIn });
  const places = await libraryPlaces();
  for (const x of places) if (await x.dir.isSameEntry(dir)) return x;
  const place = { key: 'place:' + crypto.randomUUID(), dir };
  await idbSet('library-places', [...places, place]);
  return place;
}
export async function forgetLibraryPlace(key: string) { await idbSet('library-places', (await libraryPlaces()).filter(p => p.key !== key)); }

/** The browser's private storage for derived data (stored analyses): not synced, safe to lose. */
export async function cacheDir(): Promise<Dir | null> {
  try { return await (await navigator.storage.getDirectory()).getDirectoryHandle('cache', { create: true }); } catch { return null; }
}

type FilePicker = (o: { id?: string; multiple?: boolean; startIn?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle[]>;
const filePicker = (): FilePicker | null => (window as unknown as { showOpenFilePicker?: FilePicker }).showOpenFilePicker ?? null;
/** Can single files be kept across visits (a handle per file)? Otherwise GLUE keeps a copy. */
export const canKeepFiles = () => !!filePicker() && window.isSecureContext;

export async function pickAudioFiles(): Promise<FileSystemFileHandle[]> {
  const p = filePicker();
  if (!p) throw new Error('This browser can’t open files by handle.');
  return p({ id: 'mco-songs', multiple: true, startIn: 'music', types: [{ description: 'Audio', accept: { 'audio/*': ['.flac', '.wav', '.aif', '.aiff', '.aifc', '.m4a', '.mp4', '.alac', '.mp3', '.aac', '.ogg', '.oga', '.opus', '.webm', '.mka'] } }] });
}
/** Keep a single file's handle (picked or dropped) for later visits. */
export async function rememberFile(h: FileSystemFileHandle): Promise<string> {
  const key = 'file:' + crypto.randomUUID();
  await idbSet(key, h);
  return key;
}
export async function fileHandle(key: string): Promise<FileSystemFileHandle | null> {
  try { return (await idbGet<FileSystemFileHandle>(key)) ?? null; } catch { return null; }
}
