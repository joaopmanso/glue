/* Apple Music / iTunes library XML (a property list): Tracks dict + Playlists array. */
import { child, parseXml, type XNode } from './xml';
import { blankTrack, fileUrlToPath, type ImportedLibrary, type ImportedList } from './types';

export function isAppleLibrary(head: string) { return /<plist[\s>]/.test(head); }

type PV = string | number | boolean | PV[] | { [k: string]: PV } | null;
function plistValue(n: XNode): PV {
  switch (n.name) {
    case 'dict': {
      const o: Record<string, PV> = {};
      for (let i = 0; i + 1 < n.children.length; i += 2) if (n.children[i].name === 'key') o[n.children[i].text] = plistValue(n.children[i + 1]);
      return o;
    }
    case 'array': return n.children.map(plistValue);
    case 'integer': case 'real': return Number(n.text);
    case 'true': return true;
    case 'false': return false;
    case 'string': case 'date': case 'data': return n.text;
    default: return null;
  }
}

export function parseAppleLibrary(xml: string, fileName = 'Library.xml'): ImportedLibrary {
  const plist = child(parseXml(xml), 'plist'), top = plist?.children.find(c => c.name === 'dict');
  if (!top) throw new Error('This isn’t an Apple Music / iTunes library file.');
  const lib = plistValue(top) as Record<string, PV>;
  const trackDict = (lib.Tracks || {}) as Record<string, Record<string, PV>>;
  const tracks = [];
  for (const [id, t] of Object.entries(trackDict)) {
    if (!t.Location || t['Track Type'] === 'URL' || t.Podcast || t['Movie'] || t['TV Show']) continue;
    const tr = blankTrack(id, fileUrlToPath(String(t.Location)));
    tr.title = String(t.Name ?? ''); tr.artist = String(t.Artist ?? ''); tr.album = String(t.Album ?? '');
    tr.genre = String(t.Genre ?? ''); tr.comment = String(t.Comments ?? ''); tr.year = t.Year ? String(t.Year) : '';
    tr.duration = typeof t['Total Time'] === 'number' ? t['Total Time'] / 1000 : null;
    tr.bpm = typeof t.BPM === 'number' && t.BPM > 0 ? t.BPM : null;
    tr.rating = typeof t.Rating === 'number' && !t['Rating Computed'] ? Math.round(t.Rating / 20) : null;
    tr.playCount = typeof t['Play Count'] === 'number' ? t['Play Count'] : null;
    tr.dateAdded = t['Date Added'] ? String(t['Date Added']).slice(0, 10) : null;
    tr.size = typeof t.Size === 'number' ? t.Size : null;
    tracks.push(tr);
  }
  const known = new Set(tracks.map(t => t.externalId));
  const lists: ImportedList[] = [];
  for (const p of (lib.Playlists || []) as Record<string, PV>[]) {
    if (p.Master || p['Distinguished Kind'] || p.Visible === false) continue;
    const id = String(p['Playlist Persistent ID'] ?? p['Playlist ID']);
    const parent = p['Parent Persistent ID'] ? String(p['Parent Persistent ID']) : null;
    const items = ((p['Playlist Items'] || []) as Record<string, PV>[]).map(i => String(i['Track ID'])).filter(x => known.has(x));
    lists.push({ externalId: id, kind: p.Folder ? 'folder' : 'playlist', name: String(p.Name ?? 'Playlist'), parent, items });
  }
  const ids = new Set(lists.map(l => l.externalId));
  for (const l of lists) if (l.parent && !ids.has(l.parent)) l.parent = null;
  return { app: 'apple', name: 'Apple Music (' + fileName + ')', tracks, lists };
}
