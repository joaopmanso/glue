/* A stand-in for GLUE Home's local link (home/src-tauri/src/local.rs + disk.rs, ADR 0048, 0051), over
   real folders in a temp dir, for e2e tests of Home mode. It can be stopped and started again, like
   quitting GLUE Home from the tray. Port 47450, away from a real GLUE Home (47400–47409). */
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

export interface FakeHomeDirs { glue: string; incoming: string; folders: Record<string, string> }

export class FakeHome {
  /** One per parallel worker: tests that each run a stand-in can run at the same time. */
  readonly port = 47450 + (Number(process.env.TEST_PARALLEL_INDEX) || 0);
  /** Its port for songs played (ADR 0141): the same link. */
  readonly playPort = 47550 + (Number(process.env.TEST_PARALLEL_INDEX) || 0);
  readonly token = 'e2e-token';
  /** The read-only token (a GLUE tab when GLUE Home is the engine, ADR 0104): no writes. */
  readonly readToken = 'e2e-read';
  /** Where /rpc goes (the test wires it to GLUE Home's service page); unset: 503. */
  rpc: ((body: string, read: boolean) => Promise<string>) | null = null;
  /** GLUE Home's own cache (the test wires it to the service page's), for /cache?key=. */
  cache: ((key: string) => Promise<number[] | null>) | null = null;
  /** Requests refused to the read-only token. */
  refused: string[] = [];
  readonly device = 'e2e-home';
  /** Paths asked for, in order (to see which disk the page uses). */
  calls: string[] = [];
  /** Files sent (/fs/file), by path in their root; " (part)" for a byte range. */
  reads: string[] = [];
  /** The same, asked on the port for songs played. */
  played: string[] = [];
  /** The drag dock's queue (ADR 0054), and whether it was shown. */
  dock: { root: string; path: string }[] = [];
  dockShown = false;
  /** DJ library files it follows (ADR 0065): each one's folder (a read-only root) and file; the next file its dialog picks. */
  libraries: { kind: string; dir: string; file: string }[] = [];
  pickFile: string | null = null;
  /** Where the dock window is on the screen (screen coordinates), for /dock/drop (ADR 0061). */
  dockRect: { x: number; y: number; w: number; h: number } | null = null;
  dockDrops: { x: number; y: number; on: boolean }[] = [];
  /** Duplicates put aside (moved into `duplicates`) and recycled (removed, their paths kept here), ADR 0070. */
  duplicates = '';
  trashed: string[] = [];
  /** Song info written into files (/fs/tags, ADR 0071): the file's path in its root, and the fields. The file is only touched. */
  tagWrites: { path: string; tags: Record<string, string> }[] = [];
  /** The writer lease (ADR 0087): when a tab last renewed it, and the edits counter it's told. */
  leasedAt = 0;
  edits = 0;
  /** /fs/tags answers this instead (a music folder GLUE Home can't reach, as local.rs says it). */
  tagsFail: { code: number; error: string } | null = null;
  /** Stop pressed in GLUE Home (running: false): the local link answers the website 503 (local.rs), as if quit. */
  stopped = false;
  private server: Server | null = null;
  private playServer: Server | null = null;
  constructor(readonly dirs: FakeHomeDirs) {}

  get pref() { return { home: this.device, port: this.port, token: this.token }; }

  start() {
    return new Promise<void>(ok => {
      this.server = createServer((req, res) => this.handle(req.url ?? '/', req.method ?? 'GET', req.headers, req, res));
      this.playServer = createServer((req, res) => this.handle(req.url ?? '/', req.method ?? 'GET', req.headers, req, res, true));
      this.playServer.listen(this.playPort, '127.0.0.1', () => this.server!.listen(this.port, '127.0.0.1', () => ok()));
    });
  }
  stop() {
    this.playServer?.closeAllConnections(); this.playServer?.close(); this.playServer = null;
    return new Promise<void>(ok => { if (!this.server) return ok(); this.server.closeAllConnections(); this.server.close(() => ok()); this.server = null; });
  }

  private roots() { return [this.dirs.glue, this.dirs.incoming, ...Object.values(this.dirs.folders), ...this.libraries.map(l => l.dir)].map(p => resolve(p)); }

