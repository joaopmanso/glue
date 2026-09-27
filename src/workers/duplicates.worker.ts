/// <reference lib="webworker" />
/* Finds "same recording" pairs off the main thread (index + bit error rate checks, ADR 0025). */
import { findMatchesFor, findSameRecordings, type Match } from '../core/library/duplicates';
import type { Fingerprint } from '../core/audio/fingerprint';

/** `fresh`: only the matches involving these songs (the others' are known). */
export type DupRequest = { id: number; tracks: { id: string; fp: Fingerprint }[]; fresh?: string[] };
export type DupReply = { id: number; matches: Match[] } | { id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (e: MessageEvent<DupRequest>) => {
  try { const f = e.data.fresh; scope.postMessage({ id: e.data.id, matches: f ? findMatchesFor(e.data.tracks, new Set(f)) : findSameRecordings(e.data.tracks) } satisfies DupReply); }
  catch (err) { scope.postMessage({ id: e.data.id, error: String((err as Error)?.message || err) } satisfies DupReply); }
};
