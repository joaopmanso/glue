import { describe, expect, it } from 'vitest';
import { HomeStore } from '../src/store/home';
import { readJSON, writeJSON } from '../src/store/fsx';
import { SCHEMA, type HomeIndex } from '../src/store/types';
import { MemDir, asDir } from './memfs';

describe('profiles become aliases; the GLUE folder keeps one library (ADR 0113)', () => {
  it('one profile: it is the alias and the library; nothing moves; twice is once', async () => {
    const mem = new MemDir(), root = asDir(mem);
    await writeJSON(root, 'mco.json', { schemaVersion: SCHEMA, profiles: [{ id: 'b2df', name: '404', color: '#7cc7ff' }], lastProfile: 'b2df' });
    await writeJSON(root, 'profiles/b2df/profile.json', { schemaVersion: SCHEMA, id: 'b2df', name: '404', color: '#7cc7ff', createdAt: '', collections: [{ id: 'bf92', name: 'My collection' }], lastCollection: 'bf92', bpmRange: 'half' });
    const home = await HomeStore.open(root);
    expect(await home.ensureAliases()).toBe(true);
    const ix = (await readJSON<HomeIndex>(root, 'mco.json'))!;
    expect(ix).toMatchObject({ aliases: [{ id: 'b2df', name: '404', color: '#7cc7ff', bpmRange: 'half' }], container: 'b2df', lastAlias: 'b2df', profiles: [{ id: 'b2df' }], lastProfile: 'b2df' });
    expect(await (await HomeStore.open(root)).ensureAliases()).toBe(false);
    // An older GLUE still finds its profile.
    expect((await readJSON<HomeIndex>(root, 'mco.json'))!.lastProfile).toBe('b2df');
  });
  it('two profile folders: the one used last holds the library; both are aliases; a read-only tab writes nothing', async () => {
    const mem = new MemDir(), root = asDir(mem);
    const index = { schemaVersion: SCHEMA, profiles: [{ id: 'p1', name: 'DJ', color: '#111' }, { id: 'p2', name: 'Night', color: '#222' }], lastProfile: 'p2' };
    await writeJSON(root, 'mco.json', index);
    const ro = await HomeStore.open(root);
    expect(await ro.ensureAliases(false)).toBe(true);
    expect(ro.index).toMatchObject({ container: 'p2', lastAlias: 'p2' });
    expect(await readJSON(root, 'mco.json')).toEqual(index);
    const home = await HomeStore.open(root);
    await home.ensureAliases();
    expect(home.aliases.map(a => a.name)).toEqual(['DJ', 'Night']);
    // The account's list replaces them; the alias used last isn't in it any more.
    await home.setAliases([{ id: 'acc1', name: '404', color: '#7cc7ff' }]);
    expect(home.index).toMatchObject({ lastAlias: null, container: 'p2' });
    // The library folder that goes away takes the container with it.
    await home.deleteProfile('p2');
    expect(home.index.container).toBe('p1');
  });
  it('the profiles the first version dropped for the account’s come back, once; a device’s “Library” never was one (ADR 0114)', async () => {
    const mem = new MemDir(), root = asDir(mem);
    // The laptop after the first version: its own "404" replaced by the account's (another id).
    await writeJSON(root, 'mco.json', { schemaVersion: SCHEMA, profiles: [{ id: '420555da', name: '404', color: '#f472b6' }, { id: 'lib1', name: 'Library', color: '#111' }], lastProfile: '420555da',
      aliases: [{ id: 'b2df', name: '404', color: '#7cc7ff' }], container: '420555da', lastAlias: 'b2df' });
    await writeJSON(root, 'profiles/lib1/profile.json', { schemaVersion: SCHEMA, id: 'lib1', name: 'Library', color: '#111', createdAt: '2026-09-30T13:00:00Z', collections: [], lastCollection: null });
    const home = await HomeStore.open(root);
    expect(await home.ensureAliases()).toBe(true);
    expect(home.aliases.map(a => a.id + ' ' + a.name)).toEqual(['b2df 404', '420555da 404']);
    expect(home.index).toMatchObject({ aliasesV: 2, lastAlias: 'b2df', container: '420555da' });
    // Deleted afterwards (by the user): not back.
    await home.setAliases(home.aliases.filter(a => a.id !== '420555da'));
    expect(await (await HomeStore.open(root)).ensureAliases()).toBe(false);
    expect((await HomeStore.open(root)).aliases.map(a => a.id)).toEqual(['b2df']);
  });
  it('a fresh GLUE folder: the first library takes its alias’s id', async () => {
    const home = await HomeStore.open(asDir(new MemDir()));
    await home.ensureAliases();
    expect(home.index).toMatchObject({ aliases: [], lastAlias: null });
    expect(home.index.container ?? null).toBeNull();
    const p = await home.createProfile('DJ Test', 'a1');
    await home.setContainer(p.id);
    expect(home.index).toMatchObject({ container: 'a1', lastProfile: 'a1', profiles: [{ id: 'a1', name: 'DJ Test' }] });
  });
});
