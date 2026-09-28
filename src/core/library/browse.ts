/* Browsing a collection by artist, album, genre, label or year (the user's list, 2026-09-28): the values
   of a field, each with its songs. Pure: plain tracks. The same value in any case is one entry. */

export type Facet = 'artist' | 'album' | 'genre' | 'label' | 'year';
export const FACETS: { by: Facet; name: string; one: string; none: string }[] = [
  { by: 'artist', name: 'Artists', one: 'Artist', none: 'No artist' },
  { by: 'album', name: 'Albums', one: 'Album', none: 'No album' },
  { by: 'genre', name: 'Genres', one: 'Genre', none: 'No genre' },
  { by: 'label', name: 'Labels', one: 'Label', none: 'No label' },
  { by: 'year', name: 'Years', one: 'Year', none: 'No year' },
];
export const facetInfo = (by: Facet) => FACETS.find(f => f.by === by)!;

type T = { artist: string; album: string; genre: string; label: string; year: string; duration: number | null };

/** A track's value for a facet ('' when it has none); years are the 4 digits. */
export function facetValue(t: T, by: Facet): string {
  if (by === 'year') return (/\b(1[89]\d\d|20\d\d)\b/.exec(t.year ?? '') ?? [])[1] ?? '';
  return (t[by] ?? '').trim();
}
export const facetKey = (v: string) => v.toLowerCase();

export interface FacetItem {
  /** The value as most of its songs spell it ('' for songs without one). */
  value: string; key: string;
  tracks: number; seconds: number;
  /** Albums: their artist, or "Various artists". */
  sub?: string;
}

/** Every value of a facet, with its songs' count and length. */
export function facetItems(ts: T[], by: Facet): FacetItem[] {
  const m = new Map<string, { spell: Map<string, number>; tracks: number; seconds: number; artists: Map<string, number>; spell2: Map<string, string> }>();
  for (const t of ts) {
    const v = facetValue(t, by), k = facetKey(v);
    let e = m.get(k);
    if (!e) m.set(k, e = { spell: new Map(), tracks: 0, seconds: 0, artists: new Map(), spell2: new Map() });
    e.spell.set(v, (e.spell.get(v) ?? 0) + 1);
    e.tracks++; e.seconds += t.duration ?? 0;
    const ar = t.artist.trim();
    if (by === 'album' && ar) { e.artists.set(ar.toLowerCase(), (e.artists.get(ar.toLowerCase()) ?? 0) + 1); if (!e.spell2.has(ar.toLowerCase())) e.spell2.set(ar.toLowerCase(), ar); }
  }
  // The most common spelling; on a tie, one that starts with a capital ("Kloudmen" over "kloudmen").
  const cap = (v: string) => (/^\p{Lu}/u.test(v) ? 0 : 1);
  const most = (x: Map<string, number>) => [...x].sort((a, b) => b[1] - a[1] || cap(a[0]) - cap(b[0]) || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
  return [...m].map(([key, e]): FacetItem => ({
    value: most(e.spell), key, tracks: e.tracks, seconds: e.seconds,
    ...(by === 'album' ? { sub: e.artists.size > 1 && (e.artists.get(most(e.artists))! / e.tracks) < 0.6 ? 'Various artists' : e.spell2.get(most(e.artists)) ?? '' } : {}),
  }));
}

/** Sorted for the list: by name (years newest first; songs without a value last), or by songs. */
export function sortFacet(items: FacetItem[], by: Facet, order: 'name' | 'tracks'): FacetItem[] {
  const named = (a: FacetItem, b: FacetItem) => by === 'year' ? b.value.localeCompare(a.value) : a.value.localeCompare(b.value, undefined, { sensitivity: 'base', numeric: true });
  return [...items].sort((a, b) => (a.key === '' ? 1 : 0) - (b.key === '' ? 1 : 0) || (order === 'tracks' ? b.tracks - a.tracks || named(a, b) : named(a, b)));
}

export const inFacet = (t: T, by: Facet, key: string) => facetKey(facetValue(t, by)) === key;
