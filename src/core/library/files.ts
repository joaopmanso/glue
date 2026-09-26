/* Size, date and first bytes of a file handle without reading it all. GLUE Home's handles (ADR 0051)
   know the size and date from the folder listing and fetch only a byte range; the browser's handles
   read them from getFile(), which costs nothing locally. */
type Quick = { size: number; lastModified: number; head(n: number): Promise<Uint8Array> };
const quick = (h: FileSystemFileHandle): Quick | null => typeof (h as unknown as Partial<Quick>).head === 'function' ? h as unknown as Quick : null;

export async function fileMeta(h: FileSystemFileHandle): Promise<{ name: string; size: number; lastModified: number }> {
  const q = quick(h);
  if (q) return { name: h.name, size: q.size, lastModified: q.lastModified };
  const f = await h.getFile();
  return { name: f.name, size: f.size, lastModified: f.lastModified };
}

export async function fileHead(h: FileSystemFileHandle, n: number): Promise<Uint8Array> {
  const q = quick(h);
  return q ? q.head(n) : new Uint8Array(await (await h.getFile()).slice(0, n).arrayBuffer());
}