  private handle(url: string, method: string, headers: Record<string, string | string[] | undefined>, req: NodeJS.ReadableStream, res: import('node:http').ServerResponse, play = false) {
    const u = new URL(url, 'http://127.0.0.1'), q = u.searchParams;
    if (this.stopped && method !== 'OPTIONS') {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': String(headers.origin ?? '*'), 'Access-Control-Allow-Private-Network': 'true' });
      return res.end(JSON.stringify({ error: 'GLUE Home is stopped' }));
    }
    this.calls.push(u.pathname);
    if (u.pathname === '/fs/file') (play ? this.played : this.reads).push((q.get('path') ?? '') + (headers.range ? ' (part)' : ''));
    const origin = String(headers.origin ?? '');
    const send = (code: number, body: unknown, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Expose-Headers': 'content-range, x-glue-mtime' });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    if (method === 'OPTIONS') return send(204, '');
    // The same version as /connect: an older one (it said 0.5.0) made the page say "needs GLUE Home 0.12" when its
    // /hello came first (CI, 2026-10-02).
    if (u.pathname === '/hello') return send(200, { app: 'glue-home', version: '0.37.0', device: this.device, playPort: this.playPort });
    // A GLUE page on this computer takes the link (ADR 0115).
    if (u.pathname === '/connect') return /^http:\/\/localhost:517\d$/.test(origin) ? send(200, { home: this.device, port: this.port, playPort: this.playPort, token: this.token, version: '0.37.0' }) : send(403, { error: 'not allowed' });
    const reading = q.get('t') === this.readToken;
    if (q.get('t') !== this.token && !reading) return send(401, { error: 'not allowed' });
    if (reading && ['/fs/write', '/fs/mkdir', '/fs/remove', '/fs/tags', '/fs/dupes', '/incoming/move'].includes(u.pathname)) { this.refused.push(u.pathname); return send(403, { error: 'read only' }); }
    if (u.pathname === '/cache') {
      if (!this.cache) return send(404, { error: 'not there' });
      void this.cache(q.get('key') ?? '').then(b => { if (!b) return send(404, { error: 'not there' }); res.writeHead(200, { 'content-type': 'application/octet-stream', 'access-control-allow-origin': String(headers.origin ?? '*') }); res.end(Buffer.from(b)); });
      return;
    }
    if (u.pathname === '/rpc' && method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        if (!this.rpc) return send(503, { error: 'GLUE Home’s service isn’t running' });
        void this.rpc(Buffer.concat(chunks).toString(), reading).then(a => { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': String(headers.origin ?? '*') }); res.end(a); }, e => send(500, { error: String(e) }));
      });
      return;
    }
    if (u.pathname === '/lease' && method === 'POST') { this.leasedAt = q.get('release') === '1' ? 0 : Date.now(); return send(200, { edits: this.edits }); }
    if (u.pathname === '/fs/roots') return send(200, { glue: this.dirs.glue, incoming: this.dirs.incoming, folders: this.dirs.folders, libraries: this.libraries, sep });
    if (u.pathname === '/fs/pickfile') {
      const f = this.pickFile;
      if (!f) return send(200, { path: null });
      const dir = resolve(f, '..'), file = basename(f);
      if (!this.libraries.some(l => l.dir === dir && l.file === file)) this.libraries.push({ kind: 'picked', dir, file });
      return send(200, { path: f, dir, file });
    }
    if (u.pathname === '/incoming') {
      const list = readdirSync(this.dirs.incoming).filter(n => !n.endsWith('.part')).map(n => { const s = statSync(join(this.dirs.incoming, n)); return { name: n, size: s.size, mtime: Math.round(s.mtimeMs), path: join(this.dirs.incoming, n) }; });
      return send(200, list);
    }
    if (u.pathname === '/dock/show' && method === 'POST') { this.dockShown = true; return send(200, {}); }
    if (u.pathname === '/dock/clear' && method === 'POST') { this.dock = []; return send(200, {}); }
    if (u.pathname === '/dock/drop' && method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(Buffer.from(c)));
      req.on('end', () => {
        const d = JSON.parse(Buffer.concat(chunks).toString() || '{}') as { x: number; y: number; items: { root: string; path: string }[] };
        const r = this.dockRect, on = !!r && d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h;
        this.dockDrops.push({ x: d.x, y: d.y, on });
        if (on) for (const i of d.items) if (!this.dock.some(x => x.root === i.root && x.path === i.path)) this.dock.push(i);
        send(200, on ? { on, songs: this.dock.length } : { on });
      });
      return;
    }
    if (u.pathname === '/dock' && method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(Buffer.from(c)));
      req.on('end', () => {
        const b = JSON.parse(Buffer.concat(chunks).toString() || '{}') as { mode?: string; items: { root: string; path: string }[] };
        if (b.mode !== 'add') this.dock = [];
        for (const i of b.items) if (!this.dock.some(d => d.root === i.root && d.path === i.path)) this.dock.push(i);
        send(200, { songs: this.dock.length });
      });
      return;
    }
    if (u.pathname === '/fs/dupes' && method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(Buffer.from(c)));
      req.on('end', () => {
        const b = JSON.parse(Buffer.concat(chunks).toString() || '{}') as { mode: 'move' | 'trash'; items: { root: string; path: string }[] };
        const music = [this.dirs.incoming, ...Object.values(this.dirs.folders)].map(x => resolve(x));
        const results = b.items.map(i => {
          const root = resolve(i.root), from = join(root, ...i.path.split('/'));
          if (!music.includes(root)) return { ok: false, error: 'not a music folder GLUE Home knows' };
          if (!existsSync(from)) return { ok: false, error: 'not found' };
          if (b.mode === 'trash') { rmSync(from); this.trashed.push(i.path); return { ok: true, to: null }; }
          const to = join(this.duplicates, basename(root), ...i.path.split('/'));
          mkdirSync(resolve(to, '..'), { recursive: true });
          renameSync(from, to);
          return { ok: true, to };
        });
        send(200, { results });
      });
      return;
    }
    if (u.pathname === '/fs/tags' && method === 'POST') {
      if (this.tagsFail) return send(this.tagsFail.code, { error: this.tagsFail.error });
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(Buffer.from(c)));
      req.on('end', () => {
        const b = JSON.parse(Buffer.concat(chunks).toString() || '{}') as { root: string; path: string; tags: Record<string, string> };
        const root = resolve(b.root), file = join(root, ...b.path.split('/'));
        if (![this.dirs.incoming, ...Object.values(this.dirs.folders)].map(x => resolve(x)).includes(root)) return send(403, { error: 'not a music folder GLUE Home knows' });
        if (!existsSync(file)) return send(500, { error: 'not a file' });
        this.tagWrites.push({ path: b.path, tags: b.tags });
        const at = new Date(Math.round(statSync(file).mtimeMs) + 5000);
        utimesSync(file, at, at);
        const st = statSync(file);
        send(200, { size: st.size, mtime: Math.round(st.mtimeMs) });
      });
      return;
    }
    if (u.pathname === '/folders') return send(200, Object.entries(this.dirs.folders).map(([id, p]) => ({ id, name: basename(p), collection: p })));
    if (u.pathname === '/incoming/move' && method === 'POST') {
      const to = this.dirs.folders[q.get('folder') ?? ''];
      if (!to) return send(400, { error: 'unknown folder' });
      const target = join(to, q.get('name')!);
      renameSync(join(this.dirs.incoming, q.get('name')!), target);
      return send(200, { path: target });
    }
    // /fs/*: inside a root only.
    const root = resolve(q.get('root') ?? '');
    if (!this.roots().includes(root)) return send(403, { error: 'not a folder GLUE Home may use' });
    const parts = (q.get('path') ?? '').split('/').filter(Boolean);
    if (parts.some(p => p === '..' || p === '.' || /[\\:]/.test(p))) return send(400, { error: 'bad path' });
    const target = join(root, ...parts);
    const entry = (name: string, p: string) => { const s = statSync(p); return { name, kind: s.isDirectory() ? 'directory' : 'file', size: s.isDirectory() ? 0 : s.size, mtime: Math.round(s.mtimeMs) }; };
    switch (u.pathname) {
      case '/fs/stat': return existsSync(target) ? send(200, entry(basename(target), target)) : send(404, { error: 'not found' });
      case '/fs/list': return existsSync(target) ? send(200, readdirSync(target).map(n => entry(n, join(target, n)))) : send(404, { error: 'not found' });
      case '/fs/mkdir': mkdirSync(target, { recursive: true }); return send(200, {});
      case '/fs/remove': if (!existsSync(target)) return send(404, { error: 'not found' }); rmSync(target, { recursive: q.get('recursive') === '1' }); return send(200, {});
      case '/fs/write': {
        const chunks: Buffer[] = [];
        req.on('data', c => chunks.push(Buffer.from(c)));
        req.on('end', () => { mkdirSync(join(target, '..'), { recursive: true }); writeFileSync(target, Buffer.concat(chunks)); send(200, entry(basename(target), target)); });
        return;
      }
      case '/fs/file': {
        if (!existsSync(target) || statSync(target).isDirectory()) return send(404, { error: 'not found' });
        const s = statSync(target), m = /bytes=(\d+)-(\d*)/.exec(String(headers.range ?? ''));
        const start = m ? +m[1] : 0, end = m && m[2] ? Math.min(+m[2], s.size - 1) : s.size - 1;
        res.writeHead(m ? 206 : 200, { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Expose-Headers': 'content-range, x-glue-mtime', 'x-glue-mtime': String(Math.round(s.mtimeMs)), ...(m ? { 'Content-Range': `bytes ${start}-${end}/${s.size}` } : {}) });
        createReadStream(target, { start, end }).pipe(res);
        return;
      }
    }
    send(404, { error: 'not found' });
  }
}
