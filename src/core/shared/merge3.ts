/* Three-way merge of a shared collection's files (ADR 0094): the last copy both sides agreed on (base),
   this device's (local) and the cloud's (remote). Pure: JSON in, JSON out.
   - Only one side changed something: that side's value, silently.
   - Both changed it to the same: fine.
   - Both changed it differently: a clash. The cloud's value is kept and the clash is reported, for the
     prompt to settle (phase 3).
   Special parts:
   - per-computer parts (a song's `copies`, analyses by computer) belong to their computer;
   - sets of names (tags, genres…) merge as sets;
   - a playlist's songs merge three ways (additions and removals from both sides). */

export interface Clash { file: string; at: string; local: unknown; remote: unknown }
export interface Merged<T> { value: T | undefined; clashes: Clash[] }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Keys whose value is a set of names: merged as sets, never a clash. */
const SETS = new Set(['tags', 'genres', 'ignoredDupes', 'dupConfirmed', 'edited', 'sources']);
/** Keys whose value is an ordered list of ids: a three-way sequence merge. */
const SEQUENCES = new Set(['items']);

/** How a file's JSON is merged: which object keys are per-computer, and where lists live. */
function kind(file: string): 'tracks' | 'analysis' | 'lists' | 'collection' | 'other' {
  if (/^tracks\//.test(file)) return 'tracks';
  if (/^analysis\//.test(file)) return 'analysis';
  if (/^lists\//.test(file)) return 'lists';
  if (file === 'collection.json') return 'collection';
  return 'other';
}

export function mergeSets(base: unknown[] | undefined, local: unknown[] | undefined, remote: unknown[] | undefined): unknown[] | undefined {
  if (local === undefined && remote === undefined) return undefined;
  const b = new Set((base ?? []).map(x => JSON.stringify(x))), l = (local ?? []).map(x => JSON.stringify(x)), r = (remote ?? []).map(x => JSON.stringify(x));
  const ls = new Set(l), rs = new Set(r);
  const gone = new Set([...b].filter(x => !ls.has(x) || !rs.has(x)));
  const out: string[] = [];
  for (const x of [...r, ...l]) if (!gone.has(x) && !out.includes(x)) out.push(x);
  return out.map(x => JSON.parse(x));
}

/** A playlist's songs: the cloud's order, less what this side removed, plus what it added (after the song
    it followed here). Both sides reordering the same songs differently is a clash. */
export function mergeSequence(base: string[], local: string[], remote: string[]): { value: string[]; clash: boolean } {
  const b = new Set(base), l = new Set(local), r = new Set(remote);
  const out = remote.filter(x => !(b.has(x) && !l.has(x)));
  for (let i = 0; i < local.length; i++) {
    const x = local[i];
    if (b.has(x) || r.has(x) || out.includes(x)) continue;
    // After the nearest song before it (here) that's in the result; else at the start.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = out.indexOf(local[j]); if (k >= 0) { at = k + 1; break; } }
    out.splice(at, 0, x);
  }
  const common = (xs: string[]) => xs.filter(x => b.has(x) && l.has(x) && r.has(x)).join('\n');
  const clash = common(local) !== common(base) && common(remote) !== common(base) && common(local) !== common(remote);
  return { value: out, clash };
}

function mergeValue(file: string, at: string[], base: unknown, local: unknown, remote: unknown, me: string, clashes: Clash[]): unknown {
  if (same(local, remote)) return local;
  if (same(base, local)) return remote;
  if (same(base, remote)) return local;
  const key = at[at.length - 1] ?? '', k = kind(file);
  // Per-computer parts: this computer's own is this side's; the others' are the cloud's.
  const perComputer = (k === 'tracks' && at[at.length - 2] === 'copies') || (k === 'analysis' && at.length === 3) || (k === 'collection' && at[at.length - 2] === 'rootsBy');
  if (perComputer) return key === me ? local : remote;
  if (SETS.has(key) && (Array.isArray(local) || Array.isArray(remote) || local === undefined || remote === undefined) && (Array.isArray(local) || Array.isArray(remote)))
    return mergeSets(base as unknown[] | undefined, local as unknown[] | undefined, remote as unknown[] | undefined);
  if (SEQUENCES.has(key) && Array.isArray(local) && Array.isArray(remote)) {
    const s = mergeSequence(Array.isArray(base) ? base as string[] : [], local as string[], remote as string[]);
    if (s.clash) clashes.push({ file, at: at.join('.'), local, remote });
    return s.value;
  }
  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {}, out: Record<string, unknown> = {};
    for (const x of new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(b)])) {
      const v = mergeValue(file, [...at, x], b[x], local[x], remote[x], me, clashes);
      if (v !== undefined) out[x] = v;
    }
    return out;
  }
  // Both changed it differently (or one side deleted what the other changed): the cloud's, reported.
  clashes.push({ file, at: at.join('.'), local, remote });
  return remote;
}

/** Merge one file. `undefined` means the file doesn't exist on that side. */
export function merge3<T>(file: string, base: T | undefined, local: T | undefined, remote: T | undefined, me: string): Merged<T> {
  const clashes: Clash[] = [];
  const value = mergeValue(file, [], base, local, remote, me, clashes) as T | undefined;
  return { value, clashes };
}
