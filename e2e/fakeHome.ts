/* A stand-in for GLUE Home's local link (home/src-tauri/src/local.rs + disk.rs, ADR 0048, 0051), over
   real folders in a temp dir, for e2e tests of Home mode. It can be stopped and started again, like
   quitting GLUE Home from the tray. Port 47450, away from a real GLUE Home (47400–47409). */
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

export interface FakeHomeDirs { glue: string; incoming: string; folders: Record<string, string> }

export class FakeHome {
  readonly port = 47450;
  readonly token = 'e2e-token';
  readonly device = 'e2e-home';
  /** Paths asked for, in order (to see which disk the page uses). */
  calls: string[] = [];
  private server: Server | null = null;
  constructor(readonly dirs: FakeHomeDirs) {}

  get pref() { return { home: this.device, port: this.port, token: this.token }; }

  start() {
    return new Promise<void>(ok => {
      this.server = createServer((req, res) => this.handle(req.url ?? '/', req.method ?? 'GET', req.headers, req, res));
      this.server.listen(this.port, '127.0.0.1', () => ok());
    });
  }
  stop() {
    return new Promise<void>(ok => { if (!this.server) return ok(); this.server.closeAllConnections(); this.server.close(() => ok()); this.server = null; });
  }

  private roots() { return [this.dirs.glue, this.dirs.incoming, ...Object.values(this.dirs.folders)].map(p => resolve(p)); }

  private handle(url: string, method: string, headers: Record<string, string | string[] | undefined>, req: NodeJS.ReadableStream, res: import('node:http').ServerResponse) {
    const u = new URL(url, 'http://127.0.0.1'), q = u.searchParams;
    this.calls.push(u.pathname);
    const origin = String(headers.origin ?? '');
    const send = (code: number, body: unknown, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Expose-Headers': 'content-range, x-glue-mtime' });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    if (method === 'OPTIONS') return send(204, '');
    if (u.pathname === '/hello') return send(200, { app: 'glue-home', version: '0.5.0', device: this.device });
    if (q.get('t') !== this.token) return send(401, { error: 'not allowed' });
    if (u.pathname === '/fs/roots') return send(200, { glue: this.dirs.glue, incoming: this.dirs.incoming, folders: this.dirs.folders, sep });
    if (u.pathname === '/incoming') {
      const list = readdirSync(this.dirs.incoming).filter(n => !n.endsWith('.part')).map(n => { const s = statSync(join(this.dirs.incoming, n)); return { name: n, size: s.size, mtime: Math.round(s.mtimeMs), path: join(this.dirs.incoming, n) }; });
      return send(200, list);
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
