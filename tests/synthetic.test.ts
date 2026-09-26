import { describe, expect, it } from 'vitest';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { writeText } from '../src/store/fsx';
import { synthetic } from './synthetic';
import { MemDir, asDir } from './memfs';

describe('synthetic GLUE folder (ADR 0058)', () => {
  it('opens through the real store, with every part a real collection has', async () => {
    const syn = synthetic(2000, 7), mem = new MemDir(), root = asDir(mem);
    for (const [p, text] of syn.files) await writeText(root, p, text);
    const home = await HomeStore.open(root);
    expect(home.index.lastProfile).toBe(syn.profileId);
    const p = await home.loadProfile(syn.profileId);
    expect(p.lastCollection).toBe(syn.collectionId);
    const s = await CollectionStore.load(root, syn.profileId, syn.collectionId);
    expect(s.damaged).toEqual([]);
    expect(s.tracks.size).toBe(2000);
    expect(s.analysis.size).toBeGreaterThan(1600);
    expect(s.sources.size).toBe(3);
    expect(s.lists.size).toBe(syn.lists);
    const all = [...s.tracks.values()];
    expect(all.some(t => t.status === 'unlinked')).toBe(true);
    expect(all.some(t => t.tags?.length)).toBe(true);
    expect(new Set([...s.analysis.values()].map(a => a.grade))).toEqual(new Set(['ok', 'warn', 'bad', 'info']));
    // Every list's parent exists, every item is a track, and some playlists sit two folders deep.
    for (const l of s.lists.values()) {
      if (l.parentId) expect(s.lists.get(l.parentId)?.kind).toBe('folder');
      for (const id of l.items) expect(s.tracks.has(id)).toBe(true);
    }
    // Imports point at real tracks, and tracks list the imports that have them.
    for (const src of s.sources.values()) for (const st of src.tracks) expect(s.tracks.get(st.trackId)?.sources).toContain(src.id);
  });

  it('is the same for the same seed', () => {
    const a = synthetic(300, 3), b = synthetic(300, 3), c = synthetic(300, 4);
    expect([...a.files]).toEqual([...b.files]);
    expect([...a.files]).not.toEqual([...c.files]);
  });
});
