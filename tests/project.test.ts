import { describe, expect, it } from 'vitest';
import { analysisHere, analysisShared, collectionHere, collectionShared, meFor, toLocal, toShared, writesFor, type SharedCollection, type SharedTrack } from '../src/core/shared/project';
import { foldComputer, needsFold, strayIds } from '../src/core/shared/repair';
import type { AnalysisSummary, Track } from '../src/store/types';

const here = (me: string) => ({ me, collection: 'c1', members: { desk: { profile: 'pdesk', name: 'Desktop' }, lap: { profile: 'plap', name: 'Laptop' } } });
const shared: SharedTrack = {
  id: 't1', fileName: 'a.mp3', title: 'Song', artist: 'A', album: '', genre: 'House', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', rating: 4,
  copies: { desk: { status: 'linked', rootId: 'r1', relPath: 'Sets/a.mp3', importPath: null, size: 10, mtime: 1, sources: ['s1'] } },
} as SharedTrack;

describe('a shared collection as this computer sees it (ADR 0094)', () => {
  it('its own copy becomes the song’s usual fields', () => {
    const t = toLocal(shared, here('desk'));
    expect(t).toMatchObject({ id: 't1', rootId: 'r1', relPath: 'Sets/a.mp3', status: 'linked', sources: ['s1'], rating: 4 });
    expect(t.remote).toBeUndefined();
  });
  it('another computer’s song is a remote row pointing at it, with its profile', () => {
    const t = toLocal(shared, here('lap'));
    expect(t).toMatchObject({ rootId: null, relPath: null, status: 'linked', onDevices: ['Desktop'], remote: { device: 'desk', name: 'Desktop', profile: 'pdesk', collection: 'c1', id: 't1' } });
  });
  it('back to the shared record: this computer’s copy from the song, the others’ kept; another’s song adds no copy', () => {
    const lapTrack: Track = { ...toLocal(shared, here('desk')), rootId: 'r9', relPath: 'x/a.mp3' };
    const s = toShared(lapTrack, here('lap'), shared);
    expect(Object.keys(s.copies).sort()).toEqual(['desk', 'lap']);
    expect(s.copies.lap).toMatchObject({ rootId: 'r9', relPath: 'x/a.mp3' });
    expect(s.copies.desk).toEqual(shared.copies.desk);
    expect((s as unknown as Track).rootId).toBeUndefined();
    const edited = { ...toLocal(shared, here('lap')), rating: 5 };
    const s2 = toShared(edited, here('lap'), shared);
    expect(s2.copies).toEqual(shared.copies);
    expect(s2.rating).toBe(5);
    expect((s2 as unknown as Track).remote).toBeUndefined();
  });
  it('analyses and music folders per computer', () => {
    const a = { v: 3, bpm: 120 } as never, b = { v: 3, bpm: 121 } as never;
    expect(analysisHere({ desk: a }, 'lap')).toBe(a);
    expect(analysisHere({ desk: a, lap: b }, 'lap')).toBe(b);
    expect(analysisShared(b, 'lap', { desk: a })).toEqual({ desk: a, lap: b });
    const c = collectionShared({ schemaVersion: 1, id: 'c1', name: 'My collection', createdAt: '', roots: [{ id: 'r1' } as never] }, 'desk', undefined, { profile: 'pdesk', name: 'Desktop' });
    expect(collectionHere(c, 'desk').roots).toEqual([{ id: 'r1' }]);
    expect(collectionHere(c, 'lap').roots).toEqual([]);
    expect(collectionShared(collectionHere(c, 'lap'), 'lap', c, { profile: 'plap', name: 'Laptop' }).rootsBy).toEqual({ desk: [{ id: 'r1' }] });   // no music folder, no song: not a member
  });
  it('song info changed on one computer: the others are told to write it into their files (ADR 0097)', () => {
    const prev: SharedTrack = { id: 't1', title: 'Old', artist: 'A', copies: { desk: { status: 'linked', rootId: 'r1', relPath: 'a.mp3', size: 1, mtime: 1, sources: [] } as never, lap: { status: 'linked', rootId: 'r9', relPath: 'b.mp3', size: 1, mtime: 1, sources: [] } as never } } as never;
    const hereLap = { me: 'lap', collection: 'c1', members: { desk: { profile: 'pd', name: 'Desktop' }, lap: { profile: 'pl', name: 'Laptop' } } };
    const t = { ...toLocal(prev, hereLap), title: 'New', rating: 4 };
    const s = toShared(t, hereLap, prev);
    expect(s.copies.desk.unwritten).toEqual(['title']);
    expect(s.copies.lap.unwritten).toBeUndefined();            // this computer's own: the edit itself says
    expect(toShared({ ...t, title: 'Old' }, hereLap, prev).copies.desk.unwritten).toBeUndefined();   // a rating only: nothing to write
  });
  it('which member a GLUE folder is', () => {
    const c = { members: { desk: { profile: 'pd', name: 'Desktop' }, lap: { profile: 'pl', name: 'Laptop' } } };
    expect(meFor(c, 'pl', 'desk')).toBe('desk');
    expect(meFor(c, 'pl', 'home-x')).toBe('lap');
    expect(meFor(c, 'pz', 'new')).toBe('new');
    // Never the old stand-in, even when its entry names this folder.
    expect(meFor({ members: { 'this-computer': { profile: 'pd', name: 'This computer' } } }, 'pd')).toBeNull();
  });
  it('one id per computer (ADR 0108): only the GLUE folder recorded for a computer writes its parts; an unknown one writes none', () => {
    const prev = collectionShared({ schemaVersion: 1, id: 'c1', name: 'My collection', createdAt: '', roots: [{ id: 'r1' } as never] }, 'desk', undefined, { profile: 'pdesk', name: 'Desktop' });
    expect(writesFor(prev, 'desk', 'pdesk')).toBe(true);
    expect(writesFor(prev, 'desk', 'pedge')).toBe(false);    // another browser's own GLUE folder on the same computer
    expect(writesFor(prev, 'lap', 'plap')).toBe(true);       // a computer not yet a member
    expect(writesFor(prev, '', 'pdesk')).toBe(false);
    expect(writesFor(prev, 'this-computer', 'pdesk')).toBe(false);
    // The other folder, holding the desktop's songs in view, rewrites neither its entry nor its folders.
    const edge = collectionShared({ schemaVersion: 1, id: 'c1', name: 'My collection', createdAt: '', roots: [] }, 'desk', prev, { profile: 'pedge', name: 'Desktop' }, true);
    expect(edge.members.desk).toEqual({ profile: 'pdesk', name: 'Desktop' });
    expect(edge.rootsBy.desk).toEqual([{ id: 'r1' }]);
    // The right folder still updates its own entry, even to no folders at all.
    expect(collectionShared({ schemaVersion: 1, id: 'c1', name: 'My collection', createdAt: '', roots: [] }, 'desk', prev, { profile: 'pdesk', name: 'Desktop' }).rootsBy.desk).toEqual([]);
    // An unknown computer: no copy, no analysis, no entry.
    const unknown = collectionShared({ schemaVersion: 1, id: 'c1', name: 'My collection', createdAt: '', roots: [{ id: 'incoming' } as never] }, 'this-computer', prev, { profile: 'pdesk', name: 'This computer' });
    expect(Object.keys(unknown.members)).toEqual(['desk']);
    expect(Object.keys(unknown.rootsBy)).toEqual(['desk']);
    expect(Object.keys(toShared(toLocal(shared, here('desk')), { ...here('desk'), me: '' }, shared).copies)).toEqual(['desk']);
    expect(Object.keys(toShared({ ...toLocal(shared, here('desk')), relPath: 'moved.mp3' }, { ...here('desk'), me: 'this-computer' }, shared).copies)).toEqual(['desk']);
    expect(analysisShared({ v: 3 } as never, '', { desk: { v: 3 } as never })).toEqual({ desk: { v: 3 } });
  });
});

