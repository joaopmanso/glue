/* Genres to pick from (the user's list, 2026-09-28): the collection's own, the ones the user added, and
   a set of common ones, so a song's genre is picked like a tag rather than typed each time. A song has
   one genre (its file's Genre field); setting it goes through song info (ADR 0071), so GLUE Home writes
   it into the file. */
import { lib } from './library.svelte';
import { cleanTag } from '../core/library/tagging';

/** Common genres, offered before the collection has them. */
export const GENRE_PRESETS = [
  'Afro House', 'Amapiano', 'Ambient', 'Bass House', 'Breaks', 'Dance', 'Dancehall', 'Deep House', 'Deep Tech', 'Disco',
  'Downtempo', 'Drum & Bass', 'Dubstep', 'Electro', 'Electronica', 'Funk', 'Funky House', 'Garage', 'Hard Dance', 'Hard Techno',
  'Hardstyle', 'Hip-Hop', 'House', 'Indie Dance', 'Jackin House', 'Jazz', 'Jungle', 'Latin', 'Melodic House & Techno', 'Minimal',
  'Nu Disco', 'Organic House', 'Pop', 'Progressive House', 'Psy-Trance', 'R&B', 'Reggae', 'Reggaeton', 'Rock', 'Soul',
  'Soulful House', 'Tech House', 'Techno', 'Trance', 'Trap', 'UK Bass', 'UK Garage',
];

export interface GenreItem { name: string; tracks: number; mine: boolean }

/** Every genre to offer: the collection's (with their songs), the user's, then the presets. */
export function allGenres(): GenreItem[] {
  void lib.version;
  const s = lib.store, m = new Map<string, GenreItem>();
  for (const t of s?.tracks.values() ?? []) {
    const g = t.genre?.trim();
    if (!g) continue;
    const k = g.toLowerCase(), e = m.get(k);
    if (e) e.tracks++; else m.set(k, { name: g, tracks: 1, mine: true });
  }
  for (const g of s?.meta.genres ?? []) if (!m.has(g.toLowerCase())) m.set(g.toLowerCase(), { name: g, tracks: 0, mine: true });
  for (const g of GENRE_PRESETS) if (!m.has(g.toLowerCase())) m.set(g.toLowerCase(), { name: g, tracks: 0, mine: false });
  return [...m.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
}

/** Set songs' genre ('' clears it). A genre new to the collection joins its list. */
export function setGenre(ids: string[], genre: string) {
  const g = cleanTag(genre);
  const s = lib.store;
  if (!s) return;
  const known = allGenres().find(x => x.name.toLowerCase() === g.toLowerCase());
  const name = known?.name ?? g;
  lib.editInfo(ids, { genre: name });
  if (name && !(s.meta.genres ?? []).some(x => x.toLowerCase() === name.toLowerCase()) && !GENRE_PRESETS.some(x => x.toLowerCase() === name.toLowerCase())) {
    s.meta.genres = [...(s.meta.genres ?? []), name];
    s.saveMeta();
  }
}
