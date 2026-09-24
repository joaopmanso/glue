/* Traktor collection.nml. LOCATION = VOLUME + DIR ("/:"-separated) + FILE. */
import { child, childrenNamed, parseXml, type XNode } from './xml';
import { blankTrack, num, type ImportedLibrary, type ImportedList } from './types';

export function isTraktorNml(head: string) { return /<NML[\s>]/.test(head); }

const MAJOR = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** MUSICAL_KEY VALUE: 0–11 = C…B major, 12–23 = C…B minor. */
export function traktorKey(v: number): string { return MAJOR[v % 12] + (v >= 12 ? 'm' : ''); }

export function nmlPath(loc: Record<string, string>): string {
  const dir = (loc.DIR || '').split('/:').join('/'), file = loc.FILE || '', vol = loc.VOLUME || '';
  if (/^[A-Za-z]:$/.test(vol)) return vol + dir + file;                      // Windows drive
  if (!vol || vol === 'Macintosh HD') return dir + file;                        // macOS boot volume
  return '/Volumes/' + vol + dir + file;
}
const primaryKey = (loc: Record<string, string>) => (loc.VOLUME || '') + (loc.DIR || '') + (loc.FILE || '');

export function parseTraktorNml(xml: string, fileName = 'collection.nml'): ImportedLibrary {
  const nml = child(parseXml(xml), 'NML');
  if (!nml) throw new Error('This isn’t a Traktor NML file.');
  const coll = child(nml, 'COLLECTION');
  const tracks = [];
  for (const e of coll ? childrenNamed(coll, 'ENTRY') : []) {
    const loc = child(e, 'LOCATION')?.attrs;
    if (!loc || !loc.FILE) continue;
    const t = blankTrack(primaryKey(loc), nmlPath(loc));
    t.title = e.attrs.TITLE || ''; t.artist = e.attrs.ARTIST || '';
    t.album = child(e, 'ALBUM')?.attrs.TITLE || '';
    const info = child(e, 'INFO')?.attrs || {};
    t.genre = info.GENRE || ''; t.comment = info.COMMENT || ''; t.label = info.LABEL || '';
    t.duration = num(info.PLAYTIME); t.playCount = num(info.PLAYCOUNT);
    const rk = num(info.RANKING); t.rating = rk == null ? null : Math.round(rk / 51);
    t.dateAdded = info.IMPORT_DATE ? info.IMPORT_DATE.replace(/\//g, '-') : null;
    t.bpm = num(child(e, 'TEMPO')?.attrs.BPM) || null;
    const mk = num(child(e, 'MUSICAL_KEY')?.attrs.VALUE);
    t.key = info.KEY || (mk != null ? traktorKey(mk) : null);
    t.size = info.FILESIZE ? (num(info.FILESIZE) || 0) * 1024 : null;   // FILESIZE is in kB
    // CUE_V2: TYPE 0 cue · 1 fade-in · 2 fade-out · 3 load · 4 beat grid (skipped) · 5 loop; START / LEN in ms; HOTCUE −1 none.
    t.cueList = childrenNamed(e, 'CUE_V2').filter(c => c.attrs.TYPE !== '4').map(c => {
      const a = c.attrs, type = a.TYPE ?? '0', hc = num(a.HOTCUE), start = (num(a.START) ?? 0) / 1000, len = (num(a.LEN) ?? 0) / 1000;
      return { t: start, kind: type === '5' ? 'loop' as const : type === '3' ? 'load' as const : type === '1' || type === '2' ? 'fade' as const : 'cue' as const,
        num: hc != null && hc >= 0 ? hc : null, name: a.NAME && a.NAME !== 'n.n.' ? a.NAME : '', color: null, end: type === '5' && len > 0 ? start + len : null };
    }).sort((a, b) => a.t - b.t);
    t.cues = t.cueList.length;
    tracks.push(t);
  }
  const lists: ImportedList[] = [];
  let seq = 0;
  const walk = (node: XNode, parent: string | null) => {
    const sub = child(node, 'SUBNODES');
    for (const n of sub ? childrenNamed(sub, 'NODE') : []) {
      const id = 'n' + (seq++) + ':' + (n.attrs.NAME || '');
      if (n.attrs.TYPE === 'FOLDER') { lists.push({ externalId: id, kind: 'folder', name: n.attrs.NAME || 'Folder', parent, items: [] }); walk(n, id); }
      else if (n.attrs.TYPE === 'PLAYLIST') {
        const pl = child(n, 'PLAYLIST');
        const items = pl ? childrenNamed(pl, 'ENTRY').map(en => child(en, 'PRIMARYKEY')?.attrs.KEY || '').filter(Boolean) : [];
        lists.push({ externalId: id, kind: 'playlist', name: n.attrs.NAME || 'Playlist', parent, items });
      }
    }
  };
  const pls = child(nml, 'PLAYLISTS'), root = pls && child(pls, 'NODE');
  if (root) walk(root, null);
  return { app: 'traktor', name: 'Traktor (' + fileName + ')', tracks, lists };
}
