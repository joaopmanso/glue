import { describe, expect, it } from 'vitest';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { HomeDisk, HomeFile } from '../src/platform/homeDisk';
import { scanFolder } from '../src/core/library/scan';
import { fileHead, fileMeta } from '../src/core/library/files';
import { newId, type Track } from '../src/store/types';
import { MemDir, MemFile } from './memfs';

/** A stand-in for GLUE Home's local link (home/src-tauri/src/disk.rs): the same /fs/* answers, over
    in-memory folders, counting the bytes it sends. */
function fakeHome(roots: Record<string, MemDir>, token = 'tok') {
  const seen = { bytes: 0, calls: [] as string[] };
  const fail = (code: number, error: string) => new Response(JSON.stringify({ error }), { status: code });
  const walk = async (root: MemDir, path: string) => {
    let node: MemDir | MemFile = root;
    for (const part of path.split('/').filter(Boolean)) {
      if (part === '..' || part === '.') throw fail(400, 'bad path');
      if (!(node instanceof MemDir)) throw fail(404, 'not found');
      const next: MemDir | MemFile | undefined = node.children.get(part);
      if (!next) throw fail(404, 'not found');
      node = next;
    }
    return node;
  };
  const parentOf = async (root: MemDir, path: string, create: boolean) => {
    const parts = path.split('/').filter(Boolean), name = parts.pop()!;
    let d = root;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return { d, name };
  };
  const entry = (name: string, n: MemDir | MemFile) => ({ name, kind: n instanceof MemDir ? 'directory' : 'file', size: n instanceof MemFile ? n.data.length : 0, mtime: n instanceof MemFile ? n.lastModified : 0 });
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input)), q = url.searchParams, headers = new Headers(init?.headers);
    seen.calls.push(url.pathname);
    if ((headers.get('x-glue-token') ?? q.get('t')) !== token) return fail(401, 'not allowed');
    if (url.pathname === '/fs/roots') return Response.json({ glue: 'G', incoming: 'I', folders: {}, sep: '/' });
    const root = roots[q.get('root') ?? ''];
    if (!root) return fail(403, 'not a folder GLUE Home may use');
    const path = q.get('path') ?? '';
    try {
      switch (url.pathname) {
        case '/fs/stat': { const n = await walk(root, path); return Response.json(entry(n.name, n)); }
        case '/fs/list': { const n = await walk(root, path); if (!(n instanceof MemDir)) return fail(409, 'a file'); return Response.json([...n.children].map(([k, v]) => entry(k, v))); }
        case '/fs/mkdir': { const parts = path.split('/').filter(Boolean); let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create: true }); return Response.json({}); }
        case '/fs/write': {
          const { d, name } = await parentOf(root, path, true);
          if (d.children.get(name) instanceof MemDir) return fail(409, 'a folder');
          const f = await d.getFileHandle(name, { create: true });
          f.data = new Uint8Array(await new Response(init?.body ?? null).arrayBuffer()); f.lastModified = Date.now();
          return Response.json(entry(name, f));
        }
        case '/fs/remove': {
          const { d, name } = await parentOf(root, path, false);
          const n = d.children.get(name);
          if (!n) return fail(404, 'not found');
          if (n instanceof MemDir && n.children.size && q.get('recursive') !== '1') return fail(500, 'not empty');
          d.children.delete(name); return Response.json({});
        }
        case '/fs/file': {
          const n = await walk(root, path);
          if (!(n instanceof MemFile)) return fail(409, 'a folder');
          const m = /bytes=(\d+)-(\d*)/.exec(headers.get('range') ?? '');
          const body = m ? n.data.slice(+m[1], m[2] ? +m[2] + 1 : undefined) : n.data;
          seen.bytes += body.length;
          return new Response(body.slice(), { status: m ? 206 : 200, headers: { 'x-glue-mtime': String(n.lastModified) } });
        }
      }
    } catch (e) {
      if (e instanceof Response) return e;
      if ((e as Error).name === 'NotFoundError') return fail(404, 'not found');
      throw e;
    }
    return fail(404, 'not found');
  };
  return { handler, seen };
}

