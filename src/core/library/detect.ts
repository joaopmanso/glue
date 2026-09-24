/* Find DJ-app libraries in a folder the user has allowed (ADR 0030): a shallow look at the places
   they live, not a full scan. Engine DJ: Engine Library/Database2/m.db · Serato: _Serato_/database V2
   (in Music, or at a drive's root) · Traktor: collection.nml (Documents/Native Instruments/Traktor x) ·
   iTunes / Apple Music: iTunes (Music) Library.xml, or an exported Library.xml · rekordbox: an
   exported XML (its own database can't be read by a web page). */
import type { FoundLibrary } from './scan';

type Entries = { entries(): AsyncIterable<[string, FileSystemHandle]> };
export interface Detected extends FoundLibrary { modified: number; size: number }

const SKIP = /^(\.|\$RECYCLE\.BIN$|System Volume Information$|node_modules$|profiles$|files$|cache$|Stems$|Previews$|Windows$|Program Files)/i;
const MAX_DIRS = 4000;   // keeps a look into a huge folder quick

async function head(f: File, n = 600) { return new TextDecoder().decode(new Uint8Array(await f.slice(0, n).arrayBuffer())); }

export async function findLibraries(root: FileSystemDirectoryHandle, maxDepth = 3): Promise<Detected[]> {
  const out: Detected[] = [];
  let dirs = 0;
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    if (++dirs > MAX_DIRS) return;
    for await (const [name, h] of (dir as unknown as Entries).entries()) {
      const rel = prefix ? prefix + '/' + name : name;
      try {
        if (h.kind === 'directory') {
          const d = h as FileSystemDirectoryHandle;
          if (name === 'Engine Library') {
            const db = await d.getDirectoryHandle('Database2').then(x => x.getFileHandle('m.db')).catch(() => null);
            if (db) { const f = await db.getFile(); out.push({ kind: 'engine', relPath: rel + '/Database2/m.db', handle: db, modified: f.lastModified, size: f.size }); }
            continue;
          }
          if (name === '_Serato_') {
            const db = await d.getFileHandle('database V2').catch(() => null);
            if (db) { const f = await db.getFile(); out.push({ kind: 'serato', relPath: rel, handle: d, modified: f.lastModified, size: f.size }); }
            continue;
          }
          if (depth < maxDepth && !SKIP.test(name)) await walk(d, rel, depth + 1);
          continue;
        }
        const lower = name.toLowerCase();
        if (lower === 'collection.nml') {
          const f = await (h as FileSystemFileHandle).getFile();
          out.push({ kind: 'traktor', relPath: rel, handle: h, modified: f.lastModified, size: f.size });
        } else if (lower.endsWith('.xml') && depth <= 2) {
          const f = await (h as FileSystemFileHandle).getFile();
          if (f.size < 200) continue;
          const text = await head(f);
          if (/<DJ_PLAYLISTS[\s>]/.test(text)) out.push({ kind: 'rekordbox', relPath: rel, handle: h, modified: f.lastModified, size: f.size });
          else if (/<plist[\s>]/.test(text) && /Library/i.test(name)) out.push({ kind: 'apple', relPath: rel, handle: h, modified: f.lastModified, size: f.size });
        }
      } catch { /* unreadable entry: skip */ }
    }
  };
  await walk(root, '', 0);
  return out;
}
