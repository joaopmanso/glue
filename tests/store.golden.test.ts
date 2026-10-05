/* The library store's reference for GLUE Home's Rust store (crates/glue-store, ADR 0152): scenarios run through the
   website's own CollectionStore over a folder in memory (the clock fixed), every file recorded after each save, into
   tests/golden/store/<scenario>/{scenario,expected}.json. crates/glue-store/tests/golden.rs replays the same steps
   and must write the same bytes. This test fails when what it records isn't what's committed: a change to the
   TypeScript store has to be made in Rust too. Regenerate (on purpose): GOLDEN=1 npx vitest run tests/store.golden.test.ts */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CollectionStore, type StoreOp } from '../src/store/collection';
import { absorbTracks } from '../src/store/merge';
import type { Track } from '../src/store/types';
import type { Dir } from '../src/store/fsx';

const OUT = join(__dirname, 'golden', 'store');
const NOW = 1_700_000_000_000;

/** A GLUE folder in memory, by whole paths (fsx's "direct" folder, as GLUE Home's disk is). */
function memDir(files: Record<string, string>) {
  const m = new Map(Object.entries(files));
  const d = {
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
  return d;
}

type Step =
  | { load: { pid: string; cid: string; me?: string; name?: string; shownOnly?: boolean } }
  | { op: StoreOp }
  | { fold: { into: string; name?: string } }
  /** The last fold's twins folded together (store/merge absorbTracks), as GLUE Home's engine does after a repair. */
  | { absorb: true }
  | { reload: string[]; files: Record<string, string> }
  | { flush: true };
interface Scenario { files: Record<string, string>; steps: Step[] }

const J = (v: unknown) => JSON.stringify(v);
const track = (id: string, o: Record<string, unknown> = {}) => ({ id, status: 'linked', rootId: 'r1', relPath: 'Sets/' + id + '.flac', importPath: null, fileName: id + '.flac', size: 1000, mtime: 5, title: 'Song ' + id, artist: 'Artist', album: 'Album', genre: 'House', label: '', comment: '', year: '2020', duration: 300, format: null, addedAt: '2026-01-0' + (id.charCodeAt(3) % 9 + 1) + 'T10:00:00.000Z', sources: [], ...o });
const summary = (o: Record<string, unknown> = {}) => ({ v: 3, at: '2026-09-01T00:00:00.000Z', grade: 'ok', label: 'Lossless', headline: 'Fine', fc: 21000.5, wall: false, full: true, effBits: 16, declaredBits: 16, origin: '', bpm: 124.5, key: { tonic: 3, mode: 'minor', margin: 0.12, tuning: -1.2921495033191304 }, findings: [], fileSize: 1000, fileMtime: 5, ...o });
const base = 'profiles/p1/collections/c1';
const shard = (items: Record<string, unknown>, schema = true) => J(schema ? { schemaVersion: 1, items } : { items });

const plain: Scenario = {
  files: {
    [base + '/collection.json']: J({ schemaVersion: 1, id: 'c1', name: 'My collection', createdAt: '2026-01-01T00:00:00.000Z', roots: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'h1', addedAt: '2026-01-01T00:00:00.000Z' }] }),
    [base + '/tracks/ab.json']: shard({ ab01: track('ab01', { rating: 4.5, tags: ['peak'] }), ab02: track('ab02') }),
    // Numbers as ids (JavaScript puts them first in an object), and a shard without schemaVersion.
    [base + '/tracks/12.json']: shard({ '12x': track('12x'), '1234': track('1234') }, false),
    [base + '/analysis/ab.json']: shard({ ab01: summary(), ab02: summary({ bpm: null, key: null }) }),
    // A list without schemaVersion (it gets one, last).
    [base + '/lists/l1.json']: J({ id: 'l1', kind: 'folder', name: 'Sets', parentId: null, position: 0, notes: '', items: [], origin: null }),
    [base + '/lists/l2.json']: J({ schemaVersion: 1, id: 'l2', kind: 'playlist', name: 'Warm up', parentId: 'l1', position: 0, notes: 'é "quoted" \\ ✓', items: ['ab01', 'ab02', '1234'], origin: null, color: null }),
    [base + '/lists/l3.json']: J({ schemaVersion: 1, id: 'l3', kind: 'playlist', name: 'Peak', parentId: null, position: 1, notes: '', items: ['ab02'], origin: null }),
    [base + '/sources/s1.json']: J({ schemaVersion: 1, id: 's1', kind: 'rekordbox', name: 'rekordbox', path: 'C:\\x\\rekordbox.xml', addedAt: '2026-01-01T00:00:00.000Z' }),
    [base + '/events.json']: J({ schemaVersion: 1, items: { e1: { id: 'e1', name: 'Gig', date: '2026-10-10' } } }),
  },
  steps: [
    { load: { pid: 'p1', cid: 'c1' } },
    { op: { m: 'tracks', ts: [track('ab01', { title: 'Renamed', rating: 5, tags: ['peak', 'vocal'], edited: ['title'] }), track('cd03', { size: 0.1 + 0.2, mtime: 1e21, duration: 0.000001 })] } as StoreOp },
    { op: { m: 'analysis', id: 'cd03', a: summary({ bpm: 128 }) } as unknown as StoreOp },
    { op: { m: 'removeTrack', id: 'ab02' } },
    { op: { m: 'list', l: { schemaVersion: 1, id: 'l4', kind: 'playlist', name: 'New', parentId: 'l1', position: 1, notes: '', items: ['cd03', '12x'], origin: null } } as unknown as StoreOp },
    { flush: true },
    { op: { m: 'deleteList', id: 'l1' } },
    { op: { m: 'event', e: { id: 'e2', name: 'Party', date: '2026-12-31' } } as unknown as StoreOp },
    { op: { m: 'deleteEvent', id: 'e1' } },
    { op: { m: 'source', s: { schemaVersion: 1, id: 's2', kind: 'engine', name: 'Engine DJ', path: 'F:\\Engine Library', addedAt: '2026-02-01T00:00:00.000Z' } } as unknown as StoreOp },
    { op: { m: 'deleteSource', id: 's1' } },
    { op: { m: 'meta', meta: { schemaVersion: 1, id: 'c1', name: 'Renamed collection', createdAt: '2026-01-01T00:00:00.000Z', roots: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'h1', addedAt: '2026-01-01T00:00:00.000Z' }], autoAnalyse: true } } as unknown as StoreOp },
    { op: { m: 'removeTrack', id: '1234' } },
    { flush: true },
  ],
};

