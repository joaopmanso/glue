/* Syncing a shared collection (ADR 0094): the collection's folder in the GLUE folder against its one copy
   in GLUE Cloud. No DOM and no app state: a GLUE tab and GLUE Home's service page run the same code.
   - The last copy both sides agreed on (per file: its revision, hash and text) is kept in
     `cloud/shared/<cid>.json`, with the cursor (the cloud revision this device has seen everything up to).
   - pull: what changed in the cloud since the cursor. A file changed only there is taken; one changed on
     both sides is merged three ways (merge3), and clashes are kept for the prompt.
   - push: every file that differs from the agreed copy, with the revision it was based on. What the
     cloud says is stale is pulled, merged and pushed again.
   The collection's files are in the shared form (each song with every computer's copy): the store
   shows them as this computer sees them (core/shared/project). */
import { type Dir, listNames, readText, removePath, subdir, writeText } from '../fsx';
import { merge3, setAt, type Clash } from '../../core/shared/merge3';
import type { PushPlan } from '../../core/shared/pace';

export interface SharedCloud {
  changes(since: number): Promise<{ seq: number; more: boolean; files: { path: string; rev: number; hash: string; deleted: boolean; by?: string | null; at?: number }[] }>;
  /** Lines of path \t rev \t hash \t base64(gzip(text)). */
  bundle(paths: string[]): Promise<string>;
  /** Lines of path \t baseRev \t hash \t size \t base64(gzip(text)) or '-' to delete. */
  push(body: string): Promise<{ rev: number | null; stored: string[]; stale: string[] }>;
}
export interface Place { root: Dir; pid: string; cid: string; me: string; cloud: SharedCloud }
interface Agreed { rev: number; hash: string; text: string | null }
interface State { cursor: number; files: Record<string, Agreed>; clashes?: Clash[] }
export interface SyncResult { changed: string[]; clashes: Clash[]; pushed: number }

const SYNCED = /^(collection\.json|events\.json|(tracks|analysis|lists|sources|dupes)\/[\w.-]+\.json)$/;
const MAX_BODY = 1_500_000, MAX_FILES = 150;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
async function pipe(b: Uint8Array, t: CompressionStream | DecompressionStream) { return new Uint8Array(await new Response(new Blob([b.slice()]).stream().pipeThrough(t)).arrayBuffer()); }
const toB64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const packText = async (text: string) => toB64(await pipe(new TextEncoder().encode(text), new CompressionStream('gzip')));
export const unpackText = async (b64: string) => new TextDecoder().decode(await pipe(fromB64(b64), new DecompressionStream('gzip')));
const parse = (t: string | null | undefined) => { if (t == null) return undefined; try { return JSON.parse(t) as unknown; } catch { return undefined; } };

const base = (p: Place) => `profiles/${p.pid}/collections/${p.cid}`;
const statePath = (p: Place) => `cloud/shared/${p.cid}.json`;

async function loadState(p: Place): Promise<State> {
  const t = await readText(p.root, statePath(p)).catch(() => null);
  return (parse(t) as State | undefined) ?? { cursor: 0, files: {} };
}
const saveState = (p: Place, s: State) => writeText(p.root, statePath(p), JSON.stringify(s));

/** The collection's synced files as they are now: path → text. */
export async function localFiles(p: Place): Promise<Map<string, string>> {
  const out = new Map<string, string>(), b = base(p);
  for (const name of await listNames(p.root, b, 'file').catch(() => [] as string[])) if (SYNCED.test(name)) { const t = await readText(p.root, b + '/' + name); if (t != null) out.set(name, t); }
  for (const dir of ['tracks', 'analysis', 'lists', 'sources', 'dupes']) {
    for (const name of await listNames(p.root, b + '/' + dir, 'file').catch(() => [] as string[])) {
      const path = dir + '/' + name;
      if (!SYNCED.test(path)) continue;
      const t = await readText(p.root, b + '/' + path);
      if (t != null) out.set(path, t);
    }
  }
  return out;
}
async function writeLocal(p: Place, path: string, text: string | undefined) {
  if (text === undefined) { await removePath(p.root, base(p) + '/' + path).catch(() => {}); return; }
  if (path.includes('/')) await subdir(p.root, [...base(p).split('/'), path.split('/')[0]], true);
  await writeText(p.root, base(p) + '/' + path, text);
}
const pretty = (v: unknown) => JSON.stringify(v);

