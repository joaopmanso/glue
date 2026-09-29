/* The same song on two computers (ADR 0096): same artist and title (lengths within 3 s, checked by the
   caller), else the same file name and size. Pure. */
import type { Track } from '../../store/types';

export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function trackKey(t: Pick<Track, 'artist' | 'title' | 'fileName' | 'size'>): string {
  return t.artist && t.title ? 'a|' + norm(t.artist) + '|' + norm(t.title) : 'f|' + norm(t.fileName) + '|' + (t.size ?? '');
}
