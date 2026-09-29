/* Turning a collection into a shared one (ADR 0094): its files, in place, into the shared form, with this
   computer's parts (its copy of each song, its analyses, its music folders). The first push then puts it in
   GLUE Cloud; other devices join it and add their own copies as they find the same songs. */
import { type Dir, listNames, readJSON, writeJSON } from '../fsx';
import { collectionShared, toShared, type Here, type SharedCollection, type SharedTrack } from '../../core/shared/project';
import { adopt, type Adopted } from '../../core/shared/adopt';
import { type AnalysisSummary, type Collection, type List, type Source, type Track, SCHEMA, shardOf } from '../types';

export async function makeShared(root: Dir, pid: string, cid: string, me: string, member: { profile: string; name: string }) {
  const base = `profiles/${pid}/collections/${cid}`;
  const meta = await readJSON<Collection | SharedCollection>(root, base + '/collection.json');
  if (!meta) throw new Error('Collection not found in your GLUE folder.');
  if ((meta as SharedCollection).shared) return false;
  const sc = collectionShared(meta as Collection, me, undefined, member, true);
  const here: Here = { me, collection: cid, members: sc.members };
  for (const f of await listNames(root, base + '/tracks', 'file').catch(() => [] as string[])) {
    const sh = await readJSON<{ schemaVersion: number; items: Record<string, Track> }>(root, `${base}/tracks/${f}`);
    if (!sh) continue;
    await writeJSON(root, `${base}/tracks/${f}`, { ...sh, items: Object.fromEntries(Object.entries(sh.items).map(([id, t]) => [id, toShared(t, here)])) });
  }
  for (const f of await listNames(root, base + '/analysis', 'file').catch(() => [] as string[])) {
    const sh = await readJSON<{ schemaVersion: number; items: Record<string, AnalysisSummary> }>(root, `${base}/analysis/${f}`);
    if (!sh) continue;
    await writeJSON(root, `${base}/analysis/${f}`, { ...sh, items: Object.fromEntries(Object.entries(sh.items).map(([id, a]) => [id, { [me]: a }])) });
  }
  // Its DJ libraries: this computer's (ADR 0099).
  for (const f of await listNames(root, base + '/sources', 'file').catch(() => [] as string[])) {
    const src = await readJSON<Source>(root, `${base}/sources/${f}`);
    if (src && !src.computer) await writeJSON(root, `${base}/sources/${f}`, { ...src, computer: me });
  }
  // Last: until the collection file says so, it's still a collection of this computer's own.
  await writeJSON(root, base + '/collection.json', sc);
  return true;
}

async function readShards<T>(root: Dir, dir: string): Promise<Record<string, T>> {
  const out: Record<string, T> = {};
  for (const f of await listNames(root, dir, 'file').catch(() => [] as string[])) {
    const sh = await readJSON<{ items: Record<string, T> }>(root, dir + '/' + f);
    if (sh) Object.assign(out, sh.items);
  }
  return out;
}
async function readEach<T>(root: Dir, dir: string): Promise<T[]> {
  const out: T[] = [];
  for (const f of await listNames(root, dir, 'file').catch(() => [] as string[])) { const x = await readJSON<T>(root, dir + '/' + f); if (x) out.push(x); }
  return out;
}

/** This computer's own collection `own` moved into the shared collection `cid` (ADR 0096), both in the
    profile's folder (the shared one already pulled). The own one is kept as it was, marked moved. */
export async function moveInto(root: Dir, pid: string, own: string, cid: string, me: string, member: { profile: string; name: string }): Promise<Adopted['stats']> {
  const ob = `profiles/${pid}/collections/${own}`, sb = `profiles/${pid}/collections/${cid}`;
  const ometa = await readJSON<Collection>(root, ob + '/collection.json');
  const smeta = await readJSON<SharedCollection>(root, sb + '/collection.json');
  if (!ometa || (ometa as unknown as SharedCollection).shared) throw new Error('This collection can’t be moved.');
  if (!smeta?.shared) throw new Error('The shared collection isn’t here yet.');
  const r = adopt(
    { meta: smeta, tracks: Object.values(await readShards<SharedTrack>(root, sb + '/tracks')), analysis: await readShards(root, sb + '/analysis'), lists: await readEach<List>(root, sb + '/lists'), sources: await readEach<Source>(root, sb + '/sources') },
    { meta: ometa, tracks: Object.values(await readShards<Track>(root, ob + '/tracks')), analysis: await readShards(root, ob + '/analysis'), lists: await readEach<List>(root, ob + '/lists'), sources: await readEach<Source>(root, ob + '/sources') },
    me, member);
  const group = <T>(m: Map<string, T> | [string, T][]) => { const by: Record<string, Record<string, T>> = {}; for (const [id, v] of m) (by[shardOf(id)] ??= {})[id] = v; return by; };
  for (const [k, items] of Object.entries(group(r.tracks.map(t => [t.id, t] as [string, SharedTrack])))) await writeJSON(root, `${sb}/tracks/${k}.json`, { schemaVersion: SCHEMA, items });
  for (const [k, items] of Object.entries(group(Object.entries(r.analysis)))) await writeJSON(root, `${sb}/analysis/${k}.json`, { schemaVersion: SCHEMA, items });
  for (const l of r.lists) await writeJSON(root, `${sb}/lists/${l.id}.json`, l);
  for (const s of r.sources) await writeJSON(root, `${sb}/sources/${s.id}.json`, s);
  await writeJSON(root, sb + '/collection.json', r.meta);
  await writeJSON(root, ob + '/collection.json', { ...ometa, movedTo: cid });
  return r.stats;
}
