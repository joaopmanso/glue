/* Discogs playlists (ADR 0189): collection lists marked `discogs`, kept out of the library's own lists, whose items mix the
   library's songs (their ids) and vinyl tracks of the user's Discogs records (`dg:<release id>:<position>`). An auto one
   keeps rules instead of items: every track of the collection's records whose record passes them, as its song when GLUE
   has it (`RecordMatch.byTrack`), else as vinyl. A record whose tracklist isn't known (not read yet, or none on Discogs)
   is one item, the whole record (`dg:<release id>:`), or its songs here. Pure. */
import type { DiscogsRecord, DiscogsTrack, RecordMatch } from './discogsMatch';

export interface DiscogsRules {
  genres: string[]; styles: string[]; artists: string[]; labels: string[]; formats: string[];
  /** A range of years, both ends included (either may be open). */
  years: [number | null, number | null] | null;
  /** Vinyl only (tracks GLUE has no song for), digital only (those it has), or both. */
  have: 'vinyl' | 'digital' | 'both';
  order: 'added' | 'artist' | 'year' | 'label';
}
export const NO_RULES: DiscogsRules = { genres: [], styles: [], artists: [], labels: [], formats: [], years: null, have: 'both', order: 'added' };

/** A vinyl track's item: `dg:<release id>:<position>`; its position may itself hold ':'; none: the whole record. */
export const vinylRef = (release: number, position: string) => 'dg:' + release + ':' + position;
export function parseRef(item: string): { release: number; position: string } | null {
  if (!item.startsWith('dg:')) return null;
  const rest = item.slice(3), i = rest.indexOf(':');
  const release = Number(i < 0 ? rest : rest.slice(0, i));
  return Number.isInteger(release) && release > 0 ? { release, position: i < 0 ? '' : rest.slice(i + 1) } : null;
}
export const isVinyl = (item: string) => item.startsWith('dg:');

/** A track's item: its song here, else its vinyl ref. */
export const itemOf = (r: DiscogsRecord, i: number, m: RecordMatch) => m.byTrack[i] ?? vinylRef(r.id, r.tracks![i].p || String(i + 1));
/** The vinyl track an item names: its record, the track and its place (`whole`: the whole record, -1). */
export function vinylTrack(item: string, byId: Map<number, DiscogsRecord>): { record: DiscogsRecord; track: DiscogsTrack; i: number; whole?: boolean } | null {
  const ref = parseRef(item);
  const record = ref ? byId.get(ref.release) : undefined;
  if (!ref || !record) return null;
  if (!ref.position) return { record, track: { p: '', title: record.title, artists: record.artists, d: null }, i: -1, whole: true };
  if (!record.tracks) return null;
  const i = record.tracks.findIndex((t, k) => (t.p || String(k + 1)) === ref.position);
  return i < 0 ? null : { record, track: record.tracks[i], i };
}

const lower = (xs: string[]) => new Set(xs.map(x => x.toLowerCase()));
const someIn = (have: string[], want: Set<string>) => !want.size || have.some(x => want.has(x.toLowerCase()));
/** Discogs' "Name (2)" is the name. */
export const plainName = (s: string) => s.replace(/\s+\(\d+\)$/, '');

/** An auto playlist's items: every track of `records` (each with its match) that passes the rules, in their order. */
export function discogsAuto(records: DiscogsRecord[], matchOf: (r: DiscogsRecord) => RecordMatch, rules: DiscogsRules): string[] {
  const genres = lower(rules.genres), styles = lower(rules.styles), artists = lower(rules.artists.map(plainName)), labels = lower(rules.labels), formats = lower(rules.formats);
  const [from, to] = rules.years ?? [null, null];
  const passes = (r: DiscogsRecord) => someIn(r.genres, genres) && someIn(r.styles, styles) && someIn(r.labels.map(l => l.name), labels) && someIn(r.formats, formats)
    && (from == null || (r.year != null && r.year >= from)) && (to == null || (r.year != null && r.year <= to));
  // (Records with no label last.)
  const label = (r: DiscogsRecord) => r.labels[0]?.name || '￿';
  const firstArtist = (r: DiscogsRecord) => plainName(r.artists[0] ?? '');
  const sorted = [...records].sort(
    rules.order === 'artist' ? (a, b) => firstArtist(a).localeCompare(firstArtist(b)) || a.title.localeCompare(b.title)
    : rules.order === 'year' ? (a, b) => (b.year ?? 0) - (a.year ?? 0)
    : rules.order === 'label' ? (a, b) => label(a).localeCompare(label(b)) || a.title.localeCompare(b.title)
    : (a, b) => b.added.localeCompare(a.added));
  const out: string[] = [];
  for (const r of sorted) {
    if (!passes(r)) continue;
    const m = matchOf(r);
    // No tracklist known: its songs here, or (none) the whole record.
    if (!r.tracks?.length) {
      if (artists.size && !r.artists.some(a => artists.has(plainName(a).toLowerCase()))) continue;
      const items = m.songs.length ? (rules.have === 'vinyl' ? [] : m.songs) : rules.have === 'digital' ? [] : [vinylRef(r.id, '')];
      for (const x of items) if (!out.includes(x)) out.push(x);
      continue;
    }
    r.tracks.forEach((t, i) => {
      // An artist rule: the track's own artists (a compilation's) or the record's.
      if (artists.size && !(t.artists.length ? t.artists : r.artists).some(a => artists.has(plainName(a).toLowerCase()))) return;
      const item = itemOf(r, i, m), vinyl = isVinyl(item);
      if (rules.have === 'vinyl' && !vinyl) return;
      if (rules.have === 'digital' && vinyl) return;
      if (!out.includes(item)) out.push(item);
    });
  }
  return out;
}

/** The values the collection has for each rule (for its chips), most used first. */
export function ruleValues(records: DiscogsRecord[]): { genres: string[]; styles: string[]; artists: string[]; labels: string[]; formats: string[] } {
  const count = (pick: (r: DiscogsRecord) => string[]) => {
    const m = new Map<string, number>();
    for (const r of records) for (const v of new Set(pick(r))) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  };
  return {
    genres: count(r => r.genres), styles: count(r => r.styles), formats: count(r => r.formats),
    labels: count(r => r.labels.map(l => l.name)),
    artists: count(r => [...r.artists, ...(r.tracks ?? []).flatMap(t => t.artists)].map(plainName).filter(a => !/^various$/i.test(a))),
  };
}
