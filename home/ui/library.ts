/* This computer's GLUE library, as GLUE Home's settings window sees it (ADR 0045): the profiles and collections are the
   engine's (crates/glue-engine/src/library.rs, ADR 0154). */
import type { HomeConfig } from './bridge';
export { describe, type LibraryInfo } from './engine';

export const collectionKey = (profile: string, collection: string) => profile + '/' + collection;
/** Shared with the account's other computers (on unless turned off in the settings). */
export const shared = (cfg: HomeConfig | null, profile: string, collection: string) => cfg?.serve?.[collectionKey(profile, collection)] !== false;
