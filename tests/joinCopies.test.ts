import { describe, expect, it } from 'vitest';
import { CollectionStore } from '../src/store/collection';
import { readJSON, writeJSON } from '../src/store/fsx';
import { applyScan, copiesToJoin, joinCopies } from '../src/store/merge';
import { SCHEMA, shardOf, type AnalysisSummary } from '../src/store/types';
import { MemDir, asDir } from './memfs';

// The user's report (2026-10-01, ADR 0130): a song added on the laptop and sent to the desktop's GLUE Home was
// two songs on the desktop, one per computer, shown as duplicates. It's one song with a copy on each.
const base = 'profiles/pdesk/collections/c1';
const copy = (rootId: string, relPath: string, size = 500) => ({ status: 'linked', rootId, relPath, importPath: null, size, mtime: 1, sources: [] });
const song = (id: string, fileName: string, copies: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  ({ id, fileName, title: id, artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: 200, format: null, addedAt: copies.lap ? '2026-10-01T10:00' : '2026-10-01T11:00', copies, ...over });
const summary = (bpm: number) => ({ bpm }) as unknown as AnalysisSummary;

/** The collection as each computer's GLUE folder holds it (the same files, synced), desktop and laptop. */
async function folder(songs: ReturnType<typeof song>[], analysis: Record<string, Record<string, AnalysisSummary>> = {}) {
  const mem = new MemDir(), root = asDir(mem);
  for (const base of ['profiles/pdesk/collections/c1', 'profiles/plap/collections/c1']) await write(root, base, songs, analysis);
  return { root, open: (me: 'desk' | 'lap' = 'desk') => CollectionStore.load(root, me === 'desk' ? 'pdesk' : 'plap', 'c1', { me }) };
}
async function write(root: ReturnType<typeof asDir>, base: string, songs: ReturnType<typeof song>[], analysis: Record<string, Record<string, AnalysisSummary>>) {
  await writeJSON(root, base + '/collection.json', {
    schemaVersion: SCHEMA, id: 'c1', name: 'Club', createdAt: '', shared: true,
    members: { lap: { profile: 'plap', name: 'Laptop' }, desk: { profile: 'pdesk', name: 'Desktop' } },
    rootsBy: { lap: [{ id: 'lr', name: 'Music' }], desk: [{ id: 'incoming', name: 'TO BE SORTED', hidden: true }, { id: 'dr', name: 'Music' }] },
  });
  const by = (items: Record<string, unknown>) => {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [id, v] of Object.entries(items)) (out[shardOf(id)] ??= {})[id] = v;
    return out;
  };
  for (const [sh, items] of Object.entries(by(Object.fromEntries(songs.map(s => [s.id, s]))))) await writeJSON(root, `${base}/tracks/${sh}.json`, { schemaVersion: SCHEMA, items });
  for (const [sh, items] of Object.entries(by(analysis))) await writeJSON(root, `${base}/analysis/${sh}.json`, { schemaVersion: SCHEMA, items });
}
const saved = async (root: ReturnType<typeof asDir>, dir: string, id: string) =>
  (await readJSON<{ items: Record<string, Record<string, unknown>> }>(root, `${base}/${dir}/${shardOf(id)}.json`))?.items[id];

