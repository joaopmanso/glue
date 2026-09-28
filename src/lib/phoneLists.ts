/* Playlists by touch (the user's list, 2026-09-28; ADR 0079): make, name, colour, move, copy and delete
   playlists and folders on a phone or a tablet, with the questions in sheets. The same library calls
   as the desktop's sidebar, so in a cloud library they go to the computer that has it (ADR 0077). */
import { lib } from './library.svelte';
import { view, tracksFor } from './view.svelte';
import { phone } from './phone.svelte';
import { nowPlaying } from './nowPlaying.svelte';
import { addTo, listPicker } from './trackMenu';
import { SEP, tidy, type MenuEntry } from './menu.svelte';
import { LIST_COLORS, type List } from '../store/types';

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/** A new playlist or folder, named in a sheet; `items`: its first songs. */
export async function newList(kind: 'playlist' | 'folder', parentId: string | null = null, items: string[] = []): Promise<List | null> {
  const name = (await phone.prompt(kind === 'folder' ? 'New folder' : 'New playlist', '', 'Create', kind === 'folder' ? 'Folder name' : 'Playlist name'))?.trim();
  if (!name) return null;
  const l = lib.createList(kind, name, parentId, items);
  if (l && items.length) lib.notice = 'Made “' + l.name + '” with ' + plural(items.length, 'song') + '.';
  return l;
}
export async function renameList(l: List) {
  const n = (await phone.prompt(l.kind === 'folder' ? 'Rename the folder' : 'Rename the playlist', l.name, 'Rename'))?.trim();
  if (n && n !== l.name) lib.updateList(l.id, { name: n });
}
export async function deleteList(l: List) {
  const folder = l.kind === 'folder';
  const ok = await phone.confirm(folder ? 'Delete the folder?' : 'Delete the playlist?', (folder ? '“' + l.name + '” and everything in it go. ' : '“' + l.name + '” goes. ') + 'The songs stay in your collection.');
  if (!ok) return;
  // Showing it (or inside it)? Back out first.
  while (phone.top && ((phone.top.kind === 'songs' && phone.top.sel.kind === 'list' && phone.top.sel.id === l.id) || (phone.top.kind === 'folder' && phone.top.id === l.id))) phone.back();
  lib.deleteList(l.id);
}
/** A playlist's copy, beside it. */
export function duplicateList(l: List) {
  const c = lib.createList('playlist', l.name + ' (copy)', l.parentId, [...l.items]);
  if (c) lib.notice = 'Made “' + c.name + '”.';
}
/** The folders a list can go into (not itself, nor its own folders). */
function targets(l: List): List[] {
  const s = lib.store;
  if (!s) return [];
  const inside = (x: List) => { for (let p: string | null = x.parentId; p; p = s.lists.get(p)?.parentId ?? null) if (p === l.id) return true; return false; };
  return [...s.lists.values()].filter(x => x.kind === 'folder' && x.id !== l.id && !inside(x)).sort((a, b) => lib.listPath(a).localeCompare(lib.listPath(b)));
}
function playable(l: List) { return tracksFor({ kind: 'list', id: l.id }).filter(t => lib.playsHere(t)).map(t => t.id); }

