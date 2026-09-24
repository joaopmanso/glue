/* Small helpers over the File System Access directory API (also works on OPFS and the test double). */

export type Dir = FileSystemDirectoryHandle;

export async function subdir(root: Dir, parts: string[], create: boolean): Promise<Dir | null> {
  let d = root;
  for (const p of parts) {
    try { d = await d.getDirectoryHandle(p, { create }); } catch (e) { if (!create && (e as DOMException).name === 'NotFoundError') return null; throw e; }
  }
  return d;
}

const split = (path: string) => { const parts = path.split('/').filter(Boolean); return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] }; };

export async function readText(root: Dir, path: string): Promise<string | null> {
  const { dirs, name } = split(path);
  const d = await subdir(root, dirs, false);
  if (!d) return null;
  try { return await (await (await d.getFileHandle(name)).getFile()).text(); }
  catch (e) { if ((e as DOMException).name === 'NotFoundError') return null; throw e; }
}

export class DamagedFile extends Error {
  constructor(readonly path: string, readonly text: string) { super('Damaged file in your MCO folder: ' + path); }
}

/** A file's JSON. An empty file counts as missing: the browser creates the file before the first
    write commits, so a crash during that first write leaves it empty. */
export async function readJSON<T>(root: Dir, path: string): Promise<T | null> {
  const t = await readText(root, path);
  if (t == null || !t.trim()) return null;
  try { return JSON.parse(t) as T; } catch { throw new DamagedFile(path, t); }
}

/** Write through a writable stream: the browser writes a swap file and replaces the target on close. */
export async function writeText(root: Dir, path: string, text: string): Promise<void> {
  const { dirs, name } = split(path);
  const d = (await subdir(root, dirs, true))!;
  const fh = await d.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try { await w.write(text); await w.close(); }
  catch (e) { try { await w.abort(); } catch { /* already closed */ } throw e; }
}
export const writeJSON = (root: Dir, path: string, data: unknown) => writeText(root, path, JSON.stringify(data));
export async function writeBlob(root: Dir, path: string, blob: Blob): Promise<void> {
  const { dirs, name } = split(path);
  const d = (await subdir(root, dirs, true))!;
  const w = await (await d.getFileHandle(name, { create: true })).createWritable();
  try { await w.write(blob); await w.close(); }
  catch (e) { try { await w.abort(); } catch { /* already closed */ } throw e; }
}

export async function removePath(root: Dir, path: string): Promise<void> {
  const { dirs, name } = split(path);
  const d = await subdir(root, dirs, false);
  if (!d) return;
  try { await d.removeEntry(name, { recursive: true }); } catch (e) { if ((e as DOMException).name !== 'NotFoundError') throw e; }
}

export async function listNames(root: Dir, path: string, kind: 'file' | 'directory'): Promise<string[]> {
  const d = await subdir(root, path.split('/').filter(Boolean), false);
  if (!d) return [];
  const out: string[] = [];
  for await (const [name, h] of (d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) if (h.kind === kind) out.push(name);
  return out.sort();
}

/** A file inside a granted folder, by '/'-separated relative path. */
export async function fileAt(root: Dir, relPath: string): Promise<File> {
  const { dirs, name } = split(relPath);
  const d = await subdir(root, dirs, false);
  if (!d) throw new Error('Folder not found: ' + dirs.join('/'));
  return (await d.getFileHandle(name)).getFile();
}
