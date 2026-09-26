/// <reference lib="webworker" />
/* DJ-library files parsed off the page (ADR 0063): an Engine DJ database can be 150 MB of SQLite
   (sql.js), and live updates re-read it whenever it changes. */
import { parseLibraryFiles } from '../lib/imports';

export type InteropRequest = { id: number; files: File[] };
export type InteropReply = { id: number; ok: true; r: Awaited<ReturnType<typeof parseLibraryFiles>> } | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<InteropRequest>) => {
  const { id, files } = e.data;
  try { scope.postMessage({ id, ok: true, r: await parseLibraryFiles(files) } satisfies InteropReply); }
  catch (err) { scope.postMessage({ id, ok: false, error: String((err as Error)?.message || err) } satisfies InteropReply); }
};
