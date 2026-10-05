/* The shared sync's reference for GLUE Home's Rust sync (crates/glue-engine/src/sync.rs, ADR 0155): scenarios run
   through the website's own syncShared (src/store/shared/engine.ts) against GLUE Cloud's real code on an in-memory
   database (tests/sharedCloud.ts), recording every call to GLUE Cloud with its answer, and this device's GLUE folder
   after each sync, into tests/golden/sync/<scenario>.json. crates/glue-engine/tests/sync_golden.rs replays them:
   the same calls in the same order (an entry's or a checkpoint's packed text compared unpacked: gzip's bytes differ
   between implementations), and the same files, byte for byte. Fails when what it records isn't what's committed.
   Regenerate (on purpose): GOLDEN=1 npx vitest run tests/sync.golden.test.ts */
import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { syncShared, unpackText, type SharedCloud } from '../src/store/shared/engine';
import type { Dir } from '../src/store/fsx';
import { SharedCloudServer } from './sharedCloud';

const OUT = join(__dirname, 'golden', 'sync');

/** A GLUE folder in memory, by whole paths (fsx's "direct" folder, as GLUE Home's disk is). */
function memDir(files: Record<string, string> = {}) {
  const m = new Map(Object.entries(files));
  return {
    files: m,
    async readAt(p: string) { return m.get(p) ?? null; },
    async writeAt(p: string, data: string | Blob) { m.set(p, typeof data === 'string' ? data : await data.text()); },
    async removeAt(p: string) { for (const k of [...m.keys()]) if (k === p || k.startsWith(p + '/')) m.delete(k); },
    async listAt(p: string, kind: 'file' | 'directory') {
      const pre = p ? p + '/' : '', out = new Set<string>();
      for (const k of m.keys()) {
        if (!k.startsWith(pre)) continue;
        const rest = k.slice(pre.length), i = rest.indexOf('/');
        if (kind === 'directory' && i >= 0) out.add(rest.slice(0, i));
        if (kind === 'file' && i < 0) out.add(rest);
      }
      return [...out].sort();
    },
  };
}
const asDir = (d: ReturnType<typeof memDir>) => d as unknown as Dir;
const snapshot = (d: ReturnType<typeof memDir>) => Object.fromEntries([...d.files.entries()].sort(([a], [b]) => a < b ? -1 : 1));

type Call = { call: string; args: unknown[]; answer: unknown };
/** GLUE Cloud as `dev` sees it, every call written down (packed texts unpacked); `hook` runs before a call goes through
    (another device acting meanwhile) and may change its answer. */
function recorded(server: SharedCloudServer, cid: string, dev: string, calls: Call[], hook?: (call: string, n: number) => Promise<void>, answer?: (call: string, n: number, a: unknown) => unknown): SharedCloud {
  const c = server.cloudFor(cid, dev), n: Record<string, number> = {};
  const go = async <T>(call: string, args: unknown[], f: () => Promise<T>, shown: unknown[] = args): Promise<T> => {
    const i = n[call] = (n[call] ?? 0) + 1;
    await hook?.(call, i);
    let a = await f();
    if (answer) a = answer(call, i, a) as Awaited<T>;
    calls.push({ call, args: shown, answer: a });
    return a;
  };
  const lines = async (body: string) => Promise.all(body.split('\n').filter(Boolean).map(async l => { const [p, h, s, d] = l.split('\t'); return [p, h, Number(s), d === '-' ? '-' : await unpackText(d)]; }));
  return {
    changes: since => go('changes', [since], () => c.changes(since)),
    bundle: paths => go('bundle', [paths], () => c.bundle(paths)),
    log: since => go('log', [since], () => c.log(since)),
    append: async (b, paths, data) => go('append', [b, paths, data], () => c.append(b, paths, data), [b, paths, await unpackText(data)]),
    touched: to => go('touched', [to], () => c.touched(to)),
    checkpoint: async (at, body, done) => go('checkpoint', [at, body, done], () => c.checkpoint(at, body, done), [at, await lines(body), done]),
  };
}

