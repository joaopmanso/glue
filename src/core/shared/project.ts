/* A shared collection's records as this computer sees them (ADR 0094), and back. Pure.
   - A song's `copies[computer]` say where each computer has its file; this computer's becomes the
     song's usual fields (rootId, relPath, status…). A song only other computers have is a `remote` row,
     pointing at one of them (streamed through its GLUE Home).
   - Analyses are per computer: this computer's, else another's.
   - Music folders are per computer (`rootsBy`).
   Only this computer's own parts are ever written back from here. */
import type { AnalysisSummary, Collection, Root, Track } from '../../store/types';
import { INFO_FIELDS } from '../library/tags';

/** A computer's copy of a song: where its file is, and what only that file knows. */
export const COPY_FIELDS = ['status', 'rootId', 'relPath', 'fileKey', 'importPath', 'size', 'mtime', 'unwritten', 'sources'] as const;
type CopyField = typeof COPY_FIELDS[number];
export type Copy = Pick<Track, CopyField>;
/** A song as the shared collection holds it. */
export type SharedTrack = Omit<Track, CopyField | 'onDevices' | 'remote'> & { copies: Record<string, Copy> };
/** A shared collection's own file: the usual one, with each computer's music folders and profile. */
export type SharedCollection = Omit<Collection, 'roots'> & { shared: true; rootsBy: Record<string, Root[]>; members: Record<string, { profile: string; name: string }> };

/** rootsBy: each computer's music folders, to say where another computer's copy is. */
export interface Here { me: string; collection: string; members: SharedCollection['members']; rootsBy?: SharedCollection['rootsBy'] }

/** A computer's id that must never be written into a shared collection (ADR 0108): none, or the old
    stand-in a store used when it didn't know which computer it was on. */
export const OLD_STAND_IN = 'this-computer';
export const unknownComputer = (me: string | null | undefined) => !me || me === OLD_STAND_IN;
/** May this GLUE folder (`folder`: its profile folder's id) write computer `me`'s parts (its copies, its
    analyses, its music folders)? Only the folder recorded for it, or any while none is (ADR 0108): a second
    GLUE folder on the same computer (another browser's own) reads them, and writes none. */
export function writesFor(c: Pick<SharedCollection, 'members'> | undefined, me: string | null | undefined, folder: string): boolean {
  if (unknownComputer(me)) return false;
  const holder = c?.members?.[me!]?.profile;
  return !holder || holder === folder;
}

const pick = <T extends object, K extends keyof T>(o: T, ks: readonly K[]) => { const out = {} as Pick<T, K>; for (const k of ks) if (o[k] !== undefined) out[k] = o[k]; return out; };

/** The song as this computer shows it. */
export function toLocal(s: SharedTrack, here: Here): Track {
  const { copies, ...common } = s;
  const who = Object.keys(copies ?? {});
  const names = who.map(c => here.members[c]?.name ?? c);
  const mine = copies?.[here.me];
  if (mine) return { ...(common as Omit<Track, CopyField>), ...mine, sources: mine.sources ?? [], ...(who.length > 1 ? { onDevices: names } : {}) } as Track;
  // Another computer's: shown as it is there, played from there.
  const c = who.sort()[0], theirs = c ? copies[c] : undefined;
  const t: Track = {
    ...(common as Omit<Track, CopyField>), status: theirs?.status ?? 'unlinked', rootId: null, relPath: null, importPath: theirs?.importPath ?? null,
    size: theirs?.size ?? null, mtime: theirs?.mtime ?? null, sources: [], onDevices: names,
  } as Track;
  if (c) {
    const folder = here.rootsBy?.[c]?.find(r => r.id === theirs?.rootId)?.name;
    const where = theirs?.relPath ? (folder ? folder + '/' : '') + theirs.relPath : undefined;
    t.remote = { device: c, name: here.members[c]?.name ?? c, profile: here.members[c]?.profile, collection: here.collection, id: s.id, ...(where ? { where } : {}) };
  }
  return t;
}

/** The song as the shared collection holds it: this computer's copy from `t` (unless it's another's
    song), everyone else's as they were (told to write changed song info into their files). */
export function toShared(t: Track, here: Here, prev?: SharedTrack): SharedTrack {
  const { onDevices: _d, remote, ...rest } = t;
  const common = { ...rest } as Record<string, unknown>;
  for (const k of COPY_FIELDS) delete common[k];
  const copies = { ...(prev?.copies ?? {}) };
  if (!remote && !unknownComputer(here.me)) copies[here.me] = pick(t, COPY_FIELDS) as Copy;
  // Song info changed here: every other computer writes it into its own file (ADR 0097).
  if (prev) {
    const was = prev as unknown as Record<string, unknown>;
    const changed = INFO_FIELDS.filter(f => (common[f] ?? '') !== (was[f] ?? ''));
    if (changed.length) for (const c of Object.keys(copies)) {
      if (c === here.me || !copies[c].relPath || copies[c].fileKey) continue;
      copies[c] = { ...copies[c], unwritten: [...new Set([...(copies[c].unwritten ?? []), ...changed])] };
    }
  }
  return { ...(common as Omit<SharedTrack, 'copies'>), copies };
}

/** Analyses by computer: this computer's, else another's (its song's), else none. */
export function analysisHere(by: Record<string, AnalysisSummary> | undefined, me: string): AnalysisSummary | undefined {
  if (!by) return undefined;
  return by[me] ?? by[Object.keys(by).sort()[0]];
}
/** This computer's analysis into the shared record (others' kept). */
export function analysisShared(a: AnalysisSummary, me: string, prev?: Record<string, AnalysisSummary>): Record<string, AnalysisSummary> {
  if (unknownComputer(me)) return { ...(prev ?? {}) };
  return { ...(prev ?? {}), [me]: a };
}

/** The collection as this computer sees it: its own music folders. */
export function collectionHere(c: SharedCollection, me: string): Collection {
  const { rootsBy, members: _m, shared: _s, ...rest } = c;
  return { ...rest, roots: rootsBy?.[me] ?? [] };
}
/** This computer is a member (a computer holding copies of the songs) once it holds one (`holds`) or has a
    music folder; a device that only browses (a phone) isn't (ADR 0101). Its entry and music folders are
    written only from the GLUE folder recorded for it (ADR 0108): another browser's own GLUE folder on the
    same computer rewrote the desktop's entry (2026-09-30). An unknown computer writes neither. */
export function collectionShared(c: Collection, me: string, prev: SharedCollection | undefined, member: { profile: string; name: string }, holds = false): SharedCollection {
  const { roots, ...rest } = c;
  const joins = writesFor(prev, me, member.profile) && (holds || roots.length > 0 || !!prev?.members?.[me]);
  return { ...rest, shared: true, rootsBy: { ...(prev?.rootsBy ?? {}), ...(joins ? { [me]: roots } : {}) }, members: { ...(prev?.members ?? {}), ...(joins ? { [me]: member } : {}) } };
}

/** Which member a GLUE folder's copy of a shared collection is (its computer), when nothing better says
    (ADR 0108: GLUE Home's computer, or this browser's device): `device` if it's a member, else the member
    whose profile this folder's is. For showing only: nothing is written as the computer it guesses. */
export function meFor(c: Pick<SharedCollection, 'members'>, pid: string, device?: string | null): string | null {
  const members = c.members ?? {};
  if (device && members[device]) return device;
  return Object.keys(members).find(m => members[m].profile === pid && !unknownComputer(m)) ?? device ?? null;
}
