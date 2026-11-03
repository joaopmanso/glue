/* What a download holds and what each file is called (ADR 0193). Names are safe on Windows and on the FAT32 and exFAT of
   a USB stick. A playlist is a folder, its songs numbered: a player that lists a folder by name keeps the set's order. */

export interface PlanSong { id: string; fileName: string }
export interface PlanItem { id: string; path: string }
/** A playlist: where it goes (its folders, then itself), its songs in order. */
export interface PlanList { path: { id: string; name: string }[]; songs: PlanSong[] }

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
const MAX_NAME = 120;

/** A file or folder name any disk takes. */
export function safeName(s: string): string {
  let n = s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (!n) n = 'Untitled';
  if (RESERVED.test(n)) n = '_' + n;
  if (n.length > MAX_NAME) {
    const dot = n.lastIndexOf('.'), ext = dot > 0 && n.length - dot <= 8 ? n.slice(dot) : '';
    n = n.slice(0, MAX_NAME - ext.length).trimEnd().replace(/[. ]+$/, '') + ext;
  }
  return n;
}

/** Each name once in a folder, whatever its case: "a.mp3", "a (2).mp3". */
function unique(name: string, used: Set<string>): string {
  let n = name;
  for (let i = 2; used.has(n.toLowerCase()); i++) {
    const dot = name.lastIndexOf('.');
    n = dot > 0 ? name.slice(0, dot) + ' (' + i + ')' + name.slice(dot) : name + ' (' + i + ')';
  }
  used.add(n.toLowerCase());
  return n;
}

/** Songs picked one by one: side by side, with their own names. */
export function planSongs(songs: PlanSong[]): PlanItem[] {
  const used = new Set<string>();
  return songs.map(s => ({ id: s.id, path: unique(safeName(s.fileName), used) }));
}

/** Playlists: each one a folder, its songs numbered from 01. A song in two playlists is in both; two playlists of one
    name stay two folders. */
export function planLists(lists: PlanList[]): PlanItem[] {
  const out: PlanItem[] = [], inFolder = new Map<string, Set<string>>(), folderOf = new Map<string, string>();
  const names = (folder: string) => inFolder.get(folder) ?? inFolder.set(folder, new Set()).get(folder)!;
  for (const l of lists) {
    let at = '';
    for (const p of l.path) {
      let mine = folderOf.get(p.id);
      if (mine == null) { mine = (at ? at + '/' : '') + unique(safeName(p.name), names(at)); folderOf.set(p.id, mine); }
      at = mine;
    }
    const width = Math.max(2, String(l.songs.length).length);
    l.songs.forEach((s, i) => {
      const file = unique(safeName(String(i + 1).padStart(width, '0') + ' ' + s.fileName), names(at));
      out.push({ id: s.id, path: (at ? at + '/' : '') + file });
    });
  }
  return out;
}
