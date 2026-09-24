/* Recognise DJ-library files by their content and parse them (the parsers live in core/interop). */
import type { ImportedLibrary } from '../core/interop/types';
import { isRekordboxXml, parseRekordboxXml } from '../core/interop/rekordbox';
import { isTraktorNml, parseTraktorNml } from '../core/interop/traktor';
import { isAppleLibrary, parseAppleLibrary } from '../core/interop/apple';
import { buildSeratoLibrary, isSeratoDatabase } from '../core/interop/serato';
import { isSqlite, parseEngineDb } from '../core/interop/engine';
import { parseM3u } from '../core/interop/m3u';

export const IMPORT_ACCEPT = '.xml,.nml,.db,.m3u,.m3u8,.crate,*';

async function engine(bytes: Uint8Array, name: string) {
  // sql.js (SQLite in WebAssembly) is only loaded when an Engine library is imported.
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return parseEngineDb(bytes, SQL, name);
}

/** Parse whatever library files were chosen. A Serato "database V2" takes any .crate files alongside. */
export async function parseLibraryFiles(files: File[]): Promise<{ libs: { lib: ImportedLibrary; fileName: string }[]; skipped: string[] }> {
  const libs: { lib: ImportedLibrary; fileName: string }[] = [], skipped: string[] = [];
  const crates = files.filter(f => /\.crate$/i.test(f.name));
  for (const f of files) {
    if (crates.includes(f)) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const head = new TextDecoder().decode(bytes.subarray(0, 4096));
    try {
      const add = (l: ImportedLibrary) => libs.push({ lib: l, fileName: f.name });
      if (isSqlite(bytes)) add(await engine(bytes, f.name));
      else if (isSeratoDatabase(bytes)) add(buildSeratoLibrary(bytes, await Promise.all(crates.map(async c => ({ fileName: c.name, bytes: new Uint8Array(await c.arrayBuffer()) })))));
      else if (isRekordboxXml(head)) add(parseRekordboxXml(new TextDecoder().decode(bytes), f.name));
      else if (isTraktorNml(head)) add(parseTraktorNml(new TextDecoder().decode(bytes), f.name));
      else if (isAppleLibrary(head)) add(parseAppleLibrary(new TextDecoder().decode(bytes), f.name));
      else if (/\.m3u8?$/i.test(f.name) || head.startsWith('#EXTM3U')) {
        const u = new TextDecoder().decode(bytes);   // old .m3u files are often Windows-1252
        add(parseM3u(u.includes('�') && /\.m3u$/i.test(f.name) ? new TextDecoder('windows-1252').decode(bytes) : u, f.name));
      }
      else skipped.push(f.name);
    } catch (e) { console.error(e); skipped.push(f.name + ' (' + ((e as Error).message || 'unreadable') + ')'); }
  }
  if (crates.length && !libs.some(l => l.lib.app === 'serato')) skipped.push(...crates.map(c => c.name + ' (needs Serato’s “database V2” too)'));
  return { libs, skipped };
}

/** Serato keeps its library in a _Serato_ folder: "database V2" plus Subcrates/*.crate. */
export async function readSeratoFolder(dir: FileSystemDirectoryHandle): Promise<ImportedLibrary> {
  const db = new Uint8Array(await (await (await dir.getFileHandle('database V2')).getFile()).arrayBuffer());
  const crates: { fileName: string; bytes: Uint8Array }[] = [];
  try {
    const sub = await dir.getDirectoryHandle('Subcrates');
    for await (const [name, h] of (sub as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries())
      if (h.kind === 'file' && /\.crate$/i.test(name)) crates.push({ fileName: name, bytes: new Uint8Array(await (await (h as FileSystemFileHandle).getFile()).arrayBuffer()) });
  } catch { /* no crates */ }
  return buildSeratoLibrary(db, crates);
}