const J = (v: unknown) => JSON.stringify(v);
const base = 'profiles/p1/collections/c1';
const song = (id: string, o: Record<string, unknown> = {}) => ({ id, fileName: id + '.flac', title: 'Song ' + id, artist: 'Artist', album: '', genre: 'House', label: '', comment: '', year: '2020', duration: 300, format: null, addedAt: '2026-01-01T10:00:00.000Z', tags: ['warm'],
  copies: { desk: { status: 'linked', rootId: 'r1', relPath: 'Sets/' + id + '.flac', importPath: null, size: 1000, mtime: 5, sources: [] } }, ...o });
const meta = J({ schemaVersion: 1, id: 'c1', name: 'Shared', createdAt: '2026-01-01T00:00:00.000Z', shared: true, rootsBy: { desk: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'h1', addedAt: '' }] }, members: { desk: { profile: 'p1', name: 'Desktop' }, lap: { profile: 'p9', name: 'Laptop' } } });
const shard = (items: Record<string, unknown>) => J({ schemaVersion: 1, items });

interface Run { hint: string[] | null; edit?: Record<string, string | null>; calls: Call[]; changed: string[]; clashes: unknown[]; pushed: number; after: Record<string, string> }
interface Golden { me: string; pid: string; cid: string; files: Record<string, string>; runs: Run[] }

/** One sync of `dev`'s folder, recorded. */
async function run(server: SharedCloudServer, dir: ReturnType<typeof memDir>, me: string, hint: string[] | null, edit: Record<string, string | null> | undefined, hook?: (call: string, n: number) => Promise<void>, answer?: (call: string, n: number, a: unknown) => unknown): Promise<Run> {
  for (const [k, v] of Object.entries(edit ?? {})) { if (v === null) dir.files.delete(k); else dir.files.set(k, v); }
  const calls: Call[] = [], changed: string[] = [];
  const r = await syncShared({ root: asDir(dir), pid: 'p1', cid: 'c1', me, cloud: recorded(server, 'c1', me, calls, hook, answer) }, hint ?? undefined, changed);
  return { hint, ...(edit ? { edit } : {}), calls, changed: r.changed, clashes: r.clashes, pushed: r.pushed, after: snapshot(dir) };
}
/** Another device's own sync (not recorded): its changes reach GLUE Cloud. */
async function other(server: SharedCloudServer, dir: ReturnType<typeof memDir>, edit: Record<string, string | null>) {
  for (const [k, v] of Object.entries(edit)) { if (v === null) dir.files.delete(k); else dir.files.set(k, v); }
  await syncShared({ root: asDir(dir), pid: 'p9', cid: 'c1', me: 'lap', cloud: server.cloudFor('c1', 'lap') });
}
const lapBase = 'profiles/p9/collections/c1';
const lapEdit = (d: ReturnType<typeof memDir>, path: string, f: (v: { items: Record<string, Record<string, unknown>> }) => void) => {
  const v = JSON.parse(d.files.get(lapBase + '/' + path)!); f(v); return { [lapBase + '/' + path]: JSON.stringify(v) };
};

