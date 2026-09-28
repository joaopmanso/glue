/* Finding a cover on public services for a song that has none in its tags (ADR 0086): Deezer, then
   iTunes, then MusicBrainz's Cover Art Archive. Pure: the addresses to ask, and the pick from each
   answer. A pick needs the same artist and the same album (or the same song, when there's no album),
   so a search that finds something else gives no cover rather than a wrong one. */

export interface CoverQuery { artist: string; album: string; title: string }
export type Service = 'deezer' | 'itunes' | 'musicbrainz';
export const SERVICES: Service[] = ['deezer', 'itunes', 'musicbrainz'];

/** Lower case, no accents, no "(…)"/"[…]" parts, no "feat." tail, only letters and digits. */
export function norm(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/\s(feat\.?|ft\.?|featuring|with)\s.*$/, ' ')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}
/** The same name, give or take extra words on one side ("Album" vs "Album Deluxe Edition"). */
export function same(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)));
}
/** One of the artists matches ("A & B" finds "A"). */
function sameArtist(want: string, got: string): boolean {
  const parts = (s: string) => s.split(/\s*(?:,|&|\band\b|\bx\b|\bvs\.?)\s*/i).filter(Boolean);
  return same(want, got) || parts(want).some(w => parts(got).some(g => same(w, g)));
}

/** What is searched for: its album when it has one, else the song. Null: not enough to search. */
export function queryOf(q: CoverQuery): { by: 'album' | 'song'; artist: string; name: string } | null {
  const artist = q.artist.trim(), album = q.album.trim(), title = q.title.trim();
  if (!artist) return null;
  if (album) return { by: 'album', artist, name: album };
  return title ? { by: 'song', artist, name: title } : null;
}
/** The key a lookup is kept under: an album's songs share one. */
export function lookupKey(q: CoverQuery): string | null {
  const k = queryOf(q);
  return k ? k.by + ':' + norm(k.artist) + '|' + norm(k.name) : null;
}

const quote = (s: string) => '"' + s.replace(/"/g, '') + '"';
export function searchUrl(service: Service, q: CoverQuery): string | null {
  const k = queryOf(q);
  if (!k) return null;
  const e = encodeURIComponent;
  if (service === 'deezer') return k.by === 'album'
    ? 'https://api.deezer.com/search/album?limit=10&q=' + e('artist:' + quote(k.artist) + ' album:' + quote(k.name))
    : 'https://api.deezer.com/search?limit=10&q=' + e('artist:' + quote(k.artist) + ' track:' + quote(k.name));
  if (service === 'itunes') return 'https://itunes.apple.com/search?limit=15&media=music&entity=' + (k.by === 'album' ? 'album' : 'song') + '&term=' + e(k.artist + ' ' + k.name);
  return 'https://musicbrainz.org/ws/2/' + (k.by === 'album' ? 'release' : 'recording') + '/?fmt=json&limit=10&query=' + e('artist:' + quote(k.artist) + ' AND ' + (k.by === 'album' ? 'release:' : 'recording:') + quote(k.name));
}

/** From a service's answer: the address of the matching cover's picture (MusicBrainz: the Cover Art
    Archive's, which may have none), or null. */
export function pick(service: Service, q: CoverQuery, answer: unknown): string | null {
  const k = queryOf(q);
  if (!k || !answer || typeof answer !== 'object') return null;
  const a = answer as Record<string, unknown>;
  if (service === 'deezer') {
    for (const it of (a.data as Record<string, any>[] | undefined) ?? []) {
      const artist = it.artist?.name ?? '', name = k.by === 'album' ? it.title : it.title, cover = k.by === 'album' ? it.cover_xl ?? it.cover_big : it.album?.cover_xl ?? it.album?.cover_big;
      if (cover && sameArtist(k.artist, artist) && same(k.name, name ?? '')) return cover;
    }
    return null;
  }
  if (service === 'itunes') {
    for (const it of (a.results as Record<string, any>[] | undefined) ?? []) {
      const name = k.by === 'album' ? it.collectionName : it.trackName, art = it.artworkUrl100 as string | undefined;
      if (art && sameArtist(k.artist, it.artistName ?? '') && same(k.name, name ?? '')) return art.replace(/\/\d+x\d+bb\./, '/600x600bb.');
    }
    return null;
  }
  const list = (k.by === 'album' ? a.releases : a.recordings) as Record<string, any>[] | undefined;
  for (const it of list ?? []) {
    const artist = (it['artist-credit'] as { name?: string }[] | undefined)?.map(c => c.name ?? '').join(' & ') ?? '';
    if (!sameArtist(k.artist, artist) || !same(k.name, it.title ?? '')) continue;
    const release = k.by === 'album' ? it.id : (it.releases as { id: string }[] | undefined)?.[0]?.id;
    if (release) return 'https://coverartarchive.org/release/' + release + '/front-500';
  }
  return null;
}
