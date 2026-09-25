/* In-memory FileSystemDirectoryHandle (the subset GLUE uses): Node tests, and read-only views of a
   collection synced from another device (ADR 0040).
   createWritable() buffers and only replaces the file on close(), like the real API. */
type Node = MemDir | MemFile;
const notFound = (n: string) => Object.assign(new Error('Not found: ' + n), { name: 'NotFoundError' });

export class MemFile {
  readonly kind = 'file';
  data: Uint8Array = new Uint8Array(0);
  lastModified = Date.now();
  constructor(readonly name: string) {}
  async getFile(): Promise<File> { return new File([this.data.slice()], this.name, { lastModified: this.lastModified }); }
  async createWritable() {
    const parts: Uint8Array[] = [];
    const self = this;
    return {
      async write(chunk: string | Uint8Array | ArrayBuffer | Blob) {
        if (typeof chunk === 'string') parts.push(new TextEncoder().encode(chunk));
        else if (chunk instanceof Blob) parts.push(new Uint8Array(await chunk.arrayBuffer()));
        else parts.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
      },
      async close() {
        let n = 0; for (const p of parts) n += p.length;
        const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
        self.data = out; self.lastModified = Date.now();
      },
      async abort() { parts.length = 0; },
    };
  }
}

export class MemDir {
  readonly kind = 'directory';
  children = new Map<string, Node>();
  constructor(readonly name = '') {}
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MemDir> {
    const c = this.children.get(name);
    if (c instanceof MemDir) return c;
    if (c) throw Object.assign(new Error('Type mismatch'), { name: 'TypeMismatchError' });
    if (!opts?.create) throw notFound(name);
    const d = new MemDir(name); this.children.set(name, d); return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MemFile> {
    const c = this.children.get(name);
    if (c instanceof MemFile) return c;
    if (c) throw Object.assign(new Error('Type mismatch'), { name: 'TypeMismatchError' });
    if (!opts?.create) throw notFound(name);
    const f = new MemFile(name); this.children.set(name, f); return f;
  }
  async removeEntry(name: string) { if (!this.children.delete(name)) throw notFound(name); }
  async *entries(): AsyncIterable<[string, Node]> { for (const e of this.children) yield e; }
  async *values(): AsyncIterable<Node> { for (const v of this.children.values()) yield v; }

  /** Test helper: write a file at a '/'-path. */
  async put(path: string, data: string | Uint8Array) {
    const parts = path.split('/'); let d: MemDir = this;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const f = await d.getFileHandle(parts[parts.length - 1], { create: true });
    f.data = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  }
  /** Test helper: list every file path. */
  paths(prefix = ''): string[] {
    const out: string[] = [];
    for (const [n, c] of this.children) c instanceof MemDir ? out.push(...c.paths(prefix + n + '/')) : out.push(prefix + n);
    return out.sort();
  }
}

export const asDir = (d: MemDir) => d as unknown as FileSystemDirectoryHandle;
