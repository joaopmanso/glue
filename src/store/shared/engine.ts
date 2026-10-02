/* Syncing a shared collection (ADR 0094, 0106): the collection's folder in the GLUE folder against its one
   copy in GLUE Cloud, a snapshot and a log. No DOM and no app state: a GLUE tab and GLUE Home's service
   page run the same code.
   - What both sides last agreed on: the cursor (the cloud revision this device has seen everything up to)
     and the clashes waiting, in `cloud/shared/<cid>.json`; each file's agreed text in its own file under
     `cloud/shared/<cid>/`, read only when that file is looked at (ADR 0107).
   - pull: the log's entries since the cursor (behind the snapshot's floor: the snapshot's files first).
     They make the cloud's copy of each file they touch, from the agreed one. A file changed only there is
     taken; one changed on both sides is merged three ways (merge3), and clashes are kept for the prompt.
   - push: what differs from the agreed copy, as one entry: of a file of songs (a shard) only the songs
     that changed, of any other file its text. It lands only on the cloud's latest revision; otherwise
     this device pulls, merges and pushes again. One push is one row in GLUE Cloud, however many songs.
     Told which files changed (the store knows what it wrote), only those are looked at; else every one.
   - checkpoint: when GLUE Cloud says the log is long, the device that pushed writes the files the log
     changed, as they are at its cursor, into the snapshot, and the log before it goes.
   The collection's files are in the shared form (each song with every computer's copy): the store
   shows them as this computer sees them (core/shared/project). */
import { type Dir, listNames, readText, removePath, writeText } from '../fsx';
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
export interface SyncResult { changed: string[]; clashes: Clash[]; pushed: number }
/** How one file changed: its songs (a shard: the other keys, and each song changed, null gone), its whole
    text, or deleted. */
export type FileChange = { o: Record<string, unknown>; i: Record<string, unknown> } | { t: string } | { d: 1 };

const SYNCED = /^(collection\.json|events\.json|(tracks|analysis|lists|sources|dupes)\/[\w.-]+\.json)$/;
const DIRS = ['tracks', 'analysis', 'lists', 'sources', 'dupes'];
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
/** The same value, whatever the order of its keys (two stores may write a song's fields in another order:
    that's no change, and must never be sent back and forth). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (!isObj(a) || !isObj(b)) return false;
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  return ka.length === kb.length && ka.every(k => same(a[k], b[k]));
}

const base = (p: Place) => `profiles/${p.pid}/collections/${p.cid}`;
const statePath = (p: Place) => `cloud/shared/${p.cid}.json`;
const agreedDir = (p: Place) => `cloud/shared/${p.cid}`;

/** The synced files under a folder (the collection's, or the agreed copies'). */
async function syncedPaths(root: Dir, dir: string): Promise<string[]> {
  const out = (await listNames(root, dir, 'file').catch(() => [] as string[])).filter(n => SYNCED.test(n));
  for (const d of DIRS) for (const n of await listNames(root, dir + '/' + d, 'file').catch(() => [] as string[])) if (SYNCED.test(d + '/' + n)) out.push(d + '/' + n);
  return out;
}

/** What this device and GLUE Cloud last agreed on. The agreed texts are read when a file is looked at,
    and written back when they change (never the whole collection at once, ADR 0107). */
class State {
  cursor = 0;
  clashes: Clash[] = [];
  /** Files merged here in this sync (this device's changes and the cloud's): they go up next. */
  merged = new Set<string>();
  private texts = new Map<string, string | null>();
  private dirty = new Set<string>();
  private constructor(private p: Place) {}
  static async load(p: Place): Promise<State> {
    const s = new State(p);
    const meta = parse(await readText(p.root, statePath(p)).catch(() => null)) as { cursor?: number; clashes?: Clash[]; files?: Record<string, { text?: string | null }> } | undefined;
    s.cursor = meta?.cursor ?? 0; s.clashes = meta?.clashes ?? [];
    // From before (every agreed text in this one file): each into its own, once.
    if (meta?.files) { for (const [k, v] of Object.entries(meta.files)) if (v?.text != null && SYNCED.test(k)) s.set(k, v.text); await s.save(); }
    return s;
  }
  /** The agreed text of a file (null: none); `keep`: kept in memory for the rest of this sync. */
  async get(path: string, keep = true): Promise<string | null> {
    if (this.texts.has(path)) return this.texts.get(path)!;
    const t = await readText(this.p.root, agreedDir(this.p) + '/' + path).catch(() => null);
    if (keep) this.texts.set(path, t);
    return t;
  }
  set(path: string, text: string | null) { this.texts.set(path, text); this.dirty.add(path); }
  /** Every file agreed on. */
  paths() { return syncedPaths(this.p.root, agreedDir(this.p)); }
  async save() {
    for (const path of this.dirty) {
      const t = this.texts.get(path) ?? null, at = agreedDir(this.p) + '/' + path;
      if (t == null) await removePath(this.p.root, at).catch(() => {}); else await writeText(this.p.root, at, t);
    }
    this.dirty.clear();
    await writeText(this.p.root, statePath(this.p), JSON.stringify({ v: 2, cursor: this.cursor, ...(this.clashes.length ? { clashes: this.clashes } : {}) }));
  }
}

