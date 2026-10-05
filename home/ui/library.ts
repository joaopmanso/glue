/* This computer's GLUE library, as GLUE Home sees it (ADR 0045). Where songs and music folders are, and the library's
   profiles and collections, are the engine's (crates/glue-engine/src/library.rs, ADR 0154); what's left here is pure. */
import type { HomeConfig } from './bridge';
import type { Collection, Track } from '../../src/store/types';
import { collectionHere, meFor, toLocal, unknownComputer, type SharedCollection, type SharedTrack } from '../../src/core/shared/project';
export { describe, type LibraryInfo } from './engine';

/** A collection as this computer has it: a shared one (ADR 0094) seen as this computer (its music folders, its copy of
    each song); any other as it is. `computer`: this computer as GLUE Home knows it (ADR 0108); not known yet, the
    member this folder's entry names (for reading only: nothing is written from here). */
export function here(meta: Collection | SharedCollection | null, pid: string, cid: string, computer?: string | null) {
  const sc = meta && (meta as SharedCollection).shared ? meta as SharedCollection : null;
  const me = sc ? (!unknownComputer(computer) ? computer! : meFor(sc, pid) ?? '') : '';
  return {
    meta: sc ? collectionHere(sc, me) : meta as Collection | null,
    track: (t: Track | SharedTrack): Track => sc ? toLocal(t as SharedTrack, { me, collection: cid, members: sc.members ?? {} }) : t as Track,
  };
}

export const collectionKey = (profile: string, collection: string) => profile + '/' + collection;
/** Shared with the account's other computers (on unless turned off in the settings). */
export const shared = (cfg: HomeConfig | null, profile: string, collection: string) => cfg?.serve?.[collectionKey(profile, collection)] !== false;

/** The folders a search found that the settings should take: only new places, and only for folders the
    settings didn't change since the search began (`before`); a folder picked meanwhile stays as picked.
    Null: nothing to save. */
export function newlyFound(before: Record<string, string>, found: Record<string, string>, cur: Record<string, string>): Record<string, string> | null {
  const add: Record<string, string> = {};
  for (const [id, at] of Object.entries(found)) if (at !== before[id] && cur[id] === before[id]) add[id] = at;
  return Object.keys(add).length ? { ...cur, ...add } : null;
}
