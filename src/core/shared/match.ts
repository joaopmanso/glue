/* The same song on two computers (ADR 0096): same artist and title (lengths within 3 s, checked by the
   caller), else the same file name and size. Pure. */
import type { Track } from '../../store/types';
import { fold } from '../library/names';

export function trackKey(t: Pick<Track, 'artist' | 'title' | 'fileName' | 'size'>): string {
  return t.artist && t.title ? 'a|' + fold(t.artist) + '|' + fold(t.title) : 'f|' + fold(t.fileName) + '|' + (t.size ?? '');
}