describe('the desktop’s parts written under a stand-in, put back (ADR 0108)', () => {
  const song = (id: string, added: string, copies: SharedTrack['copies']) => ({ id, fileName: id + '.wav', title: id, artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: 1, format: null, addedAt: added, copies } as SharedTrack);
  const copy = (rootId: string, relPath: string) => ({ status: 'linked', rootId, relPath, importPath: null, size: 1, mtime: 1, sources: [] } as never);
  // Shaped like the user's collection on 2026-09-30: the desktop (mmJiL) claimed by Edge's folder, a stand-in
  // written by the desktop's own folder, the laptop untouched.
  const meta = {
    schemaVersion: 1, id: 'bf92', name: 'My collection', createdAt: '', shared: true,
    members: { lap: { profile: 'plap', name: 'INW Laptop' }, mmJiL: { profile: 'pedge', name: 'Desktop' }, 'this-computer': { profile: 'b2df', name: 'This computer' } },
    rootsBy: { lap: [], mmJiL: [{ id: 'incoming', hidden: true }, { id: 'music' }], 'this-computer': [{ id: 'incoming', hidden: true }] },
  } as unknown as SharedCollection;
  const input = () => ({
    meta,
    tracks: new Map<string, SharedTrack>([
      ['a', song('a', '2026-09-01', { mmJiL: copy('music', 'a.wav'), 'this-computer': copy('music', 'a.wav') })],   // a phantom: same file
      ['b', song('b', '2026-09-01', { mmJiL: copy('incoming', 'b.wav') })],
      ['b2', song('b2', '2026-09-30', { 'this-computer': copy('incoming', 'b.wav') })],                            // TO BE SORTED twice
      ['c', song('c', '2026-09-01', { 'this-computer': copy('music', 'c.wav') })],                                 // only under the stand-in
      ['l', song('l', '2026-09-01', { lap: copy('lr', 'l.wav') })],
    ]),
    analysis: new Map<string, Record<string, AnalysisSummary>>([
      ['a', { mmJiL: { v: 3, at: 1 } as unknown as AnalysisSummary, 'this-computer': { v: 3, at: 2 } as unknown as AnalysisSummary }],
      ['l', { lap: { v: 3, at: 1 } as unknown as AnalysisSummary }],
    ]),
    sources: [{ id: 's1', computer: 'this-computer' } as never, { id: 's2', computer: 'lap' } as never],
  });
  it('knows when there’s something to put right, and what isn’t its own', () => {
    expect(strayIds(meta, 'mmJiL', 'b2df')).toEqual(['this-computer']);
    expect(needsFold(input(), 'mmJiL', 'b2df')).toBe(true);
    expect(needsFold({ ...input(), meta: { ...meta, members: { lap: meta.members.lap, mmJiL: { profile: 'b2df', name: 'Desktop' } }, rootsBy: { lap: [], mmJiL: [] } }, tracks: new Map(), analysis: new Map(), sources: [] }, 'mmJiL', 'b2df')).toBe(false);
  });
  it('folds the stand-in into the computer: copies, analyses, folders, libraries, its entry; twins named', () => {
    const r = foldComputer(input(), 'mmJiL', 'b2df');
    expect(r.meta.members).toEqual({ lap: { profile: 'plap', name: 'INW Laptop' }, mmJiL: { profile: 'b2df', name: 'Desktop' } });
    expect(Object.keys(r.meta.rootsBy).sort()).toEqual(['lap', 'mmJiL']);
    expect(r.meta.rootsBy.mmJiL.map(x => x.id)).toEqual(['incoming', 'music']);
    expect(r.tracks.get('a')!.copies).toEqual({ mmJiL: copy('music', 'a.wav') });
    expect(r.tracks.get('c')!.copies).toEqual({ mmJiL: copy('music', 'c.wav') });
    expect(r.tracks.has('l')).toBe(false);
    expect(r.analysis.get('a')).toEqual({ mmJiL: { v: 3, at: 2 } });
    expect(r.analysis.has('l')).toBe(false);
    expect(r.sources).toEqual([{ id: 's1', computer: 'mmJiL' }]);
    expect(r.twins).toEqual([['b2', 'b']]);
    expect(r.counts).toEqual({ copiesMoved: 2, copiesDropped: 1, analysesMoved: 1, twins: 1 });
    // Nothing is left under the stand-in.
    expect(JSON.stringify([r.meta, [...r.tracks.values()], [...r.analysis.values()], r.sources])).not.toContain('this-computer');
  });
});
