/* A shared song's record without `copies` (ADR 0161): a store opened as this computer's own wrote its own
   form into a collection that had become shared, and another device took the song for its own with no file ("No file
   linked" offered to remove it, for every device). Never written again; put right where it's read. */
import { describe, expect, it } from 'vitest';
import { MemDir, asDir } from './memfs';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { makeShared } from '../src/store/shared/seed';
import { withCopies, type SharedTrack } from '../src/core/shared/project';
import type { Track } from '../src/store/types';

const song = (id: string, extra: Partial<Track> = {}): Track => ({ id, status: 'unlinked', rootId: null, relPath: null, importPath: 'D:/Music/x.mp3', fileName: 'x.mp3', size: null, mtime: null, title: 'Night Drive', artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', sources: ['rb'], ...extra });

describe('a shared song without its copies', () => {
  it('is the copy of the computer that wrote it: by its music folder, its DJ libraries, else the only member', () => {
    const raw = song('aa01') as unknown as SharedTrack;
    const desk = { profile: 'p', name: 'Desktop' }, lap = { profile: 'q', name: 'Laptop' };
    const root = (id: string) => [{ id, name: 'Music', absPath: null, handleKey: 'h', addedAt: '' }];
    const one = withCopies(raw, { members: { desk } }, [])!;
    expect(one.copies).toEqual({ desk: { status: 'unlinked', rootId: null, relPath: null, importPath: 'D:/Music/x.mp3', size: null, mtime: null, sources: ['rb'] } });
    expect((one as unknown as Track).importPath).toBeUndefined();
    expect(one.title).toBe('Night Drive');
    // Two members: the one whose DJ library it came from; the one whose music folder it's in.
    expect(Object.keys(withCopies(raw, { members: { desk, lap } }, [{ id: 'rb', computer: 'lap' }])!.copies)).toEqual(['lap']);
    const linked = song('aa02', { status: 'linked', rootId: 'r9', relPath: 'x.mp3', importPath: null, sources: [] }) as unknown as SharedTrack;
    expect(Object.keys(withCopies(linked, { members: { desk, lap }, rootsBy: { desk: root('r1'), lap: root('r9') } }, [])!.copies)).toEqual(['lap']);
    // Nothing tells: nobody's, never a guess (nor the old stand-in).
    expect(withCopies(raw, { members: { desk, lap } }, [{ id: 'rb' }])!.copies).toEqual({});
    expect(withCopies(linked, { members: { desk, lap }, rootsBy: { desk: root('r9'), lap: root('r9') } }, [])!.copies).toEqual({});
    expect(withCopies(raw, { members: { 'this-computer': desk } }, [])!.copies).toEqual({});
    expect(withCopies({ ...raw, copies: {} } as SharedTrack, { members: { desk } }, [])).toBeNull();
  });

  it('a store opened as this computer’s own writes nothing into the collection once it’s shared (and is opened again)', async () => {
    const root = asDir(new MemDir()), home = await HomeStore.open(root);
    const p = await home.createProfile('DJ'), c = await home.createCollection(p, 'My collection');
    const s = await CollectionStore.load(root, p.id, c.id);
    s.putTracks([song('aa01')]); await s.flush();
    // Shared under it (another tab, or the collection opened again in the middle of a share).
    await makeShared(root, p.id, c.id, 'desk', { profile: p.id, name: 'Desktop' });
    s.putTracks([{ ...song('aa01'), rating: 5 }]);
    await expect(s.flush()).rejects.toMatchObject({ name: 'OutdatedStore' });
    expect(s.outdated).toBe(true);
    const file = JSON.parse(await (await (await (await root.getDirectoryHandle('profiles')).getDirectoryHandle(p.id)).getDirectoryHandle('collections')).getDirectoryHandle(c.id).then(d => d.getDirectoryHandle('tracks')).then(d => d.getFileHandle('aa.json')).then(f => f.getFile()).then(f => f.text()));
    expect(file.items.aa01.copies.desk).toMatchObject({ importPath: 'D:/Music/x.mp3' });
    expect(file.items.aa01.rating).toBeUndefined();
  });

  it('read on another device, the song is the desktop’s (not one with no file here); saved, the record has its copies', async () => {
    const root = asDir(new MemDir()), home = await HomeStore.open(root);
    const p = await home.createProfile('DJ'), c = await home.createCollection(p, 'My collection');
    const s = await CollectionStore.load(root, p.id, c.id);
    s.putTracks([song('aa01'), song('aa02', { title: 'Other' })]); await s.flush();
    await makeShared(root, p.id, c.id, 'desk', { profile: p.id, name: 'Desktop' });
    // aa02 written in the computer's own form into the shared file (the race).
    const tracks = await (await (await (await (await root.getDirectoryHandle('profiles')).getDirectoryHandle(p.id)).getDirectoryHandle('collections')).getDirectoryHandle(c.id)).getDirectoryHandle('tracks');
    const read = async () => JSON.parse(await (await (await tracks.getFileHandle('aa.json')).getFile()).text());
    const f = await read();
    f.items.aa02 = song('aa02', { title: 'Other' });
    const w = await (await tracks.getFileHandle('aa.json')).createWritable(); await w.write(JSON.stringify(f)); await w.close();
    // On the laptop (not a member): another computer's song, not "no file" here.
    const lap = await CollectionStore.load(root, p.id, c.id, { me: 'lap' });
    expect(lap.tracks.get('aa02')).toMatchObject({ remote: { device: 'desk' } });
    // On the desktop: its own, and the file is put right.
    const desk = await CollectionStore.load(root, p.id, c.id, { me: 'desk' });
    expect(desk.tracks.get('aa02')).toMatchObject({ importPath: 'D:/Music/x.mp3', status: 'unlinked' });
    expect(desk.tracks.get('aa02')!.remote).toBeUndefined();
    await desk.flush();
    expect((await read()).items.aa02.copies.desk).toMatchObject({ importPath: 'D:/Music/x.mp3' });
  });
});
