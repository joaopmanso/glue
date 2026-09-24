/* Walk a granted folder for audio files and the DJ-app libraries that often live inside Music. */
import { AUDIO_EXT } from './tags';

export interface ScannedFile { relPath: string; handle: FileSystemFileHandle }
export interface FoundLibrary { kind: 'engine' | 'serato' | 'apple' | 'rekordbox' | 'traktor'; relPath: string; handle: FileSystemHandle }
type Entries = { entries(): AsyncIterable<[string, FileSystemHandle]> };

const SKIP_DIR = /^(\.|\$RECYCLE\.BIN$|System Volume Information$|node_modules$|Stems$|Engine Library$|_Serato_$|Previews$)/i;

export async function scanFolder(root: FileSystemDirectoryHandle, onProgress?: (n: number) => void, signal?: { cancelled: boolean }) {
  const files: ScannedFile[] = [], libraries: FoundLibrary[] = [];
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    for await (const [name, h] of (dir as unknown as Entries).entries()) {
      if (signal?.cancelled) return;
      const rel = prefix ? prefix + '/' + name : name;
      if (h.kind === 'directory') {
        const d = h as FileSystemDirectoryHandle;
        if (name === 'Engine Library') { const db = await findFile(d, ['Database2', 'm.db']); if (db) libraries.push({ kind: 'engine', relPath: rel + '/Database2/m.db', handle: db }); continue; }
        if (name === '_Serato_') { if (await findFile(d, ['database V2'])) libraries.push({ kind: 'serato', relPath: rel, handle: d }); continue; }
        if (!SKIP_DIR.test(name) && depth < 24) await walk(d, rel, depth + 1);
      } else if (AUDIO_EXT.test(name) && !name.startsWith('._')) {
        files.push({ relPath: rel, handle: h as FileSystemFileHandle });
        if (onProgress && files.length % 200 === 0) onProgress(files.length);
      } else if (/^iTunes( Music)? Library\.xml$|^Library\.xml$/i.test(name)) libraries.push({ kind: 'apple', relPath: rel, handle: h });
      else if (/^rekordbox.*\.xml$/i.test(name)) libraries.push({ kind: 'rekordbox', relPath: rel, handle: h });
      else if (/^collection\.nml$/i.test(name)) libraries.push({ kind: 'traktor', relPath: rel, handle: h });
    }
  };
  await walk(root, '', 0);
  return { files, libraries };
}

async function findFile(dir: FileSystemDirectoryHandle, path: string[]): Promise<FileSystemFileHandle | null> {
  try {
    let d = dir;
    for (const p of path.slice(0, -1)) d = await d.getDirectoryHandle(p);
    return await d.getFileHandle(path[path.length - 1]);
  } catch { return null; }
}