// A shared collection (ADR 0094): two computers, desk (this folder, profile p1) and lap (profile p9).
const sharedMeta = { schemaVersion: 1, id: 'c1', name: 'Shared', createdAt: '2026-01-01T00:00:00.000Z', shared: true,
  rootsBy: { desk: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'h1', addedAt: '2026-01-01T00:00:00.000Z' }], lap: [{ id: 'r9', name: 'Laptop music', absPath: null, handleKey: 'h9', addedAt: '2026-01-02T00:00:00.000Z' }] },
  members: { desk: { profile: 'p1', name: 'Desktop' }, lap: { profile: 'p9', name: 'Laptop' } } };
const copy = (root: string, rel: string, o: Record<string, unknown> = {}) => ({ status: 'linked', rootId: root, relPath: rel, importPath: null, size: 1000, mtime: 5, sources: [], ...o });
const common = (id: string, o: Record<string, unknown> = {}) => { const t = track(id, o) as Record<string, unknown>; for (const k of ['status', 'rootId', 'relPath', 'importPath', 'size', 'mtime', 'sources']) delete t[k]; return t; };
const sharedFiles = (extra: Record<string, string> = {}) => ({
  [base + '/collection.json']: J(sharedMeta),
  [base + '/tracks/ab.json']: shard({
    ab01: { ...common('ab01'), copies: { desk: copy('r1', 'a.flac'), lap: copy('r9', 'Sets/a.flac') } },
    ab02: { ...common('ab02'), copies: { desk: copy('r1', 'b.flac') } },
    ab03: { ...common('ab03'), copies: { lap: copy('r9', 'c.flac', { status: 'missing' }) } },
    ab04: { ...common('ab04'), copies: { lap: copy('r9', 'd.flac', { fileKey: 'file:abc' }), zed: copy('rz', 'd.flac') } },
  }),
  [base + '/analysis/ab.json']: shard({ ab01: { desk: summary(), lap: summary({ bpm: 125 }) }, ab03: { lap: summary({ at: '2026-09-02T00:00:00.000Z' }) } }),
  [base + '/lists/l2.json']: J({ schemaVersion: 1, id: 'l2', kind: 'playlist', name: 'Both', parentId: null, position: 0, notes: '', items: ['ab01', 'ab02', 'ab03'], origin: null }),
  ...extra,
});
const sharedDesk: Scenario = {
  files: sharedFiles(),
  steps: [
    { load: { pid: 'p1', cid: 'c1', me: 'desk' } },
    // Song info changed here: lap's copy is told to write it into its file (ADR 0097); zed has a fileKey (not told).
    { op: { m: 'tracks', ts: [{ ...track('ab01', { rootId: 'r1', relPath: 'a.flac', title: 'New title', genre: 'Techno' }), onDevices: ['Desktop', 'Laptop'] }, { ...track('ab04', { rootId: null, relPath: null, title: 'Theirs edited', status: 'linked' }), remote: { device: 'lap', name: 'Laptop' } }] } as unknown as StoreOp },
    { op: { m: 'analysis', id: 'ab02', a: summary({ bpm: 99 }) } as unknown as StoreOp },
    // Both have it: only desk's copy goes (ADR 0100). Only desk has it: it goes, and leaves the playlist.
    { op: { m: 'removeTrack', id: 'ab01' } },
    { op: { m: 'removeTrack', id: 'ab02' } },
    { op: { m: 'meta', meta: { schemaVersion: 1, id: 'c1', name: 'Shared, renamed', createdAt: '2026-01-01T00:00:00.000Z', roots: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'h1', addedAt: '2026-01-01T00:00:00.000Z' }, { id: 'r2', name: 'More', absPath: null, handleKey: 'h2', addedAt: '2026-03-01T00:00:00.000Z' }] } } as unknown as StoreOp },
    { op: { m: 'source', s: { schemaVersion: 1, id: 's2', kind: 'engine', name: 'Engine DJ', path: 'F:\\Engine Library', addedAt: '2026-02-01T00:00:00.000Z' } } as unknown as StoreOp },
    { flush: true },
  ],
};
// The same folder opened as the laptop would be shown it, by a GLUE folder that isn't lap's (ADR 0108): nothing of
// lap's is written, and removing does nothing.
const sharedNotMine: Scenario = {
  files: sharedFiles(),
  steps: [
    { load: { pid: 'p1', cid: 'c1', me: 'lap' } },
    { op: { m: 'tracks', ts: [track('ab03', { rootId: 'r9', relPath: 'c.flac', title: 'Edited from the wrong folder' })] } as unknown as StoreOp },
    { op: { m: 'analysis', id: 'ab03', a: summary({ bpm: 1 }) } as unknown as StoreOp },
    { op: { m: 'removeTrack', id: 'ab01' } },
    { op: { m: 'meta', meta: { schemaVersion: 1, id: 'c1', name: 'Shared', createdAt: '2026-01-01T00:00:00.000Z', roots: [] } } as unknown as StoreOp },
    { flush: true },
  ],
};
// The old stand-in (ADR 0108): this folder's parts were written under 'this-computer' and under 'old' (whose entry
// names this folder); GLUE Home knows it's 'desk'.
const fold: Scenario = {
  files: {
    [base + '/collection.json']: J({ ...sharedMeta, rootsBy: { ...sharedMeta.rootsBy, 'this-computer': [{ id: 'r5', name: 'Stand-in music', absPath: null, handleKey: 'h5', addedAt: '2026-01-03T00:00:00.000Z' }, { id: 'r1', name: 'Music', absPath: null, handleKey: 'h1', addedAt: '2026-01-01T00:00:00.000Z' }] }, members: { ...sharedMeta.members, old: { profile: 'p1', name: 'Old desk' }, 'this-computer': { profile: 'p1', name: 'This computer' } } }),
    [base + '/tracks/ab.json']: shard({
      ab01: { ...common('ab01'), copies: { 'this-computer': copy('r1', 'a.flac'), lap: copy('r9', 'a.flac') } },
      ab02: { ...common('ab02', { addedAt: '2026-01-01T09:00:00.000Z' }), copies: { desk: copy('r1', 'b.flac'), old: copy('r1', 'b2.flac') } },
      ab05: { ...common('ab05', { addedAt: '2026-01-05T09:00:00.000Z' }), copies: { 'this-computer': copy('r1', 'b.flac') } },
      Ab06: { ...common('Ab06', { addedAt: '2026-01-05T09:00:00.000Z' }), copies: { old: copy('r1', 'b.flac') } },
    }),
    [base + '/analysis/ab.json']: shard({ ab01: { 'this-computer': summary({ at: '2026-09-05T00:00:00.000Z' }), desk: summary({ at: '2026-09-01T00:00:00.000Z' }) }, ab02: { old: summary({ at: '2026-08-01T00:00:00.000Z' }), desk: summary({ at: '2026-09-01T00:00:00.000Z' }) } }),
    [base + '/sources/s1.json']: J({ schemaVersion: 1, id: 's1', kind: 'rekordbox', name: 'rekordbox', path: 'x', addedAt: '2026-01-01T00:00:00.000Z', computer: 'this-computer', tracks: [{ trackId: 'ab05', key: '1' }, { trackId: 'ab02', key: '2' }] }),
    [base + '/lists/l2.json']: J({ schemaVersion: 1, id: 'l2', kind: 'playlist', name: 'Twins', parentId: null, position: 0, notes: '', items: ['ab05', 'ab02', 'Ab06', 'ab01'], origin: null }),
  },
  steps: [
    { load: { pid: 'p1', cid: 'c1', shownOnly: true } },
    { fold: { into: 'desk', name: 'Desktop' } },
    { flush: true },
    { absorb: true },
    { flush: true },
  ],
};
const damaged: Scenario = {
  files: { ...plain.files, [base + '/tracks/cd.json']: '{"schemaVersion":1,"items":{"cd09":', [base + '/lists/l9.json']: '   ' },
  steps: [{ load: { pid: 'p1', cid: 'c1' } }, { op: { m: 'removeTrack', id: 'ab01' } }, { flush: true }],
};
// A sync changed files (ADR 0094): read again, nothing marked; then an edit writes from what was read.
const reload: Scenario = {
  files: sharedFiles(),
  steps: [
    { load: { pid: 'p1', cid: 'c1', me: 'desk' } },
    { reload: ['tracks/ab.json', 'collection.json', 'lists/l2.json', 'analysis/ab.json'], files: {
      [base + '/tracks/ab.json']: shard({ ab02: { ...common('ab02', { title: 'From the cloud' }), copies: { desk: copy('r1', 'b.flac') } }, ab07: { ...common('ab07'), copies: { lap: copy('r9', 'g.flac') } } }),
      [base + '/collection.json']: J({ ...sharedMeta, name: 'Renamed elsewhere', members: { ...sharedMeta.members, phone: { profile: 'px', name: 'Phone' } } }),
      [base + '/analysis/ab.json']: shard({ ab07: { lap: summary({ bpm: 77 }) } }),
    } },
    { flush: true },
    { op: { m: 'tracks', ts: [track('ab02', { rootId: 'r1', relPath: 'b.flac', title: 'Edited after' })] } as unknown as StoreOp },
    { op: { m: 'analysis', id: 'ab02', a: summary({ bpm: 66 }) } as unknown as StoreOp },
    { flush: true },
  ],
};
// A new computer opens the shared collection from its own folder (no member yet): it joins on the next save.
const joins: Scenario = {
  files: Object.fromEntries(Object.entries(sharedFiles()).map(([k, v]) => [k.replace('profiles/p1/', 'profiles/p7/'), v])),
  steps: [
    { load: { pid: 'p7', cid: 'c1', me: 'newpc', name: 'New PC' } },
    { op: { m: 'tracks', ts: [track('ef01', { rootId: 'r7', relPath: 'new.flac' })] } as unknown as StoreOp },
    { op: { m: 'meta', meta: { schemaVersion: 1, id: 'c1', name: 'Shared', createdAt: '2026-01-01T00:00:00.000Z', roots: [{ id: 'r7', name: 'New music', absPath: null, handleKey: 'h7', addedAt: '2026-04-01T00:00:00.000Z' }] } } as unknown as StoreOp },
    { flush: true },
  ],
};

