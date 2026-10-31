/* "Add to Discogs playlist ›" (ADR 0189): the Discogs playlists arranged by hand, and New…, for items (songs and vinyl
   tracks). Used by a record's menu, a track's ＋ in a record's panel, and a library song's menu. */
import { lib } from './library.svelte';
import { view } from './view.svelte';
import type { MenuEntry } from './menu.svelte';

const plural = (n: number, one: string) => n + ' ' + one + (n === 1 ? '' : 's');

export function addToDiscogsList(listId: string, items: string[]) {
  const l = lib.store?.lists.get(listId);
  const n = lib.addToDiscogsList(listId, items);
  lib.notice = n ? 'Added ' + plural(n, 'track') + ' to ' + (l?.name ?? 'the playlist') + '.' : 'Already in ' + (l?.name ?? 'the playlist') + '.';
}
export function newDiscogsListWith(items: string[]) {
  const name = prompt('Name of the new Discogs playlist');
  if (!name) return;
  const l = lib.createDiscogsList(name, undefined, items);
  if (l) lib.notice = 'Made ' + l.name + ' with ' + plural(items.length, 'track') + '.';
}
/** The entries: each playlist (an auto one can't be added to), then New…. */
export function discogsListPicker(items: () => string[]): MenuEntry[] {
  const lists = lib.discogsLists().filter(l => !l.discogs?.rules);
  return [
    { label: 'New Discogs playlist…', attrs: { 'data-m': 'new-discogs-list' }, run: () => newDiscogsListWith(items()) },
    ...lists.map(l => ({ label: l.name, attrs: { 'data-m': 'discogs-list', 'data-list': l.id }, run: () => addToDiscogsList(l.id, items()) })),
  ];
}
/** Open a Discogs playlist. */
export const openDiscogsList = (id: string) => view.select({ kind: 'discogsList', id });
