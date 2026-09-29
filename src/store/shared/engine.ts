/* Syncing a shared collection (ADR 0094, 0106): the collection's folder in the GLUE folder against its one
   copy in GLUE Cloud, a snapshot and a log. No DOM and no app state: a GLUE tab and GLUE Home's service
   page run the same code.
   - The last copy both sides agreed on (per file: its text) is kept in `cloud/shared/<cid>.json`, with the
     cursor (the cloud revision this device has seen everything up to).
   - pull: the log's entries since the cursor (behind the snapshot's floor: the snapshot's files first).
     They make the cloud's copy of each file they touch, from the agreed one. A file changed only there is
     taken; one changed on both sides is merged three ways (merge3), and clashes are kept for the prompt.
   - push: what differs from the agreed copy, as one entry: of a file of songs (a shard) only the songs
     that changed, of any other file its text. It lands only on the cloud's latest revision; otherwise
     this device pulls, merges and pushes again. One push is one row in GLUE Cloud, however many songs.
   - checkpoint: when GLUE Cloud says the log is long, the device that pushed writes the files the log
     changed, as they are at its cursor, into the snapshot, and the log before it goes.
   The collection's files are in the shared form (each song with every computer's copy): the store
   shows them as this computer sees them (core/shared/project). */
import { type Dir, listNames, readText, removePath, subdir, writeText } from '../fsx';
import { merge3, setAt, type Clash } from '../../core/shared/merge3';

export interface LogEntry { rev: number; by?: string | null; at?: number; data: string }
export interface SharedCloud {
  /** The snapshot's files changed after `since` (metadata only). */
  changes(since: number): Promise<{ seq: number; more: boolean; files: { path: string; rev: number; hash: string; deleted: boolean; by?: string | null; at?: number }[] }>;
  /** Lines of path \t rev \t hash \t base64(gzip(text)). */
  bundle(paths: string[]): Promise<string>;
  /** The log since `since`; `reset`: behind the snapshot's floor. */
  log(since: number): Promise<{ reset?: boolean; floor?: number; seq: number; more: boolean; entries: LogEntry[] }>;
  /** One entry, on revision `base`: its revision, or stale; `compact`: fold the log into the snapshot. */
  append(base: number, paths: string[], data: string): Promise<{ rev?: number; stale?: boolean; compact?: boolean }>;
  /** The files the log changed up to `to`. */
  touched(to: number): Promise<{ paths: string[] }>;
  /** Lines of path \t hash \t size \t base64(gzip(text)) or '-' deleted, into the snapshot at `at`. */
  checkpoint(at: number, body: string, done: boolean): Promise<unknown>;
}
export interface Place { root: Dir; pid: string; cid: string; me: string; cloud: SharedCloud }
interface Agreed { text: string | null }
interface State { cursor: number; files: Record<string, Agreed>; clashes?: Clash[] }
export interface SyncResult { changed: string[]; clashes: Clash[]; pushed: number }
/** How one file changed: its songs (a shard: the other keys, and each song changed, null gone), its whole
    text, or deleted. */
export type FileChange = { o: Record<string, unknown>; i: Record<string, unknown> } | { t: string } | { d: 1 };

const SYNCED = /^(collection\.json|events\.json|(tracks|analysis|lists|sources|dupes)\/[\w.-]+\.json)$/;
/** One entry: at most this much JSON before it's packed (packed, it must stay under GLUE Cloud's 1.8 MB),
    and the snapshot's files per checkpoint call. */
const MAX_ENTRY_JSON = 6_000_000, MAX_PACKED = 1_700_000, MAX_BODY = 1_500_000, MAX_FILES = 150;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
async function pipe(b: Uint8Array, t: CompressionStream | DecompressionStream) { return new Uint8Array(await new Response(new Blob([b.slice()]).stream().pipeThrough(t)).arrayBuffer()); }
const toB64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const packText = async (text: string) => toB64(await pipe(new TextEncoder().encode(text), new CompressionStream('gzip')));
export const unpackText = async (b64: string) => new TextDecoder().decode(await pipe(fromB64(b64), new DecompressionStream('gzip')));
const parse = (t: string | null | undefined) => { if (t == null) return undefined; try { return JSON.parse(t) as unknown; } catch { return undefined; } };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const base = (p: Place) => `profiles/${p.pid}/collections/${p.cid}`;
const statePath = (p: Place) => `cloud/shared/${p.cid}.json`;

