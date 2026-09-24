/* Serato "database V2" and .crate files: nested TLV records (4-byte tag, 4-byte BE length, data).
   Tag prefix gives the type: o nested, t/p UTF-16BE text, u uint32, s uint16, b byte.
   Sources: github.com/mixxxdj/mixxx/wiki/Serato-Database-Format, Holzhaus/serato-tags. */
import { blankTrack, num, type ImportedLibrary, type ImportedList, type ImportedTrack } from './types';

export interface SField { tag: string; value: string | number | SField[] | Uint8Array }

const utf16be = new TextDecoder('utf-16be');
export function parseSerato(b: Uint8Array, start = 0, end = b.length): SField[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out: SField[] = [];
  let p = start;
  while (p + 8 <= end) {
    const tag = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]), len = dv.getUint32(p + 4), d = p + 8;
    if (d + len > end) break;
    const k = tag[0];
    let value: SField['value'];
    if (k === 'o' || k === 'r') value = parseSerato(b, d, d + len);
    else if (k === 't' || k === 'p' || tag === 'vrsn') value = utf16be.decode(b.subarray(d, d + len)).replace(/\u0000+$/, '');
    else if (k === 'u' && len === 4) value = dv.getUint32(d);
    else if (k === 's' && len === 2) value = dv.getUint16(d);
    else if (k === 'b' && len === 1) value = b[d];
    else value = b.slice(d, d + len);
    out.push({ tag, value });
    p = d + len;
  }
  return out;
}

const get = (fs: SField[], tag: string) => fs.find(f => f.tag === tag)?.value;
const str = (fs: SField[], tag: string) => { const v = get(fs, tag); return typeof v === 'string' ? v : ''; };
/** Serato paths are relative to the drive root, without a leading slash. */
export const seratoPath = (p: string) => '/' + p.replace(/\\/g, '/').replace(/^\/+/, '');

export function isSeratoDatabase(b: Uint8Array) {
  return b.length > 8 && String.fromCharCode(b[0], b[1], b[2], b[3]) === 'vrsn';
}

export function parseSeratoDatabase(b: Uint8Array): ImportedTrack[] {
  const tracks: ImportedTrack[] = [];
  for (const f of parseSerato(b)) {
    if (f.tag !== 'otrk' || !Array.isArray(f.value)) continue;
    const fs = f.value, path = str(fs, 'pfil');
    if (!path) continue;
    const t = blankTrack(seratoPath(path).toLowerCase(), seratoPath(path));
    t.title = str(fs, 'tsng'); t.artist = str(fs, 'tart'); t.album = str(fs, 'talb'); t.genre = str(fs, 'tgen');
    t.label = str(fs, 'tlbl'); t.comment = str(fs, 'tcom'); t.year = str(fs, 'ttyr');
    t.bpm = num(str(fs, 'tbpm')) || null; t.key = str(fs, 'tkey') || null;
    const len = str(fs, 'tlen');   // "03:45.12" or seconds
    if (len) { const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(len); t.duration = m ? +m[1] * 60 + +m[2] : num(len); }
    const added = get(fs, 'uadd');
    if (typeof added === 'number' && added > 0) t.dateAdded = new Date(added * 1000).toISOString().slice(0, 10);
    const size = str(fs, 'tsiz'); t.size = size ? (num(size.replace(/[^\d.]/g, '')) ?? null) : null;
    tracks.push(t);
  }
  return tracks;
}

/** A crate: the name comes from the file name; "%%" separates nested crates. */
export function parseSeratoCrate(b: Uint8Array): string[] {
  const out: string[] = [];
  for (const f of parseSerato(b)) if (f.tag === 'otrk' && Array.isArray(f.value)) {
    const p = str(f.value, 'ptrk');
    if (p) out.push(seratoPath(p).toLowerCase());
  }
  return out;
}

export function buildSeratoLibrary(database: Uint8Array, crates: { fileName: string; bytes: Uint8Array }[]): ImportedLibrary {
  const tracks = parseSeratoDatabase(database), known = new Set(tracks.map(t => t.externalId));
  const lists: ImportedList[] = [], folders = new Map<string, string>();
  const folderFor = (parts: string[]): string | null => {
    let parent: string | null = null;
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(0, i + 1).join('%%');
      if (!folders.has(key)) { const id = 'f:' + key; folders.set(key, id); lists.push({ externalId: id, kind: 'folder', name: parts[i], parent, items: [] }); }
      parent = folders.get(key)!;
    }
    return parent;
  };
  for (const c of [...crates].sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    const parts = c.fileName.replace(/\.crate$/i, '').split('%%');
    const parent = folderFor(parts.slice(0, -1));
    lists.push({ externalId: 'c:' + c.fileName, kind: 'playlist', name: parts[parts.length - 1], parent, items: parseSeratoCrate(c.bytes).filter(x => known.has(x)) });
  }
  return { app: 'serato', name: 'Serato', tracks, lists };
}