const readLocal = (p: Place, path: string) => readText(p.root, base(p) + '/' + path).catch(() => null);
async function writeLocal(p: Place, path: string, text: string | undefined) {
  if (text === undefined) { await removePath(p.root, base(p) + '/' + path).catch(() => {}); return; }
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
async function take(p: Place, s: State, path: string, remote: string | undefined, by: string | null | undefined, at: number | undefined, changed: string[], clashes: Clash[]) {
  const mine = await readLocal(p, path) ?? undefined, agreed = await s.get(path) ?? undefined;
  if (mine === remote) { /* the same already */ }
  else if (mine === agreed || mine === undefined && agreed === undefined) { await writeLocal(p, path, remote); changed.push(path); }
  else {
    const m = merge3(path, parse(agreed), parse(mine), parse(remote), p.me);
    clashes.push(...m.clashes.map(c => ({ ...c, by: by ?? null, when: at })));
    await writeLocal(p, path, m.value === undefined ? undefined : pretty(m.value));
    changed.push(path); s.merged.add(path);
  }
  s.set(path, remote ?? null);
}

/** Behind the floor: the snapshot's files changed since the cursor, then the cursor is the floor. */
async function fromSnapshot(p: Place, s: State, floor: number, changed: string[], clashes: Clash[]) {
  for (let more = true, since = s.cursor; more;) {
    const c = await p.cloud.changes(since);
    if (!Array.isArray(c?.files) || typeof c.seq !== 'number') throw new Error('GLUE Cloud answered strangely');
    more = c.more; since = c.seq;
    const todo = c.files.filter(f => SYNCED.test(f.path));
    // In bundles of files, taken as each comes (a bundle answers as many as fit: the rest is asked again).
    const byPath = new Map(todo.map(f => [f.path, f]));
    for (const f of todo) if (f.deleted) await take(p, s, f.path, undefined, f.by, f.at, changed, clashes);
    const want = todo.filter(f => !f.deleted).map(f => f.path);
    while (want.length) {
      let got = 0;
      for (const line of (await p.cloud.bundle(want.slice(0, 400))).split('\n')) {
        if (!line) continue;
        const [path, , , data] = line.split('\t'), f = byPath.get(path);
        const i = want.indexOf(path);
        if (!f || i < 0) continue;
        want.splice(i, 1); got++;
        await take(p, s, path, await unpackText(data), f.by, f.at, changed, clashes);
      }
      if (!got) throw new Error('GLUE Cloud didn’t send ' + want[0]);
    }
  }
  s.cursor = floor;
}

/** Take in what changed in the cloud. `changed`: the local files that changed (the store reloads them), told as each
    is written: a sync that fails later has still written them, and moved its cursor past them (ADR 0143). */
export async function pull(p: Place, st?: State, changed: string[] = []): Promise<{ state: State; changed: string[]; clashes: Clash[] }> {
  const s = st ?? await State.load(p);
  const clashes: Clash[] = [];
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
          const was = next.has(path) ? next.get(path)!.text : await s.get(path);
          next.set(path, { text: applyChange(was, c), by: e.by, at: e.at });
        }
      }
      for (const [path, n] of next) await take(p, s, path, n.text, n.by, n.at, changed, found);
      s.cursor = r.seq;
    }
    if (found.length) { s.clashes.push(...found); clashes.push(...found); }
    await s.save();
  }
  return { state: s, changed, clashes };
}

// ---- push ----------------------------------------------------------------------------------------------