const SCENARIOS: Record<string, Scenario> = { plain, 'shared-desk': sharedDesk, 'shared-not-mine': sharedNotMine, fold, damaged, reload, joins };

async function run(sc: Scenario) {
  const dir = memDir(sc.files), root = dir as unknown as Dir;
  let s: CollectionStore | null = null, twins: [string, string][] = [];
  const out: unknown[] = [];
  for (const st of sc.steps) {
    if ('load' in st) { const { pid, cid, ...opts } = st.load; s = await CollectionStore.load(root, pid, cid, opts); out.push({ damaged: s.damaged }); }
    else if ('op' in st) s!.apply(st.op);
    else if ('fold' in st) { const r = s!.foldComputer(st.fold.into, st.fold.name); twins = r?.twins ?? []; out.push({ fold: r }); }
    else if ('absorb' in st) { const m = new Map<string, Track>(); for (const [from, into] of twins) { const t = s!.tracks.get(into); if (t) m.set(from, t); } absorbTracks(s!, m); }
    else if ('reload' in st) { for (const [k, v] of Object.entries(st.files)) dir.files.set(k, v); await s!.reloadFiles(st.reload); }
    else { await s!.flush(); out.push({ files: Object.fromEntries([...dir.files].sort(([a], [b]) => (a < b ? -1 : 1))) }); }
  }
  return out;
}

