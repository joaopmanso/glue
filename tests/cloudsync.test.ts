import { describe, expect, it } from 'vitest';
import { apply, baseline, diff, type EditTarget } from '../src/core/library/cloudEdits';
import { mergeCollections, translate, type MemberData } from '../src/core/library/mergeCollections';
import type { Collection, List, Track } from '../src/store/types';

const T = (id: string, o: Partial<Track> = {}): Track => ({ id, status: 'linked', rootId: 'r', relPath: id + '.mp3', importPath: null, fileName: id + '.mp3', size: 1000, mtime: 1, title: 'T ' + id, artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', sources: [], ...o });
const L = (id: string, name: string, items: string[], o: Partial<List> = {}): List => ({ schemaVersion: 1, id, kind: 'playlist', name, parentId: null, position: 0, notes: '', items, origin: null, createdAt: '2026-01-01', ...o });
const meta = (id: string): Collection => ({ schemaVersion: 1, id, name: 'My collection', createdAt: '', roots: [] });
function target(tracks: Track[], lists: List[]): EditTarget {
  const s: EditTarget = { tracks: new Map(tracks.map(t => [t.id, t])), lists: new Map(lists.map(l => [l.id, l])),
    putTracks: ts => { for (const t of ts) s.tracks.set(t.id, t); }, putList: l => { s.lists.set(l.id, l); }, deleteList: id => { s.lists.delete(id); } };
  return s;
}

describe('cloud edits (ADR 0040)', () => {
  it('turns edits into operations and applies them on the owning device', () => {
    const tracks = [T('a'), T('b', { rating: 3 })], lists = [L('p1', 'Warm up', ['a']), L('p2', 'Old', ['b'])];
    const b = baseline(tracks, lists);
    const edited = [{ ...tracks[0], rating: 4.5, notes: 'great intro', tags: ['Peak'] }, { ...tracks[1] }];
    const ops = diff(b, edited, [{ ...lists[0], items: ['a', 'b'], name: 'Warm-up' }, L('p3', 'New one', ['b'])]);
    expect(ops).toEqual([
      { t: 'track', id: 'a', rating: 4.5, notes: 'great intro', tags: ['Peak'] },
      { t: 'list', list: expect.objectContaining({ id: 'p1', name: 'Warm-up', items: ['a', 'b'] }) },
      { t: 'list', list: expect.objectContaining({ id: 'p3' }) },
      { t: 'list-del', id: 'p2' },
    ]);
    const dev = target(tracks, lists);
    expect(apply(dev, [...ops, { t: 'track', id: 'unknown', rating: 1 }])).toBe(4);
    expect(dev.tracks.get('a')).toMatchObject({ rating: 4.5, notes: 'great intro', tags: ['Peak'] });
    expect(dev.lists.get('p1')?.items).toEqual(['a', 'b']);
    expect(dev.lists.has('p2')).toBe(false);
    expect(dev.lists.get('p3')?.name).toBe('New one');
  });
  it('clears fields, and drops playlist items the device does not have', () => {
    const dev = target([T('a', { rating: 5, notes: 'x', tags: ['Peak'] })], []);
    apply(dev, [{ t: 'track', id: 'a', rating: null, notes: null, tags: null }, { t: 'list', list: L('p', 'Mix', ['a', 'zzz'], { parentId: 'gone' }) }]);
    expect(dev.tracks.get('a')).toMatchObject({ rating: null });
    expect(dev.tracks.get('a')!.notes).toBeUndefined();
    expect(dev.tracks.get('a')!.tags).toBeUndefined();
    expect(dev.lists.get('p')).toMatchObject({ items: ['a'], parentId: null });
  });
});

describe('merged collections', () => {
  const laptop: MemberData = { device: { id: 'lap', name: 'Laptop' }, profile: 'p1', collection: 'c1', meta: meta('c1'), analysis: new Map(), sources: [],
    tracks: [T('a1', { title: 'Hold On', artist: 'Kerri', duration: 301, rating: 4 }), T('a2', { title: 'Only laptop', artist: 'X' })],
    lists: [L('lp', 'Friday', ['a1', 'a2'], { color: '#f00' })] };
  const desktop: MemberData = { device: { id: 'desk', name: 'Desktop' }, profile: 'p2', collection: 'c2', meta: meta('c2'), analysis: new Map(), sources: [],
    tracks: [T('d1', { title: 'Hold on', artist: 'KERRI', duration: 303, fileName: 'other.wav', tags: ['Vocal'] }), T('d2', { title: 'Only desktop', artist: 'Y' }), T('d3', { title: 'Hold On', artist: 'Kerri', duration: 420 })],
    lists: [L('dp', 'friday', ['d2', 'd1']), L('dq', 'Desk only', ['d2'])] };
  const mg = mergeCollections([laptop, desktop], { id: 'g1', name: 'Everything' });
  it('one row per song across devices, lengths within 3 s; playlists by place and name', () => {
    expect(mg.tracks).toHaveLength(4);                                   // Hold On twice merged; the 7-minute version stays apart
    const hold = mg.tracks.find(t => t.onDevices?.length === 2)!;
    expect(hold).toMatchObject({ rating: 4, onDevices: ['Laptop', 'Desktop'], tags: ['Vocal'] });
    expect(mg.lists.map(l => l.name).sort()).toEqual(['Desk only', 'Friday']);
    const fri = mg.lists.find(l => l.name === 'Friday')!;
    expect(fri.items).toHaveLength(3);                                   // Hold On, Only laptop, Only desktop
    expect(fri.color).toBe('#f00');
    expect(mg.meta).toMatchObject({ id: 'merged-g1', name: 'Everything' });
  });
  it('translates merged edits back to each device’s own ids', () => {
    const hold = mg.tracks.find(t => t.onDevices?.length === 2)!, fri = mg.lists.find(l => l.name === 'Friday')!, desk = mg.lists.find(l => l.name === 'Desk only')!;
    const out = translate([
      { t: 'track', id: hold.id, rating: 5 },
      { t: 'list', list: { ...fri, name: 'Friday night' } },
      { t: 'list-del', id: desk.id },
      { t: 'list', list: L('new1', 'Made in the merged view', [hold.id]) },
    ], mg, 2);
    expect(out.get(0)).toEqual([
      { t: 'track', id: 'a1', rating: 5 },
      { t: 'list', list: expect.objectContaining({ id: 'lp', name: 'Friday night', items: expect.arrayContaining(['a1', 'a2']) }) },
      { t: 'list', list: expect.objectContaining({ id: 'new1', items: ['a1'] }) },
    ]);
    expect(out.get(1)).toEqual([
      { t: 'track', id: 'd1', rating: 5 },
      { t: 'list', list: expect.objectContaining({ id: 'dp', items: expect.arrayContaining(['d1', 'd2']) }) },
      { t: 'list-del', id: 'dq' },
      { t: 'list', list: expect.objectContaining({ id: 'new1', items: ['d1'] }) },
    ]);
  });
});
