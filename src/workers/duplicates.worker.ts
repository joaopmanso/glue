/// <reference lib="webworker" />
/* Finds "same recording" pairs off the main thread (index + bit error rate checks, ADR 0025). */
import { findSameRecordings, type Match } from '../core/library/duplicates';
import type { Fingerprint } from '../core/audio/fingerprint';

export type DupRequest = { id: number; tracks: { id: string; fp: Fingerprint }[] };
export type DupReply = { id: number; matches: Match[] } | { id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (e: MessageEvent<DupRequest>) => {
  try { scope.postMessage({ id: e.data.id, matches: findSameRecordings(e.data.tracks) } satisfies DupReply); }
  catch (err) { scope.postMessage({ id: e.data.id, error: String((err as Error)?.message || err) } satisfies DupReply); }
};