describe('the library store, recorded for the Rust one (ADR 0152)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterAll(() => vi.useRealTimers());
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    it(name, async () => {
      const expected = await run(sc);
      const dir = join(OUT, name), file = join(dir, 'expected.json'), text = JSON.stringify(expected, null, 1) + '\n';
      if (process.env.GOLDEN || !existsSync(file)) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'scenario.json'), JSON.stringify(sc, null, 1) + '\n');
        writeFileSync(file, text);
      }
      expect(readFileSync(join(dir, 'scenario.json'), 'utf8')).toBe(JSON.stringify(sc, null, 1) + '\n');
      expect(readFileSync(file, 'utf8')).toBe(text);
    });
  }
});

// A backup GLUE Home's engine made before putting a shared collection right (crates/glue-store/src/backup.rs writes this
// file): the website restores it like one it made itself.
describe('a backup made in Rust', () => {
  it('reads as the website’s own', async () => {
    const { readBackup } = await import('../src/store/backup');
    const b = await readBackup(new Uint8Array(readFileSync(join(OUT, 'backup.zip'))));
    expect(b.manifest).toEqual({ format: 'mco-backup', version: 1, createdAt: '2026-10-05T00:00:00.000Z', schemaVersion: 1, profile: { id: 'p1', name: 'DJ', color: '#fff' }, collections: [{ id: 'c1', name: 'Main', tracks: 2 }] });
    const text = (p: string) => new TextDecoder().decode(b.entries.find(e => e.path === p)?.data);
    expect(b.entries.map(e => e.path).sort()).toEqual(['files/a.mp3', 'mco-backup.json', 'profile/collections/c1/collection.json', 'profile/collections/c1/tracks/ab.json', 'profile/profile.json']);
    expect(JSON.parse(text('profile/collections/c1/tracks/ab.json')).items.ab1.notes).toHaveLength(500);
    expect(text('files/a.mp3')).toBe('song');
  });
});
