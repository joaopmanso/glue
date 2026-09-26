/* GLUE Home's disk (ADR 0051): on a computer where GLUE Home runs, the website reads and writes its
   GLUE folder and music folders through GLUE Home's local link instead of the browser's folder
   handles, so it needs no folder permission. These handles have the shape of the browser's (the
   subset GLUE uses, like store/memdir), so the store, scans and playback work on them unchanged.
   Sizes and dates come with each folder listing, so a scan never downloads a whole song. */

export interface HomeRoots { glue: string | null; incoming: string; folders: Record<string, string>; sep: string }
type Entry = { name: string; kind: 'file' | 'directory'; size: number; mtime: number };

const domError = (name: string, message: string) => Object.assign(new Error(message), { name });

export class HomeDisk {
  constructor(private base: string, private token: string) {}

  async call(path: string, params: Record<string, string>, init: RequestInit = {}): Promise<Response> {
    // The token in the address, not a header: requests stay "simple", with no CORS preflight each.
    const r = await fetch(this.base + path + '?' + new URLSearchParams({ ...params, t: this.token }), init);
    if (r.ok) return r;
    const msg = (await r.json().catch(() => ({})) as { error?: string }).error || 'GLUE Home said no (' + r.status + ')';
    // The same errors the browser's handles throw, so fsx and the store treat them alike.
    throw r.status === 404 ? domError('NotFoundError', msg) : r.status === 409 ? domError('TypeMismatchError', msg) : r.status === 403 ? domError('NotAllowedError', msg) : new Error(msg);
  }
  async json<T>(path: string, params: Record<string, string>, init?: RequestInit): Promise<T> { return (await this.call(path, params, init)).json() as Promise<T>; }

  roots() { return this.json<HomeRoots>('/fs/roots', {}); }
  /** This computer's folder dialog, shown by GLUE Home: the GLUE folder, or a collection's music folder. */
  pick(as: 'glue' | `folder:${string}`, title: string, start?: string) {
    return this.json<{ path: string | null; name?: string }>('/fs/pick', { as, title, ...(start ? { start } : {}) }, { method: 'POST' });
  }
  /** A root (the GLUE folder, a music folder, the incoming folder) as a folder handle. */
  dir(root: string): FileSystemDirectoryHandle {
    return new HomeDir(this, root, '', root.split(/[\\/]/).filter(Boolean).pop() ?? root) as unknown as FileSystemDirectoryHandle;
  }
  /** A file's URL on the local link (for <audio src>: plays and seeks with byte ranges). */
  fileUrl(root: string, path: string) { return this.base + '/fs/file?' + new URLSearchParams({ root, path, t: this.token }); }
}

const join = (a: string, b: string) => a ? a + '/' + b : b;

export class HomeDir {
  readonly kind = 'directory';
  constructor(readonly disk: HomeDisk, readonly root: string, readonly path: string, readonly name: string) {}
  private at(name: string) { return join(this.path, name); }

