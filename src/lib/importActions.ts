/* UI actions for bringing DJ libraries in. */
import { lib } from './library.svelte';
import { parseLibraryFiles, readSeratoFolder } from './imports';
import type { FoundLibrary } from '../core/library/scan';
import type { ImportedLibrary } from '../core/interop/types';
import type { ImportReport } from '../store/merge';

function report(name: string, r: ImportReport | null) {
  if (!r) return '';
  const bits = [r.tracks + ' track' + (r.tracks === 1 ? '' : 's'), r.lists + ' playlist' + (r.lists === 1 ? '' : 's') + ' or folder' + (r.lists === 1 ? '' : 's')];
  if (r.linked + r.matched) bits.push((r.linked + r.matched) + ' matched to tracks you already had');
  return name + ': ' + bits.join(', ') + '.';
}

async function run(label: string, fn: () => Promise<{ lib: ImportedLibrary; fileName: string }[]>, skipped: string[] = []) {
  lib.job = { text: 'Importing ' + label + '…', done: 0, total: null };
  try {
    const libs = await fn();
    const lines = libs.map(({ lib: l, fileName }) => report(l.name, lib.importLibrary(l, fileName)));
    if (skipped.length) lines.push('Not recognised: ' + skipped.join(', ') + '.');
    lib.notice = lines.join(' ') || 'Nothing to import.';
  } catch (e) {
    console.error(e);
    lib.notice = 'Couldn’t import ' + label + ': ' + ((e as Error).message || e);
  } finally { lib.job = null; }
}

export async function importFiles(files: File[]) {
  if (!files.length) return;
  const skipped: string[] = [];
  await run(files.length === 1 ? files[0].name : files.length + ' files', async () => {
    const r = await parseLibraryFiles(files);
    skipped.push(...r.skipped);
    return r.libs;
  }, skipped);
}

export async function importSeratoFolder(dir: FileSystemDirectoryHandle) {
  await run('Serato', async () => [{ lib: await readSeratoFolder(dir), fileName: 'database V2' }]);
}

export async function importFound(f: FoundLibrary) {
  if (f.kind === 'serato') return importSeratoFolder(f.handle as FileSystemDirectoryHandle);
  const file = await (f.handle as FileSystemFileHandle).getFile();
  await importFiles([file]);
}

export async function pickSeratoFolder() {
  const p = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!p) { lib.notice = 'This browser can’t open folders. Choose Serato’s “database V2” file and its .crate files with Import library file instead.'; return; }
  try {
    const dir = await p({ id: 'mco-serato', mode: 'read', startIn: 'music' });
    try { await dir.getFileHandle('database V2'); } catch { lib.notice = 'That folder has no “database V2”. Pick the _Serato_ folder (usually in Music).'; return; }
    await importSeratoFolder(dir);
  } catch (e) { if ((e as DOMException).name !== 'AbortError') lib.notice = (e as Error).message; }
}