describe('the same song on two computers is one song (ADR 0130)', () => {
  it('a song sent to this computer, found by the scan, is this computer’s copy of the laptop’s song', async () => {
    const { root, open } = await folder([song('s', 'Song.mp3', { lap: copy('lr', 'Song.mp3') })], { s: { lap: summary(124) } });
    const s = await open();
    expect(s.tracks.get('s')!.remote?.device).toBe('lap');
    // GLUE Home put it in the incoming folder as "Song (2).mp3" (the name was taken there).
    const r = applyScan(s, 'incoming', [{ relPath: 'Song (2).mp3', fileName: 'Song (2).mp3', size: 500, mtime: 9 }]);
    expect(r.added).toEqual([]);
    expect(s.tracks.size).toBe(1);
    const t = s.tracks.get('s')!;
    expect(t.remote).toBeUndefined();
    expect(t).toMatchObject({ rootId: 'incoming', relPath: 'Song (2).mp3', status: 'linked', onDevices: ['Laptop', 'Desktop'] });
    await s.flush();
    const st = await saved(root, 'tracks', 's') as { copies: Record<string, { relPath: string }> };
    expect(Object.keys(st.copies).sort()).toEqual(['desk', 'lap']);
    expect(st.copies.lap.relPath).toBe('Song.mp3');           // the laptop's copy as it was
    expect(st.copies.desk.relPath).toBe('Song (2).mp3');
  });

  it('two rows already made (one per computer) become one when the collection opens: playlists, rating and analysis kept', async () => {
    const { root, open } = await folder([
      song('s', 'Song.mp3', { lap: copy('lr', 'Song.mp3') }),
      song('d', 'Song (2).mp3', { desk: copy('incoming', 'Song (2).mp3') }, { rating: 4 }),
      song('other', 'Other.mp3', { desk: copy('dr', 'Other.mp3', 999) }),
    ], { s: { lap: summary(124) }, d: { desk: summary(125) } });
    await writeJSON(root, `${base}/lists/p1.json`, { schemaVersion: SCHEMA, id: 'p1', kind: 'playlist', name: 'Set', parentId: null, position: 0, notes: '', items: ['d', 'other'], origin: null, createdAt: '' });
    const s = await open();
    expect(copiesToJoin(s)).toEqual([['d', 's']]);
    expect(joinCopies(s)).toBe(1);
    expect([...s.tracks.keys()].sort()).toEqual(['other', 's']);
    expect(s.tracks.get('s')).toMatchObject({ rootId: 'incoming', relPath: 'Song (2).mp3', rating: 4, onDevices: ['Laptop', 'Desktop'] });
    expect(s.lists.get('p1')!.items).toEqual(['s', 'other']);
    expect(s.analysis.get('s')).toEqual(summary(125));      // this computer's own analysis of its copy
    await s.flush();
    expect(await saved(root, 'tracks', 'd')).toBeUndefined();
    expect(await saved(root, 'analysis', 's')).toEqual({ lap: summary(124), desk: summary(125) });
    expect(copiesToJoin(await open())).toEqual([]);           // nothing left to join
  });

  it('the computer whose song is older leaves the pair to the other, so both never drop each other’s', async () => {
    // Seen from the laptop: its song is the older one, so the desktop joins its copy into it, not the laptop.
    const { open } = await folder([
      song('s', 'Song.mp3', { lap: copy('lr', 'Song.mp3') }),
      song('d', 'Song (2).mp3', { desk: copy('incoming', 'Song (2).mp3') }),
    ]);
    expect(copiesToJoin(await open('desk'))).toEqual([['d', 's']]);
    expect(copiesToJoin(await open('lap'))).toEqual([]);
  });

  it('a different file, or a second copy on this computer, stays its own song', async () => {
    const { open } = await folder([
      song('s', 'Song.mp3', { lap: copy('lr', 'Song.mp3') }),
      song('big', 'Song.mp3', { desk: copy('dr', 'Song.mp3', 777) }),                // another size: another file
      song('mine', 'Mine.mp3', { desk: copy('dr', 'Mine.mp3'), lap: copy('lr', 'Mine.mp3') }),
    ]);
    const s = await open();
    expect(copiesToJoin(s)).toEqual([]);
    // A second copy of a song this computer already has: a duplicate here, not another computer's.
    const r = applyScan(s, 'dr', [{ relPath: 'Song.mp3', fileName: 'Song.mp3', size: 777, mtime: 1 }, { relPath: 'x/Mine.mp3', fileName: 'Mine.mp3', size: 500, mtime: 1 }]);
    expect(r.added.map(t => t.relPath)).toEqual(['x/Mine.mp3']);
  });

  it('only one of this computer’s copies joins a song; outside a shared collection nothing is joined', async () => {
    const { open } = await folder([
      song('s', 'Song.mp3', { lap: copy('lr', 'Song.mp3') }),
      song('d1', 'Song.mp3', { desk: copy('dr', 'a/Song.mp3') }),
      song('d2', 'Song.mp3', { desk: copy('dr', 'b/Song.mp3') }),
    ]);
    const s = await open();
    expect(copiesToJoin(s)).toHaveLength(1);
    const plain = await open();
    plain.shared = null;
    expect(copiesToJoin(plain)).toEqual([]);
  });
});