async function loadState(p: Place): Promise<State> {
  const t = await readText(p.root, statePath(p)).catch(() => null);
  const s = (parse(t) as State | undefined) ?? { cursor: 0, files: {} };
  // From before the log (per file also its revision and hash): the texts are what counts.
  for (const [k, v] of Object.entries(s.files)) s.files[k] = { text: v.text ?? null };
  return s;
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

// ---- changes of a file ---------------------------------------------------------------------------------

/** How `now` differs from `was` (null: the same). A file of songs on both sides: only the songs. */
export function diffFile(was: string | null | undefined, now: string | null | undefined): FileChange | null {
  if ((was ?? null) === (now ?? null)) return null;
  if (now == null) return { d: 1 };
  const a = parse(was), b = parse(now);
  if (isObj(a) && isObj(b) && isObj(a.items) && isObj(b.items)) {
    const o: Record<string, unknown> = {}, i: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) if (k !== 'items') o[k] = v;
    for (const [id, v] of Object.entries(b.items)) if (!same(a.items[id], v)) i[id] = v;
    for (const id of Object.keys(a.items)) if (!(id in b.items)) i[id] = null;
    const others = Object.keys(a).filter(k => k !== 'items');
    if (!Object.keys(i).length && others.length === Object.keys(o).length && others.every(k => same(a[k], o[k]))) return null;
    return { o, i };
  }
  if (a !== undefined && same(a, b)) return null;
  return { t: now };
}
/** The file after a change (undefined: deleted). */
export function applyChange(was: string | null | undefined, c: FileChange): string | undefined {
  if ('d' in c) return undefined;
  if ('t' in c) return c.t;
  const a = parse(was), items: Record<string, unknown> = isObj(a) && isObj(a.items) ? { ...a.items } : {};
  for (const [id, v] of Object.entries(c.i)) { if (v === null) delete items[id]; else items[id] = v; }
  return pretty({ ...c.o, items });
}

// ---- pull ----------------------------------------------------------------------------------------------

/** The cloud's copy of a file came in: taken, or merged with this device's own changes. */
async function take(p: Place, s: State, local: Map<string, string>, path: string, remote: string | undefined, by: string | null | undefined, at: number | undefined, changed: string[], clashes: Clash[]) {
  const mine = local.get(path), agreed = s.files[path]?.text ?? undefined;
  if (mine === remote) { /* the same already */ }
  else if (mine === agreed || mine === undefined && agreed === undefined) { await writeLocal(p, path, remote); changed.push(path); }
  else {
    const m = merge3(path, parse(agreed), parse(mine), parse(remote), p.me);
    clashes.push(...m.clashes.map(c => ({ ...c, by: by ?? null, when: at })));
    await writeLocal(p, path, m.value === undefined ? undefined : pretty(m.value));
    changed.push(path);
  }
  if (remote === undefined) delete s.files[path]; else s.files[path] = { text: remote };
}

/** Behind the floor: the snapshot's files changed since the cursor, then the cursor is the floor. */
async function fromSnapshot(p: Place, s: State, floor: number, changed: string[], clashes: Clash[]) {
  for (let more = true, since = s.cursor; more;) {
    const c = await p.cloud.changes(since);
    if (!Array.isArray(c?.files) || typeof c.seq !== 'number') throw new Error('GLUE Cloud answered strangely');
    more = c.more; since = c.seq;
    const todo = c.files.filter(f => SYNCED.test(f.path));
    const got = new Map<string, string>(), want = todo.filter(f => !f.deleted).map(f => f.path);
    // A bundle answers as many as fit: ask again for the rest until all are here.
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
    for (const f of todo) await take(p, s, local, f.path, f.deleted ? undefined : got.get(f.path), f.by, f.at, changed, clashes);
  }
  s.cursor = floor;
}

/** Take in what changed in the cloud. `changed`: the local files that changed (the store reloads them). */
export async function pull(p: Place, st?: State): Promise<{ state: State; changed: string[]; clashes: Clash[] }> {
  const s = st ?? await loadState(p);
  const changed: string[] = [], clashes: Clash[] = [];
  for (let more = true, resets = 0; more;) {
    const r = await p.cloud.log(s.cursor);
    if (!r || typeof r.seq !== 'number' || !Array.isArray(r.entries)) throw new Error('GLUE Cloud answered strangely');
    const found: Clash[] = [];
    if (r.reset) {
      if (++resets > 3) throw new Error('GLUE Cloud’s copy keeps moving: try again');
      await fromSnapshot(p, s, r.floor ?? 0, changed, found);
    } else {
      more = r.more;
      // The cloud's copy of each file the entries touch, from the agreed one, entry after entry.
      const next = new Map<string, { text: string | undefined; by?: string | null; at?: number }>();
      for (const e of r.entries) {
        const body = parse(await unpackText(e.data)) as { f?: Record<string, FileChange> } | undefined;
        for (const [path, c] of Object.entries(body?.f ?? {})) {
          if (!SYNCED.test(path)) continue;
          const was = next.has(path) ? next.get(path)!.text : s.files[path]?.text;
          next.set(path, { text: applyChange(was, c), by: e.by, at: e.at });
        }
      }
      if (next.size) {
        const local = await localFiles(p);
        for (const [path, n] of next) await take(p, s, local, path, n.text, n.by, n.at, changed, found);
      }
      s.cursor = r.seq;
    }
    if (found.length) { s.clashes = [...(s.clashes ?? []), ...found]; clashes.push(...found); }
    await saveState(p, s);
  }
  return { state: s, changed, clashes };
}