async function scenarios(): Promise<Record<string, Golden>> {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date'] });
  const out: Record<string, Golden> = {};

  // A device's first sync (from GLUE Cloud's snapshot), its own changes sent up, then both sides changing the same
  // song: merged, a clash kept, the merge sent up.
  {
    const server = new SharedCloudServer();
    await server.seed('c1', 'Shared', {
      'collection.json': { text: meta, rev: 1 },
      'tracks/ab.json': { text: shard({ ab01: song('ab01'), ab02: song('ab02', { rating: 3 }) }), rev: 2 },
      'lists/l1.json': { text: J({ schemaVersion: 1, id: 'l1', kind: 'playlist', name: 'Warm up', parentId: null, position: 0, notes: '', items: ['ab01', 'ab02'], origin: null }), rev: 3 },
    }, 'desk', 3);
    const desk = memDir(), lap = memDir();
    const runs: Run[] = [];
    runs.push(await run(server, desk, 'desk', null, undefined));
    await other(server, lap, {});
    const t = (o: Record<string, unknown>) => JSON.parse(desk.files.get(base + '/tracks/ab.json')!) as { items: Record<string, Record<string, unknown>> } & typeof o;
    const mine = t({}); mine.items.ab01.rating = 5; mine.items.ab01.tags = ['warm', 'vocal']; mine.items.cd03 = song('cd03');
    runs.push(await run(server, desk, 'desk', ['tracks/ab.json', 'lists/l2.json'], {
      [base + '/tracks/ab.json']: J(mine),
      [base + '/lists/l2.json']: J({ schemaVersion: 1, id: 'l2', kind: 'playlist', name: 'Peak', parentId: null, position: 1, notes: 'é "q" \\ ✓', items: ['cd03'], origin: null }),
    }));
    // The laptop renames ab01 and drops ab02 from the playlist; the desktop renames ab01 too, and adds a song to it.
    await other(server, lap, {});
    await other(server, lap, { ...lapEdit(lap, 'tracks/ab.json', v => { v.items.ab01.title = 'Laptop title'; v.items.ab02.tags = ['warm', 'peak']; }), [lapBase + '/lists/l1.json']: J({ ...JSON.parse(lap.files.get(lapBase + '/lists/l1.json')!), items: ['ab01'] }) });
    const now = t({}); now.items.ab01.title = 'Desktop title'; now.items.ab02.tags = [];
    runs.push(await run(server, desk, 'desk', null, {
      [base + '/tracks/ab.json']: J(now),
      [base + '/lists/l1.json']: J({ ...JSON.parse(desk.files.get(base + '/lists/l1.json')!), items: ['ab01', 'ab02', 'cd03'] }),
    }));
    out.both = { me: 'desk', pid: 'p1', cid: 'c1', files: {}, runs };
  }

  // A push that lands on a stale revision (the laptop pushed meanwhile): pulled, merged and sent again; GLUE Cloud then
  // asks for the log to be folded into the snapshot (a checkpoint), and a file deleted here goes as deleted.
  {
    const server = new SharedCloudServer();
    await server.seed('c1', 'Shared', {
      'collection.json': { text: meta, rev: 1 },
      'tracks/ab.json': { text: shard({ ab01: song('ab01') }), rev: 1 },
      'events.json': { text: J({ schemaVersion: 1, items: { e1: { id: 'e1', name: 'Gig' } } }), rev: 1 },
    }, 'desk', 1);
    const desk = memDir(), lap = memDir();
    const runs: Run[] = [];
    runs.push(await run(server, desk, 'desk', null, undefined));
    await other(server, lap, {});
    const mine = JSON.parse(desk.files.get(base + '/tracks/ab.json')!); mine.items.ab01.rating = 4;
    const lapFirst = async (call: string, n: number) => { if (call === 'append' && n === 1) await other(server, lap, lapEdit(lap, 'tracks/ab.json', v => { v.items.ef05 = song('ef05', { copies: {} }); })); };
    const compact = (call: string, n: number, a: unknown) => call === 'append' && n === 2 ? { ...(a as object), compact: true } : a;
    runs.push(await run(server, desk, 'desk', ['tracks/ab.json', 'events.json'], { [base + '/tracks/ab.json']: J(mine), [base + '/events.json']: null }, lapFirst, compact));
    out.stale = { me: 'desk', pid: 'p1', cid: 'c1', files: {}, runs };
  }
  vi.useRealTimers();
  return out;
}

describe('the shared sync, recorded for GLUE Home’s', () => {
  it('records each scenario (or matches the recording)', async () => {
    const all = await scenarios();
    mkdirSync(OUT, { recursive: true });
    for (const [name, g] of Object.entries(all)) {
      const file = join(OUT, name + '.json'), text = JSON.stringify(g, null, 1) + '\n';
      if (process.env.GOLDEN || !existsSync(file)) writeFileSync(file, text);
      else expect(text, name + ': GOLDEN=1 npx vitest run tests/sync.golden.test.ts, then port the change to Rust').toBe(readFileSync(file, 'utf8'));
    }
  });
});
