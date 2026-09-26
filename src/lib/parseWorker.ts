/* DJ-library files parsed in a worker (ADR 0063), or on the page when workers can't be made. */
import { parseLibraryFiles } from './imports';
import type { InteropReply } from '../workers/interop.worker';

let worker: Worker | null = null, nextId = 1;
const waiting = new Map<number, { resolve: (r: Awaited<ReturnType<typeof parseLibraryFiles>>) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/interop.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<InteropReply>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data.r); else w.reject(new Error(e.data.error));
    };
    worker.onerror = e => {
      e.preventDefault();
      const err = new Error('The library reader stopped: ' + (e.message || 'out of memory?'));
      for (const w of waiting.values()) w.reject(err);
      waiting.clear();
      worker?.terminate(); worker = null;
    };
  } catch { worker = null; }
  return worker;
}

export function parseInWorker(files: File[]): ReturnType<typeof parseLibraryFiles> {
  const w = getWorker();
  if (!w) return parseLibraryFiles(files);
  const id = nextId++;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); w.postMessage({ id, files }); });
}

/** A _Serato_ folder's files: "database V2" and its crates (parsed together). */
export async function seratoFiles(dir: FileSystemDirectoryHandle): Promise<File[]> {
  const files = [await (await dir.getFileHandle('database V2')).getFile()];
  try {
    const sub = await dir.getDirectoryHandle('Subcrates');
    for await (const [name, h] of (sub as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries())
      if (h.kind === 'file' && /\.crate$/i.test(name)) files.push(await (h as FileSystemFileHandle).getFile());
  } catch { /* no crates */ }
  return files;
}