/** A playlist's or folder's menu, as a sheet. */
export function listMenu(l: List): MenuEntry[] {
  const ids = playable(l), edit = !lib.readOnly, siblings = lib.childLists(l.parentId);
  return tidy([
    ids.length > 0 && { label: 'Play', hint: String(ids.length), attrs: { 'data-m': 'play' }, run: () => void nowPlaying.play(ids[0], ids, 0, l.name) },
    ids.length > 0 && { label: 'Shuffle', attrs: { 'data-m': 'shuffle' }, run: () => { nowPlaying.setShuffle(true); void nowPlaying.play(ids[Math.floor(Math.random() * ids.length)], ids, 0, l.name); } },
    ids.length > 0 && { label: 'Play next', attrs: { 'data-m': 'play-next' }, run: () => nowPlaying.enqueue(ids, 'next') },
    ids.length > 0 && { label: 'Add to queue', attrs: { 'data-m': 'queue' }, run: () => nowPlaying.enqueue(ids, 'end') },
    { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: l.name, sel: { kind: 'list', id: l.id } }) },
    SEP,
    edit && l.kind === 'playlist' && l.items.length > 0 && { label: 'Edit (reorder, remove)', attrs: { 'data-m': 'edit' }, run: () => editList(l) },
    edit && { label: 'Rename…', attrs: { 'data-m': 'rename' }, run: () => void renameList(l) },
    edit && { colors: LIST_COLORS, value: l.color ?? null, pick: (c: string | null) => lib.setListColor(l.id, c) },
    edit && { label: 'Tags…', attrs: { 'data-m': 'tags', 'data-tags-open': '' }, run: () => (view.tagFor = { listId: l.id, x: 0, y: 0 }) },
    edit && l.kind === 'folder' && { label: 'New playlist inside…', attrs: { 'data-m': 'new-inside' }, run: () => void newList('playlist', l.id) },
    edit && l.kind === 'folder' && { label: 'New folder inside…', attrs: { 'data-m': 'new-folder-inside' }, run: () => void newList('folder', l.id) },
    edit && SEP,
    edit && siblings.length > 1 && { label: 'Move up', stay: true, disabled: siblings[0]?.id === l.id, attrs: { 'data-m': 'up' }, run: () => lib.nudgeList(l.id, -1) },
    edit && siblings.length > 1 && { label: 'Move down', stay: true, disabled: siblings[siblings.length - 1]?.id === l.id, attrs: { 'data-m': 'down' }, run: () => lib.nudgeList(l.id, 1) },
    edit && {
      label: 'Move to', find: 'Find a folder', attrs: { 'data-m': 'move-to' },
      sub: () => [{ label: 'Top level', checked: !l.parentId, attrs: { 'data-move-to': '' }, run: () => lib.placeList(l.id, null, Infinity) }, SEP,
        ...targets(l).map(f => ({ label: lib.listPath(f), checked: l.parentId === f.id, color: f.color ?? null, attrs: { 'data-move-to': f.id }, run: () => lib.placeList(l.id, f.id, Infinity) }))],
    },
    edit && l.kind === 'playlist' && { label: 'Duplicate', attrs: { 'data-m': 'duplicate' }, run: () => duplicateList(l) },
    edit && SEP,
    edit && { label: 'Delete…', danger: true, attrs: { 'data-m': 'delete' }, run: () => void deleteList(l) },
  ]);
}

/** Open a playlist to reorder and remove its songs. */
export function editList(l: List) {
  const top = phone.top;
  if (!(top?.kind === 'songs' && top.sel.kind === 'list' && top.sel.id === l.id)) phone.songs({ kind: 'list', id: l.id });
  startEditing(l.id);
}
/** Edit mode: the playlist's own order, every song shown. */
export function startEditing(id: string) {
  view.sort = { key: 'order', dir: 1 };
  view.search = '';
  phone.select(false);
  phone.editing = id;
}

/** Add songs to a playlist: one from the tree, or a new one. */
export function addMenu(ids: string[], done?: () => void): MenuEntry[] {
  const own = (l: List) => l.kind === 'playlist';
  return tidy([
    { label: 'New playlist…', attrs: { 'data-m': 'new-playlist' }, run: () => void newList('playlist', null, ids).then(l => { if (l) done?.(); }) },
    SEP,
    ...listPicker(l => { addTo(l, ids); done?.(); }, { only: own }),
  ]);
}

/** Take songs out of a playlist, with Undo. */
export function removeFrom(listId: string, ids: string[]) {
  const l = lib.store?.lists.get(listId);
  if (!l) return;
  const before = [...l.items];
  lib.removeFromList(listId, ids);
  const one = ids.length === 1 ? lib.store?.tracks.get(ids[0]) : null;
  phone.undoable('Removed ' + (one ? '“' + (one.title || one.fileName) + '”' : plural(ids.length, 'song')) + ' from ' + l.name + '.', () => lib.updateList(listId, { items: before }));
}