type Todo = [path: string, change: FileChange, now: string | null];
const entryOf = (batch: Todo[]) => packText(JSON.stringify({ v: 1, f: Object.fromEntries(batch.map(([path, c]) => [path, c])) }));

/** Send what changed here, as entries of the log (`only`: just these files may have; else all are looked
    at). On a stale revision: pulled, merged and sent again (a few times at most). Then the log folded into
    the snapshot, if GLUE Cloud asks. */
export async function push(p: Place, st?: State, only?: Iterable<string>, changed: string[] = []): Promise<{ state: State; pushed: number; changed: string[]; clashes: Clash[] }> {
  let s = st ?? await State.load(p);
  let pushed = 0, compact = false;
  const clashes: Clash[] = [];
  const hinted = only ? new Set([...only].filter(x => SYNCED.test(x))) : null;
  for (let round = 0; round < 5; round++) {
    // One file at a time: read, compared, and only what changed kept.
    const paths = hinted ? [...hinted] : [...new Set([...await syncedPaths(p.root, base(p)), ...await s.paths()])];
    const todo: Todo[] = [];
    for (const path of paths) {
      const now = await readLocal(p, path), c = diffFile(await s.get(path, false), now);
      if (c) todo.push([path, c, now]);
    }
    if (!todo.length) break;
    let stale = false;
    for (let i = 0; i < todo.length;) {
      // As many files as fit one entry.
      let batch: Todo[] = [], n = 0;
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
      for (const [path, , now] of batch) s.set(path, now);
      pushed += batch.length;
      compact ||= !!r.compact;
      await s.save();
    }
    if (!stale) break;
    const pl = await pull(p, s, changed);
    s = pl.state; clashes.push(...pl.clashes);
    // What the merge wrote here goes up too.
    if (hinted) for (const x of s.merged) hinted.add(x);
  }
  if (compact) await checkpoint(p, s).catch(e => console.warn('GLUE Cloud: couldn’t fold the log into the snapshot', e));
  return { state: s, pushed, changed, clashes };
}

/** Fold the log into the snapshot at this device's cursor: the files the log changed, as agreed here. */
async function checkpoint(p: Place, s: State) {
  const at = s.cursor, paths = (await p.cloud.touched(at)).paths.filter(x => SYNCED.test(x));
  // A few files at a time, packed as they go.
  for (let i = 0; i < paths.length || i === 0;) {
    const part: string[] = [];
    let n = 0;
    while (i < paths.length && part.length < MAX_FILES && n < MAX_BODY) {
      const path = paths[i], text = await s.get(path, false);
      const line = text == null ? [path, '', 0, '-'].join('\t') : [path, await sha256(text), new TextEncoder().encode(text).length, await packText(text)].join('\t');
      if (part.length && n + line.length > MAX_BODY) break;
      part.push(line); n += line.length; i++;
    }
    await p.cloud.checkpoint(at, part.join('\n'), i >= paths.length);
    if (i >= paths.length) break;
  }
}

/** Both ways: take in the cloud's changes, then send this side's. `changed`: the only files that may have
    changed here since the last sync (the store says what it wrote); without, every file is looked at. */
/** `changed`: filled with the local files that changed as they're written, so a caller reloads them even when the
    sync fails partway (ADR 0143). */
export async function syncShared(p: Place, changedHere?: Iterable<string>, changed: string[] = []): Promise<SyncResult> {
  const a = await pull(p, undefined, changed);
  const b = await push(p, a.state, changedHere ? [...changedHere, ...a.state.merged] : undefined, changed);
  return { changed: [...new Set(changed)], clashes: [...a.clashes, ...b.clashes], pushed: b.pushed };
}

/** The clashes waiting for an answer (kept with the sync state). */
export async function waitingClashes(p: Place): Promise<Clash[]> { return (await State.load(p)).clashes; }
/** Settle a clash: `value` goes into this device's file at the clash's place (the cloud's value is already
    there when that's the answer), and the clash is forgotten. The next push sends it (the file is one of
    the changed ones). */
export async function resolveClash(p: Place, c: Clash, value: unknown, keepRemote: boolean) {
  const s = await State.load(p);
  if (!keepRemote) await writeLocal(p, c.file, pretty(setAt(parse(await readLocal(p, c.file)) ?? {}, c.at, value)));
  s.clashes = s.clashes.filter(x => !(x.file === c.file && x.at === c.at));
  await s.save();
}