function withFetch<T>(f: typeof fetch, run: () => Promise<T>) {
  const was = globalThis.fetch;
  globalThis.fetch = f;
  return run().finally(() => { globalThis.fetch = was; });
}

const track = (over: Partial<Track> = {}): Track => ({
  id: newId(), status: 'linked', rootId: 'r1', relPath: 'a/b.flac', importPath: null, fileName: 'b.flac', size: 10, mtime: 1,
  title: 'T', artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 200, format: null,
  addedAt: '2026-09-26', sources: [], ...over,
});

describe('GLUE Home as the disk (ADR 0051)', () => {
  it('the store saves and reloads through GLUE Home, with the same files as on a local folder', async () => {
    const glue = new MemDir(), { handler } = fakeHome({ G: glue });
    await withFetch(handler as typeof fetch, async () => {
      const dir = new HomeDisk('http://127.0.0.1:47400', 'tok').dir('G');
      const home = await HomeStore.open(dir);
      const p = await home.createProfile('João'), c = await home.createCollection(p, 'Club');
      const s = await CollectionStore.load(dir, p.id, c.id);
      const ts = Array.from({ length: 20 }, () => track());
      s.putTracks(ts);
      await s.flush();
      s.removeTrack(ts[0].id);
      await s.flush();
      const again = await CollectionStore.load(dir, p.id, c.id);
      expect([...again.tracks.keys()].sort()).toEqual(ts.slice(1).map(t => t.id).sort());
      expect(glue.paths().some(x => x.includes('.glue-tmp'))).toBe(false);
    });
  });

  it('a scan reads sizes, dates and tags without downloading whole songs', async () => {
    const music = new MemDir();
    const big = new Uint8Array(3_000_000); big.set([0x49, 0x44, 0x33], 0);   // "ID3…" and 3 MB of audio
    await music.put('House/One.mp3', big);
    await music.put('House/Two.mp3', big);
    await music.put('notes.txt', 'not a song');
    const { handler, seen } = fakeHome({ M: music });
    await withFetch(handler as typeof fetch, async () => {
      const dir = new HomeDisk('http://127.0.0.1:47400', 'tok').dir('M');
      const { files } = await scanFolder(dir);
      expect(files.map(f => f.relPath).sort()).toEqual(['House/One.mp3', 'House/Two.mp3']);
      for (const f of files) {
        expect((await fileMeta(f.handle)).size).toBe(3_000_000);
        expect((await fileHead(f.handle, 1024)).length).toBe(1024);
      }
      expect(seen.bytes).toBe(2 * 1024);
      // Playing or analysing still gets the whole file.
      expect((await files[0].handle.getFile()).size).toBe(3_000_000);
    });
  });

  it('answers like the browser: missing is NotFoundError, a folder is not a file, the token is needed', async () => {
    const glue = new MemDir();
    await glue.put('profiles/x.json', '{}');
    const { handler } = fakeHome({ G: glue });
    await withFetch(handler as typeof fetch, async () => {
      const dir = new HomeDisk('http://127.0.0.1:47400', 'tok').dir('G');
      await expect(dir.getFileHandle('nope.json')).rejects.toMatchObject({ name: 'NotFoundError' });
      await expect(dir.getFileHandle('profiles')).rejects.toMatchObject({ name: 'TypeMismatchError' });
      const f = await (await dir.getDirectoryHandle('profiles')).getFileHandle('x.json');
      expect(f).toBeInstanceOf(HomeFile);
      expect(await (await f.getFile()).text()).toBe('{}');
      const wrong = new HomeDisk('http://127.0.0.1:47400', 'guess').dir('G');
      await expect(wrong.getFileHandle('profiles')).rejects.toThrow(/not allowed/);
    });
  });
});