// ---- push ----------------------------------------------------------------------------------------------

const entryOf = (batch: [string, FileChange, string | null][]) => packText(JSON.stringify({ v: 1, f: Object.fromEntries(batch.map(([path, c]) => [path, c])) }));

/** Send what changed here, as entries of the log. On a stale revision: pulled, merged and sent again (a
    few times at most). Then the log folded into the snapshot, if GLUE Cloud asks. */
export async function push(p: Place, st?: State): Promise<{ state: State; pushed: number; changed: string[]; clashes: Clash[] }> {
  let s = st ?? await loadState(p);
  let pushed = 0, compact = false;
  const changed: string[] = [], clashes: Clash[] = [];
  for (let round = 0; round < 5; round++) {
    const local = await localFiles(p);
    const todo: [string, FileChange, string | null][] = [];
    for (const path of new Set([...local.keys(), ...Object.keys(s.files)])) {
      const now = local.get(path) ?? null, c = diffFile(s.files[path]?.text, now);
      if (c) todo.push([path, c, now]);
    }
    if (!todo.length) break;
    let stale = false;
    for (let i = 0; i < todo.length;) {
      // As many files as fit one entry.
      let batch: [string, FileChange, string | null][] = [], n = 0;
      while (i < todo.length) {
        const len = JSON.stringify(todo[i][1]).length;
        if (batch.length && n + len > MAX_ENTRY_JSON) break;
        batch.push(todo[i]); n += len; i++;
      }
      let data = await entryOf(batch);
      while (data.length > MAX_PACKED && batch.length > 1) {
        const keep = Math.ceil(batch.length / 2);
        i -= batch.length - keep;
        batch = batch.slice(0, keep);
        data = await entryOf(batch);
      }
      if (data.length > MAX_PACKED) throw new Error('too big for GLUE Cloud: ' + batch[0][0]);
      const r = await p.cloud.append(s.cursor, batch.map(b => b[0]), data);
      if (r?.stale) { stale = true; break; }
      if (typeof r?.rev !== 'number') throw new Error('GLUE Cloud answered a push strangely');
      s.cursor = r.rev;
      for (const [path, , now] of batch) { if (now === null) delete s.files[path]; else s.files[path] = { text: now }; }
      pushed += batch.length;
      compact ||= !!r.compact;
      await saveState(p, s);
    }
    if (!stale) break;
    const pl = await pull(p, s);
    s = pl.state; changed.push(...pl.changed); clashes.push(...pl.clashes);
  }
  if (compact) await checkpoint(p, s).catch(e => console.warn('GLUE Cloud: couldn’t fold the log into the snapshot', e));
  return { state: s, pushed, changed, clashes };
}

/** Fold the log into the snapshot at this device's cursor: the files the log changed, as agreed here. */
async function checkpoint(p: Place, s: State) {
  const at = s.cursor, { paths } = await p.cloud.touched(at);
  const lines: string[] = [];
  for (const path of paths.filter(x => SYNCED.test(x))) {
    const text = s.files[path]?.text;
    lines.push(text == null ? [path, '', 0, '-'].join('\t') : [path, await sha256(text), new TextEncoder().encode(text).length, await packText(text)].join('\t'));
  }
  for (let i = 0; ;) {
    const part: string[] = [];
    let n = 0;
    while (i < lines.length && part.length < MAX_FILES && (!part.length || n + lines[i].length <= MAX_BODY)) { part.push(lines[i]); n += lines[i].length; i++; }
    await p.cloud.checkpoint(at, part.join('\n'), i >= lines.length);
    if (i >= lines.length) break;
  }
}

/** Both ways: take in the cloud's changes, then send this side's. */
export async function syncShared(p: Place): Promise<SyncResult> {
  const a = await pull(p);
  const b = await push(p, a.state);
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
