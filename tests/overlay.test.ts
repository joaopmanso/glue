import { describe, expect, it } from 'vitest';
import { buildOverlay, overlayOps } from '../src/core/library/overlay';
import type { MemberData } from '../src/core/library/mergeCollections';
import { CollectionStore } from '../src/store/collection';
import { HomeStore } from '../src/store/home';
import { MemDir, asDir } from '../src/store/memdir';
import type { AnalysisSummary, Collection, List, Track } from '../src/store/types';

const T = (id: string, o: Partial<Track> = {}): Track => ({ id, status: 'linked', rootId: 'r', relPath: id + '.mp3', importPath: null, fileName: id + '.mp3', size: 1000, mtime: 1, title: 'T ' + id, artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', sources: [], ...o });
const L = (id: string, name: string, items: string[], o: Partial<List> = {}): List => ({ schemaVersion: 1, id, kind: 'playlist', name, parentId: null, position: 0, notes: '', items, origin: null, createdAt: '2026-01-01', ...o });
const meta = (id: string): Collection => ({ schemaVersion: 1, id, name: 'My collection', createdAt: '', roots: [] });
const A = (label: string) => ({ v: 3, at: '', grade: 'ok', label, headline: label, fc: 20000, wall: false, full: true, effBits: 16, declaredBits: 16, origin: '', bpm: 124, key: null, findings: [], fileSize: 1, fileMtime: 1 }) as AnalysisSummary;

describe('a merged collection in the local library (ADR 0042)', () => {
  const laptop: MemberData = { device: { id: 'lap', name: 'Laptop' }, profile: 'p1', collection: 'c1', meta: meta('c1'), analysis: new Map(), sources: [],
    tracks: [T('a1', { title: 'Hold On', artist: 'Kerri' }), T('a2', { title: 'Only laptop' })],
    lists: [L('lp', 'Friday', ['a1', 'a2']), L('mine', 'Laptop list', ['a2'])] };
  const desktop: MemberData = { device: { id: 'desk', name: 'Desktop' }, profile: 'p2', collection: 'c2', meta: meta('c2'), sources: [],
    analysis: new Map([['d2', A('Lossless')]]),
    tracks: [T('d1', { title: 'hold on', artist: 'KERRI', rating: 5 }), T('d2', { title: 'Only desktop' })],
    lists: [L('dp', 'friday', ['d2', 'd1']), L('dq', 'Desk only', ['d2'])] };
  const o = buildOverlay(laptop, [desktop], { id: 'g', name: 'My collection' });

  it('keeps this device’s tracks and adds only the songs it doesn’t have', () => {
    expect(o.tracks).toHaveLength(1);
    const r = o.tracks[0];
    expect(r).toMatchObject({ title: 'Only desktop', remote: { device: 'desk', name: 'Desktop' }, onDevices: ['Desktop'] });
    expect(r.id.startsWith('r')).toBe(true);
    expect(o.analysis.get(r.id)?.label).toBe('Lossless');
    expect(o.onDevices.get('a1')).toEqual(['Laptop', 'Desktop']);
    expect(o.onDevices.get('a2')).toEqual(['Laptop']);
    // For Duplicates: the songs on both devices, with each device's copy.
    expect([...o.copies.keys()]).toEqual(['a1']);
    expect(o.copies.get('a1')!.map(c => [c.device, c.track.id])).toEqual([['Laptop', 'a1'], ['Desktop', 'd1']]);
  });
  it('shows the other devices’ songs in shared playlists, and their own playlists', () => {
    const r = o.tracks[0].id;
    expect(o.extraItems.get('lp')).toEqual([r]);
    expect(o.extraItems.has('mine')).toBe(false);
    expect(o.lists.map(l => l.name)).toEqual(['Desk only']);
    expect(o.lists[0].items).toEqual([r]);
    // Rebuilding gives the same ids (a playlist here can keep another device's song).
    expect(buildOverlay(laptop, [desktop], { id: 'g', name: 'x' }).tracks[0].id).toBe(r);
  });
  it('sends edits of shared data to the owning device, in its own ids', () => {
    const r = o.tracks[0].id;
    const ops = overlayOps([
      { t: 'track', id: 'a1', rating: 3 },                 // on both: the desktop's copy too
      { t: 'track', id: r, tags: ['Peak'] },                // the desktop's song
      { t: 'track', id: 'a2', rating: 1 },                  // only here: nothing to send
      { t: 'list', list: L('lp', 'Friday', ['a1', 'a2', r]) },
      { t: 'list', list: L('new', 'Made here', [r]) },      // stays here
      { t: 'list-del', id: o.lists[0].id },
    ], o, 2);
    expect([...ops.keys()]).toEqual([1]);
    expect(ops.get(1)).toEqual([
      { t: 'track', id: 'd1', rating: 3 },
      { t: 'track', id: 'd2', tags: ['Peak'] },
      { t: 'list', list: expect.objectContaining({ id: 'dp', items: ['d1', 'd2'] }) },
      { t: 'list-del', id: 'dq' },
    ]);
  });
});

describe('the store never saves another device’s data', () => {
  it('keeps ephemeral tracks, analyses, lists and device names out of the files', async () => {
    const dir = new MemDir(), root = asDir(dir);
    const home = await HomeStore.open(root);
    const p = await home.createProfile('Nova');
    const c = await home.createCollection(p, 'My collection');
    const s = await CollectionStore.load(root, p.id, c.id);
    s.putTrack(T('aa1'));
    await s.flush();
    // The overlay: set straight into memory, as lib.applyOverlay does.
    s.ephemeral.add('raa9'); s.tracks.set('raa9', T('raa9', { remote: { device: 'desk', name: 'Desktop' } })); s.analysis.set('raa9', A('Lossless'));
    s.ephemeral.add('rl1'); s.lists.set('rl1', L('rl1', 'Desk only', ['raa9']));
    s.tracks.get('aa1')!.onDevices = ['Laptop', 'Desktop'];
    // Edits to them change memory only; an edit of a local track in the same shard saves just it.
    s.putTrack({ ...s.tracks.get('raa9')!, rating: 4 });
    s.putList({ ...s.lists.get('rl1')!, name: 'Renamed' });
    s.putTrack({ ...s.tracks.get('aa1')!, rating: 2 });
    s.deleteList('rl1');
    s.removeTrack('raa9');   // not removable here
    await s.flush();
    expect(s.tracks.get('raa9')?.rating).toBe(4);
    const again = await CollectionStore.load(root, p.id, c.id);
    expect([...again.tracks.keys()]).toEqual(['aa1']);
    expect(again.tracks.get('aa1')).toMatchObject({ rating: 2 });
    expect(again.tracks.get('aa1')!.onDevices).toBeUndefined();
    expect(again.analysis.size).toBe(0);
    expect(again.lists.size).toBe(0);
  });
});