  // Whole paths in one request each (store/fsx uses these when they're there); the same answers as
  // walking there one folder at a time.
  /** A file's text, or null if it isn't there. */
  async readAt(path: string): Promise<string | null> {
    try { return await (await this.disk.call('/fs/file', { root: this.root, path: this.at(path) })).text(); }
    catch (e) { if ((e as Error).name === 'NotFoundError') return null; throw e; }
  }
  /** Write a file, making its folders. */
  async writeAt(path: string, data: BodyInit) { await this.disk.call('/fs/write', { root: this.root, path: this.at(path) }, { method: 'POST', body: data }); }
  async removeAt(path: string) {
    try { await this.disk.call('/fs/remove', { root: this.root, path: this.at(path), recursive: '1' }, { method: 'POST' }); }
    catch (e) { if ((e as Error).name !== 'NotFoundError') throw e; }
  }
  /** The names of a folder's files or folders, sorted; none if it isn't there. */
  async listAt(path: string, kind: 'file' | 'directory'): Promise<string[]> {
    try { return (await this.disk.json<Entry[]>('/fs/list', { root: this.root, path: this.at(path) })).filter(e => e.kind === kind).map(e => e.name).sort(); }
    catch (e) { if ((e as Error).name === 'NotFoundError') return []; throw e; }
  }
  private async stat(path: string) { return this.disk.json<Entry>('/fs/stat', { root: this.root, path }); }

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<HomeDir> {
    const path = this.at(name);
    if (opts?.create) await this.disk.call('/fs/mkdir', { root: this.root, path }, { method: 'POST' });
    else if ((await this.stat(path)).kind !== 'directory') throw domError('TypeMismatchError', name + ' is a file');
    return new HomeDir(this.disk, this.root, path, name);
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<HomeFile> {
    const path = this.at(name);
    try {
      const e = await this.stat(path);
      if (e.kind !== 'file') throw domError('TypeMismatchError', name + ' is a folder');
      return new HomeFile(this.disk, this.root, path, name, e);
    } catch (e) {
      if (!opts?.create || (e as Error).name !== 'NotFoundError') throw e;
      // Like the browser: an empty file exists from now on.
      const made = await this.disk.json<Entry>('/fs/write', { root: this.root, path }, { method: 'POST', body: new Uint8Array(0) });
      return new HomeFile(this.disk, this.root, path, name, made);
    }
  }
  async removeEntry(name: string, opts?: { recursive?: boolean }) {
    await this.disk.call('/fs/remove', { root: this.root, path: this.at(name), ...(opts?.recursive ? { recursive: '1' } : {}) }, { method: 'POST' });
  }
  async *entries(): AsyncIterable<[string, HomeDir | HomeFile]> {
    const list = await this.disk.json<Entry[]>('/fs/list', { root: this.root, path: this.path });
    for (const e of list) yield [e.name, e.kind === 'directory' ? new HomeDir(this.disk, this.root, this.at(e.name), e.name) : new HomeFile(this.disk, this.root, this.at(e.name), e.name, e)];
  }
  async *values() { for await (const [, h] of this.entries()) yield h; }
  async *keys() { for await (const [n] of this.entries()) yield n; }
  async isSameEntry(other: unknown) { return other instanceof HomeDir && other.root === this.root && other.path === this.path; }
  /** The path of a handle inside this folder, or null (like the browser's). */
  async resolve(h: unknown): Promise<string[] | null> {
    if (!(h instanceof HomeDir || h instanceof HomeFile) || h.root !== this.root) return null;
    if (!this.path) return h.path.split('/');
    return h.path.startsWith(this.path + '/') ? h.path.slice(this.path.length + 1).split('/') : null;
  }
  // GLUE Home decides what may be read: nothing to ask the user.
  async queryPermission() { return 'granted' as const; }
  async requestPermission() { return 'granted' as const; }
}

export class HomeFile {
  readonly kind = 'file';
  constructor(readonly disk: HomeDisk, readonly root: string, readonly path: string, readonly name: string, private meta: { size: number; mtime: number }) {}
  /** Size and date, from the listing (no download). */
  get size() { return this.meta.size; }
  get lastModified() { return this.meta.mtime; }
  async getFile(): Promise<File> {
    const r = await this.disk.call('/fs/file', { root: this.root, path: this.path });
    const mtime = Number(r.headers.get('x-glue-mtime')) || this.meta.mtime;
    return new File([await r.blob()], this.name, { type: r.headers.get('content-type') ?? '', lastModified: mtime });
  }
  /** The first bytes only (a byte-range request): tags, headers. */
  async head(n: number): Promise<Uint8Array> {
    if (!this.meta.size) return new Uint8Array(0);
    const r = await this.disk.call('/fs/file', { root: this.root, path: this.path }, { headers: { range: 'bytes=0-' + (Math.min(n, this.meta.size) - 1) } });
    return new Uint8Array(await r.arrayBuffer());
  }
  /** Written in one go on close (GLUE Home writes a temporary file and puts it over the old one). */
  async createWritable() {
    const parts: BlobPart[] = [];
    const self = this;
    return {
      async write(chunk: string | BufferSource | Blob) { parts.push(chunk as BlobPart); },
      async close() { self.meta = await self.disk.json<Entry>('/fs/write', { root: self.root, path: self.path }, { method: 'POST', body: new Blob(parts) }); },
      async abort() { parts.length = 0; },
    };
  }
  async isSameEntry(other: unknown) { return other instanceof HomeFile && other.root === this.root && other.path === this.path; }
  async queryPermission() { return 'granted' as const; }
  async requestPermission() { return 'granted' as const; }
}
