/* rekordbox XML (Pioneer's official exchange format). Spec: cdn.rekordbox.com …/xml_format_list.pdf */
import { child, childrenNamed, parseXml, type XNode } from './xml';
import { blankTrack, fileUrlToPath, num, type ImportedLibrary, type ImportedList } from './types';

export function isRekordboxXml(head: string) { return /<DJ_PLAYLISTS[\s>]/.test(head); }

export function parseRekordboxXml(xml: string, fileName = 'rekordbox.xml'): ImportedLibrary {
  const root = child(parseXml(xml), 'DJ_PLAYLISTS');
  if (!root) throw new Error('This isn’t a rekordbox XML file (no DJ_PLAYLISTS element).');
  const coll = child(root, 'COLLECTION');
  const tracks = [], byLocation = new Map<string, string>();
  for (const t of coll ? childrenNamed(coll, 'TRACK') : []) {
    const a = t.attrs, id = a.TrackID || a.Location;
    if (!id || !a.Location) continue;
    const tr = blankTrack(id, fileUrlToPath(a.Location));
    tr.title = a.Name || ''; tr.artist = a.Artist || ''; tr.album = a.Album || ''; tr.genre = a.Genre || '';
    tr.label = a.Label || ''; tr.comment = a.Comments || ''; tr.year = a.Year && a.Year !== '0' ? a.Year : '';
    tr.duration = num(a.TotalTime); tr.bpm = num(a.AverageBpm) || null; tr.key = a.Tonality || null;
    const r = num(a.Rating); tr.rating = r == null ? null : Math.round(r / 51);
    tr.playCount = num(a.PlayCount); tr.dateAdded = a.DateAdded || null; tr.size = num(a.Size);
    // POSITION_MARK: Type 0 cue · 1 fade-in · 2 fade-out · 3 load · 4 loop; Num −1 memory cue, 0–7 hot cue A–H.
    tr.cueList = childrenNamed(t, 'POSITION_MARK').map(m => {
      const p = m.attrs, type = p.Type ?? '0', slot = num(p.Num), end = num(p.End);
      const rgb = p.Red != null && p.Green != null && p.Blue != null ? '#' + [p.Red, p.Green, p.Blue].map(v => Math.max(0, Math.min(255, Number(v) || 0)).toString(16).padStart(2, '0')).join('') : null;
      return { t: num(p.Start) ?? 0, kind: type === '4' ? 'loop' as const : type === '3' ? 'load' as const : type === '1' || type === '2' ? 'fade' as const : 'cue' as const,
        num: slot != null && slot >= 0 ? slot : null, name: p.Name || '', color: rgb, end: type === '4' && end != null ? end : null };
    }).sort((a, b) => a.t - b.t);
    tr.cues = tr.cueList.length;
    tracks.push(tr);
    byLocation.set(a.Location, id);
  }
  const lists: ImportedList[] = [];
  let seq = 0;
  const walk = (node: XNode, parent: string | null) => {
    for (const n of childrenNamed(node, 'NODE')) {
      const id = 'n' + (seq++) + ':' + (n.attrs.Name || '');
      if (n.attrs.Type === '0') {
        lists.push({ externalId: id, kind: 'folder', name: n.attrs.Name || 'Folder', parent, items: [] });
        walk(n, id);
      } else {
        const byLoc = n.attrs.KeyType === '1';
        const items = childrenNamed(n, 'TRACK').map(t => byLoc ? byLocation.get(t.attrs.Key) ?? '' : t.attrs.Key).filter(Boolean);
        lists.push({ externalId: id, kind: 'playlist', name: n.attrs.Name || 'Playlist', parent, items });
      }
    }
  };
  const pl = child(root, 'PLAYLISTS'), top = pl && child(pl, 'NODE');
  if (top) walk(top, null);   // skip the ROOT node itself
  return { app: 'rekordbox', name: 'Rekordbox (' + fileName + ')', tracks, lists };
}
