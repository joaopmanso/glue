/* Everything MCO asks of the operating system goes through here (ADR 0007), so a desktop client can
   replace it later. Two web flavours: Chromium's File System Access pickers (full), and the
   origin-private file system for Safari/Firefox (reduced: no music folders, files come by drop). */
import { idbDel, idbGet, idbSet } from './idb';

type Dir = FileSystemDirectoryHandle;
type PermHandle = FileSystemHandle & {
  queryPermission(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
};
type Picker = (o: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string | FileSystemHandle }) => Promise<Dir>;

const picker = (): Picker | null => (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker ?? null;
export const canPickFolders = () => !!picker() && window.isSecureContext;

const HOME_KEY = 'home';

export type HomeState = { dir: Dir; kind: 'folder' | 'private'; granted: boolean } | null;

/** The MCO folder remembered from last time, and whether we may still use it without asking. */
export async function restoreHome(): Promise<HomeState> {
  let saved: { dir: Dir; kind: 'folder' | 'private' } | undefined;
  try { saved = await idbGet(HOME_KEY); } catch { saved = undefined; }
  if (!saved) return null;
  if (saved.kind === 'private') return { ...saved, dir: await navigator.storage.getDirectory(), granted: true };
  return { ...saved, granted: await permission(saved.dir, 'readwrite', false) };
}

/** Ask the user for the folder MCO keeps its data in (they create "MCO" inside Documents). */
export async function pickHome(): Promise<Dir> {
  const p = picker();
  if (!p) throw new Error('This browser can’t open folders.');
  const dir = await p({ id: 'mco-home', mode: 'readwrite', startIn: 'documents' });
  await idbSet(HOME_KEY, { dir, kind: 'folder' });
  return dir;
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

/** Ask for a music folder; its handle is stored under a key the collection remembers. */
export async function pickMusicFolder(): Promise<{ dir: Dir; key: string }> {
  const p = picker();
  if (!p) throw new Error('This browser can’t open folders; drop files onto MCO instead.');
  return rememberFolder(await p({ id: 'mco-music', mode: 'read', startIn: 'music' }));
}
/** Keep a folder handle (picked, or dropped onto the page) for later visits. */
export async function rememberFolder(dir: Dir): Promise<{ dir: Dir; key: string }> {
  const key = 'root:' + crypto.randomUUID();
  await idbSet(key, dir);
  return { dir, key };
}
export async function folderHandle(key: string): Promise<Dir | null> {
  try { return (await idbGet<Dir>(key)) ?? null; } catch { return null; }
}
export const forgetFolder = (key: string) => idbDel(key);
