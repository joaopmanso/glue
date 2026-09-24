/* The collection's tags, counted (tracks and playlists), cached per library version. */
import { lib } from './library.svelte';
import { tagColor, tagsOf } from '../core/library/tagging';
import { LIST_COLORS } from '../store/types';

export interface TagInfo { name: string; tracks: number; lists: number }
let memoV = -1, memoStore: unknown = null, memo: TagInfo[] = [];

/** Every tag: made in MCO, on a track or on a playlist; alphabetical. */
export function allTags(): TagInfo[] {
  const v = lib.version, s = lib.store;
  if (v === memoV && s === memoStore) return memo;
  const m = new Map<string, TagInfo>();
  const get = (name: string) => { const k = name.toLowerCase(); let x = m.get(k); if (!x) m.set(k, x = { name, tracks: 0, lists: 0 }); return x; };
  for (const t of s?.meta.tags ?? []) get(t);
  for (const t of s?.tracks.values() ?? []) for (const g of tagsOf(t)) get(g).tracks++;
  for (const l of s?.lists.values() ?? []) for (const g of l.tags ?? []) get(g).lists++;
  memo = [...m.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  memoV = v; memoStore = s;
  return memo;
}
export const tagColorOf = (tag: string) => tagColor(tag, LIST_COLORS);
