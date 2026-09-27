/// <reference lib="webworker" />
/* Covers of songs analysed before GLUE kept them, or on another browser (ADR 0072): only their tags
   are read. Several at once (most of the time goes on reading). */
import { coverOf, type Cover } from './cover';

export type CoverRequest = { id: number; src: Blob | string };
export type CoverReply = { id: number; out: Cover | null } | { id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<CoverRequest>) => {
  const { id, src } = e.data;
  let out: Cover | null;
  try { out = await coverOf(src); }
  catch (err) { scope.postMessage({ id, error: String((err as Error)?.message || err) } satisfies CoverReply); return; }
  scope.postMessage({ id, out } satisfies CoverReply, out ? [out.small.buffer, out.large.buffer] : []);
};