/** Take in what changed in the cloud. `changed`: the local files that changed (the store reloads them). */
export async function pull(p: Place, st?: State): Promise<{ state: State; changed: string[]; clashes: Clash[] }> {
  const s = st ?? await loadState(p);
  const changed: string[] = [], clashes: Clash[] = [];
  for (let more = true; more;) {
    const c = await p.cloud.changes(s.cursor);
    if (!Array.isArray(c?.files) || typeof c.seq !== 'number') throw new Error('GLUE Cloud answered strangely');
    more = c.more;
    const todo = c.files.filter(f => SYNCED.test(f.path) && s.files[f.path]?.rev !== f.rev);
    // Their contents, many at a time.
    const got = new Map<string, string>();
    const want = todo.filter(f => !f.deleted).map(f => f.path);
    // A bundle answers as many as fit: ask again for the rest until all are here (the cursor must never
    // pass a file this device hasn't got).
    while (want.length) {
      const before = got.size;
      for (const line of (await p.cloud.bundle(want.slice(0, 400))).split('\n')) {
        if (!line) continue;
        const [path, , , data] = line.split('\t');
        got.set(path, await unpackText(data));
      }
      for (let i = want.length - 1; i >= 0; i--) if (got.has(want[i])) want.splice(i, 1);
      if (got.size === before) throw new Error('GLUE Cloud didn’t send ' + want[0]);
    }
    const local = await localFiles(p);
    for (const f of todo) {
      const remote = f.deleted ? undefined : got.get(f.path);
      if (!f.deleted && remote === undefined) continue;   // not sent this time: the next pull
      const mine = local.get(f.path), agreed = s.files[f.path]?.text ?? undefined;
      if (mine === remote) { /* the same already */ }
      else if (mine === agreed || mine === undefined && agreed === undefined) { await writeLocal(p, f.path, remote); changed.push(f.path); }
      else {
        const m = merge3(f.path, parse(agreed), parse(mine), parse(remote), p.me);
        clashes.push(...m.clashes.map(c => ({ ...c, by: f.by ?? null, when: f.at })));
        await writeLocal(p, f.path, m.value === undefined ? undefined : pretty(m.value));
        changed.push(f.path);
      }
      s.files[f.path] = { rev: f.rev, hash: f.deleted ? '' : f.hash, text: remote ?? null };
    }
    s.cursor = c.seq;
    if (clashes.length) s.clashes = [...(s.clashes ?? []), ...clashes];
    await saveState(p, s);
  }
  return { state: s, changed, clashes };
}

/** Send what changed here (`only`: just these files, ADR 0105). Stale files are pulled, merged and sent
    again (a few times at most). */
export async function push(p: Place, st?: State, only?: Set<string>): Promise<{ state: State; pushed: number; changed: string[]; clashes: Clash[] }> {
  let s = st ?? await loadState(p);
  let pushed = 0;
  const changed: string[] = [], clashes: Clash[] = [];
  for (let round = 0; round < 3; round++) {
    const local = await localFiles(p);
    const out: { path: string; base: number; hash: string; text: string | null }[] = [];
    for (const [path, text] of local) {
      const a = s.files[path], h = await sha256(text);
      if (!a || a.hash !== h) out.push({ path, base: a?.rev ?? 0, hash: h, text });
    }
    for (const [path, a] of Object.entries(s.files)) if (a.text != null && !local.has(path)) out.push({ path, base: a.rev, hash: '', text: null });
    if (only) out.splice(0, out.length, ...out.filter(f => only.has(f.path)));
    if (!out.length) break;
    let stale = false;
    for (let i = 0; i < out.length;) {
      const lines: string[] = [], batch: typeof out = [];
      let n = 0;
      while (i < out.length && batch.length < MAX_FILES) {
        const f = out[i], data = f.text === null ? '-' : await packText(f.text);
        const line = [f.path, f.base, f.hash, f.text === null ? 0 : new TextEncoder().encode(f.text).length, data].join('\t');
        if (batch.length && n + line.length > MAX_BODY) break;
        lines.push(line); batch.push(f); n += line.length; i++;
      }
      const r = await p.cloud.push(lines.join('\n'));
      if (!Array.isArray(r?.stored) || !Array.isArray(r?.stale)) throw new Error('GLUE Cloud answered a push strangely');
      for (const f of batch) {
        if (r.stored.includes(f.path) && r.rev != null) { s.files[f.path] = { rev: r.rev, hash: f.hash, text: f.text }; pushed++; }
        if (r.stale.includes(f.path)) stale = true;
      }
      await saveState(p, s);
    }
    if (!stale) break;
    const pl = await pull(p, s);
    s = pl.state; changed.push(...pl.changed); clashes.push(...pl.clashes);
  }
  return { state: s, pushed, changed, clashes };
}

/** Both ways: take in the cloud's changes, then send this side's (`send`: all of them, some, or none yet:
    core/shared/pace). */
export async function syncShared(p: Place, send: PushPlan = 'all'): Promise<SyncResult> {
  const a = await pull(p);
  if (send === 'none') return { changed: a.changed, clashes: a.clashes, pushed: 0 };
  const b = await push(p, a.state, send === 'all' ? undefined : send);
  return { changed: [...new Set([...a.changed, ...b.changed])], clashes: [...a.clashes, ...b.clashes], pushed: b.pushed };
}

/** The clashes waiting for an answer (kept with the sync state). */
export async function waitingClashes(p: Place): Promise<Clash[]> { return (await loadState(p)).clashes ?? []; }
/** Settle a clash: `value` goes into this device's file at the clash's place (the cloud's value is already
    there when that's the answer), and the clash is forgotten. The next push sends it. */
export async function resolveClash(p: Place, c: Clash, value: unknown, keepRemote: boolean) {
  const s = await loadState(p);
  if (!keepRemote) {
    const text = await readText(p.root, base(p) + '/' + c.file).catch(() => null);
    await writeLocal(p, c.file, pretty(setAt(parse(text) ?? {}, c.at, value)));
  }
  s.clashes = (s.clashes ?? []).filter(x => !(x.file === c.file && x.at === c.at));
  await saveState(p, s);
}
