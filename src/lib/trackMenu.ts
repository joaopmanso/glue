/* What right-clicking songs offers (ADR 0067), in the table, the duplicates and the mini player: for one
   song or all the selected ones. The selection bar keeps the most used of these as buttons. */
import { lib } from './library.svelte';
import { view, type FilterGroup } from './view.svelte';
import { router, trackHref } from './route.svelte';
import { nowPlaying } from './nowPlaying.svelte';
import { player } from './player.svelte';
import { auto } from './auto.svelte';
import { dock } from './dock.svelte';
import { dupes } from './dupes.svelte';
import { incoming, TO_BE_SORTED } from './incoming.svelte';
import { sendTargets, sendTracks } from './sendToHome.svelte';
import { absolutePath } from './dragout';
import { menu, SEP, tidy, type MenuAction, type MenuEntry } from './menu.svelte';
import { listTree } from '../core/library/listTree';
import type { List, Track } from '../store/types';

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);
/** The playlists most recently added to, offered first. */
let recent: string[] = [];

/** Every playlist and folder as the sidebar shows them (ADR 0062), to pick one. `mark`: ticked ones. */
export function listPicker(pick: (l: List) => void, opts: { only?: (l: List) => boolean; mark?: (l: List) => boolean } = {}): MenuEntry[] {
  const s = lib.store;
  if (!s) return [];
  const tree = listTree(s.lists.values(), l => l.id === TO_BE_SORTED), ok = opts.only ?? (() => true);
  const item = (l: List, depth: number): MenuAction => ({ label: l.name, depth, detail: lib.listPath(l), color: l.color ?? null, checked: opts.mark?.(l) || undefined, hint: l.kind === 'folder' ? 'folder' : undefined, run: () => pick(l) });
  const own = tree.own.filter(e => ok(e.list));
  return tidy([
    own.length > 0 && { head: 'Your playlists' },
    ...own.map(e => item(e.list, e.depth)),
    ...tree.imports.flatMap(g => { const es = g.entries.filter(e => ok(e.list)); return es.length ? [{ head: g.top.name + ' ↓' }, ...es.map(e => item(e.list, e.depth))] : []; }),
  ]);
}

function addTo(l: List, ids: string[]) {
  const n = lib.addToList(l.id, ids);
  recent = [l.id, ...recent.filter(x => x !== l.id)].slice(0, 3);
  lib.notice = n ? 'Added ' + plural(n, 'song') + ' to ' + l.name + '.' : (ids.length === 1 ? 'It’s' : 'They’re') + ' in ' + l.name + ' already.';
}
function newPlaylistWith(ids: string[]) {
  const name = prompt('Name of the new playlist');
  if (!name) return;
  const l = lib.createList('playlist', name, null, []);
  if (l) addTo(l, ids);
}
async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); lib.notice = 'Copied ' + what + '.'; }
  catch { lib.notice = 'The browser didn’t allow copying.'; }
}

export interface TrackMenuOpts {
  /** The songs in the order they're shown (Play plays on through them). */
  order?: string[];
  /** The value under the pointer, for "Show only …" (a genre, a tag, a format…). */
  only?: { group: FilterGroup; value: string; label: string } | null;
  /** A song in the player's queue (ADR 0068). */
  inQueue?: { which: 'upNext' | 'later'; index: number };
}

/** The menu for these songs (in the order they're shown). */
export function trackMenu(ids: string[], opts: TrackMenuOpts = {}): MenuEntry[] {
  const s = lib.store;
  if (!s || !ids.length) return [];
  const ts = ids.map(id => s.tracks.get(id)).filter((t): t is Track => !!t);
  if (!ts.length) return [];
  const one = ts.length === 1 ? ts[0] : null, n = ts.length, cloud = !!lib.cloud;
  const cur = view.sel.kind === 'list' ? s.lists.get(view.sel.id) ?? null : null;
  const inCur = cur ? ids.filter(id => cur.items.includes(id)).length : 0;
  const playable = ts.filter(t => lib.playsHere(t));
  const order = opts.order ?? ids;
  // The playlists these songs are in (a folder's own songs count: folders are playlists too).
  const having = new Map<List, number>();
  for (const id of ids) for (const l of lib.listsContaining(id)) having.set(l, (having.get(l) ?? 0) + 1);
  const lists = [...having.keys()].sort((a, b) => lib.listPath(a).localeCompare(lib.listPath(b)));
  const rating = ts.every(t => (t.rating ?? null) === (ts[0].rating ?? null)) ? ts[0].rating ?? null : null;
  const group = one ? dupes.groupOf.get(one.id) : undefined;
  const needs = cloud ? 0 : ts.filter(t => lib.needsAnalysis(t)).length;
  // Songs GLUE cautions about (or suspects): they can be marked fine.
  const flagged = ts.filter(t => { const a = s.analysis.get(t.id); return !t.remote && a && !a.error && a.grade !== 'ok'; });
  const homes = cloud ? [] : sendTargets();
  const sortHome = view.sel.kind === 'list' && view.sel.id === TO_BE_SORTED ? incoming.sourceOf(ids[0])?.home : undefined;
  const sortable = !!sortHome && ids.every(id => incoming.sourceOf(id)?.home === sortHome);
  const path = one ? absolutePath(one) : null;
  const playing = one && nowPlaying.trackId === one.id && !player.paused;
  const at = menu.point;

  return tidy([
    { head: one ? one.title || one.fileName : plural(n, 'song') + ' selected' },
    playable.length > 0 && !opts.inQueue && {
      label: playing ? 'Pause' : one ? 'Play' : 'Play these ' + n, hint: one ? 'Space' : undefined, attrs: { 'data-m': 'play' },
      run: () => { if (playing) player.toggle(); else void nowPlaying.play(playable[0].id, one ? order : playable.map(t => t.id)); },
    },
    opts.inQueue && { label: 'Play now', attrs: { 'data-m': 'play-now' }, run: () => nowPlaying.jumpTo(opts.inQueue!.which, opts.inQueue!.index) },
    opts.inQueue?.which === 'upNext' && opts.inQueue.index > 0 && { label: 'Move to the top', attrs: { 'data-m': 'queue-top' }, run: () => nowPlaying.enqueue(ids, 0) },
    opts.inQueue?.which === 'later' && { label: 'Play next', attrs: { 'data-m': 'play-next' }, run: () => nowPlaying.enqueue(ids, 'next') },
    opts.inQueue && { label: 'Remove from the queue', attrs: { 'data-m': 'unqueue' }, run: () => nowPlaying.dequeue(opts.inQueue!.which, opts.inQueue!.index) },
    !opts.inQueue && { label: 'Play next', attrs: { 'data-m': 'play-next' }, run: () => nowPlaying.enqueue(ids, 'next') },
    !opts.inQueue && { label: 'Add to queue', attrs: { 'data-m': 'queue' }, run: () => nowPlaying.enqueue(ids, 'end') },
    SEP,
    one && { label: 'Open details', hint: 'Enter', attrs: { 'data-m': 'details' }, run: () => router.go(trackHref(one.id, 'details')) },
    one && { label: 'Prepare (grid, cues, loops)', attrs: { 'data-m': 'prepare' }, disabled: one.status !== 'linked' || cloud, title: one.status !== 'linked' ? 'Needs its file' : undefined, run: () => router.go(trackHref(one.id, 'prepare')) },
    SEP,
    {
      label: 'Add to playlist', find: 'Find a playlist', attrs: { 'data-m': 'add' },
      sub: () => {
        const top = recent.map(id => s.lists.get(id)).filter((l): l is List => !!l);
        return tidy([
          { label: 'New playlist…', attrs: { 'data-m': 'new-playlist' }, run: () => newPlaylistWith(ids) },
          top.length > 0 && SEP,
          top.length > 0 && { head: 'Recent' },
          ...top.map(l => ({ label: l.name, detail: lib.listPath(l), color: l.color ?? null, run: () => addTo(l, ids) })),
          SEP,
          ...listPicker(l => addTo(l, ids), { mark: l => ids.every(id => l.items.includes(id)) }),
        ]);
      },
    },
    cur && inCur > 0 && {
      label: 'Remove from ' + cur.name, hint: cur.kind === 'playlist' ? 'Del' : undefined, attrs: { 'data-m': 'remove-here' },
      run: () => { lib.removeFromList(cur.id, ids); view.selected = new Set(); lib.notice = 'Removed ' + plural(inCur, 'song') + ' from ' + cur.name + '.'; },
    },
    lists.length > 0 && {
      label: 'Remove from playlist', find: 'Find a playlist', attrs: { 'data-m': 'remove-from' },
      sub: () => lists.map(l => ({
        label: l.name, detail: lib.listPath(l), color: l.color ?? null, hint: n > 1 ? having.get(l) + ' of ' + n : undefined,
        run: () => { lib.removeFromList(l.id, ids); lib.notice = 'Removed ' + plural(having.get(l) ?? 0, 'song') + ' from ' + l.name + '.'; },
      })),
    },
    one && lists.length > 0 && {
      label: 'Show in playlist', find: 'Find a playlist', attrs: { 'data-m': 'show-in' },
      sub: () => lists.map(l => ({ label: l.name, detail: lib.listPath(l), color: l.color ?? null, run: () => { view.select({ kind: 'list', id: l.id }); view.selected = new Set([one.id]); view.anchor = one.id; view.reveal = one.id; } })),
    },
    SEP,
    { stars: rating, pick: (v: number | null) => lib.rateTracks(ids, v) },
    { label: 'Edit info…', hint: one ? 'F2' : undefined, attrs: { 'data-m': 'info' }, disabled: cloud || lib.readOnly || ts.every(t => t.remote), title: cloud || ts.every(t => t.remote) ? 'Edit them on the computer that has them' : undefined, run: () => (view.infoFor = { ids }) },
    { label: 'Tags…', attrs: { 'data-m': 'tags', 'data-tags-open': '' }, run: () => (view.tagFor = { ids, x: at.x, y: at.y }) },
    !cloud && { label: 'Genre…', hint: one?.genre || undefined, attrs: { 'data-m': 'genre', 'data-genre-open': '' }, disabled: ts.every(t => t.remote), run: () => (view.genreFor = { ids, x: at.x, y: at.y }) },
    !cloud && flagged.length > 0 && flagged.some(t => t.markedFine !== s.analysis.get(t.id)!.label) && { label: 'Not a problem (mark fine)', hint: n > 1 ? String(flagged.length) : undefined, attrs: { 'data-m': 'fine' }, title: 'A false alarm: show as fine while GLUE’s verdict stays the same', run: () => lib.markFine(flagged.map(t => t.id), true) },
    !cloud && flagged.some(t => t.markedFine === s.analysis.get(t.id)!.label) && { label: 'Show GLUE’s verdict again', attrs: { 'data-m': 'unfine' }, run: () => lib.markFine(flagged.map(t => t.id), false) },
    one && { label: one.notes ? 'Edit note…' : 'Add a note…', attrs: { 'data-m': 'note' }, run: () => (view.noteFor = { id: one.id, x: at.x + 320, y: at.y }) },
    opts.only && {
      label: (view.filters[opts.only.group].includes(opts.only.value) ? 'Stop showing only ' : 'Show only ') + opts.only.label, attrs: { 'data-m': 'only' },
      run: () => view.toggleFilter(opts.only!.group, opts.only!.value),
    },
    SEP,
    { label: one ? 'Build a playlist from this' : 'Build a playlist with these ' + n, attrs: { 'data-m': 'auto' }, run: () => auto.show(ids[0], ids.slice(1)) },
    !one && { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: plural(n, 'song') + ' selected', ids }) },
    needs > 0 && { label: 'Analyse now', hint: n > 1 ? String(needs) : undefined, attrs: { 'data-m': 'analyse' }, run: () => { const k = lib.analyseNow(ids); lib.notice = k ? 'Analysing ' + plural(k, 'song') + '.' : 'Nothing to analyse here that GLUE can read now.'; } },
    group && { label: 'Show its duplicates', hint: group.ids.length + '×', attrs: { 'data-m': 'dupes' }, run: () => { view.select({ kind: 'dupes' }); view.focusDupe = one!.id; } },
    SEP,
    dock.available && { label: 'Add to drag dock', attrs: { 'data-m': 'dock' }, run: () => void dock.add(ts) },
    ...homes.map(h => ({ label: 'Send to ' + h.name, title: 'Copy ' + (one ? 'its file' : 'their files') + ' into ' + h.name + '’s incoming folder', attrs: { 'data-send-home': h.id }, run: () => void sendTracks(h.id, ids) })),
    sortable && {
      label: 'Move to music folder', attrs: { 'data-m': 'move' },
      sub: async () => (await incoming.folders(sortHome!)).map(f => ({
        label: f.name, detail: f.collection, hint: f.collection,
        run: () => void incoming.move(ids, f.id).then(({ moved, elsewhere }) => {
          view.selected = new Set();
          lib.notice = 'Moved ' + plural(moved, 'song') + '.' + (elsewhere ? ' GLUE on that computer adds ' + (elsewhere === 1 ? 'it' : 'them') + ' to the library on its next scan of the folder.' : '');
        }, e => (lib.notice = (e as Error).message)),
      })),
    },
    {
      label: 'Copy', attrs: { 'data-m': 'copy' },
      sub: () => tidy([
        { label: one ? 'Artist – title' : 'Artists – titles', run: () => void copy(ts.map(t => (t.artist ? t.artist + ' – ' : '') + (t.title || t.fileName)).join('\n'), one ? 'the artist and title' : 'the artists and titles') },
        { label: one ? 'File name' : 'File names', run: () => void copy(ts.map(t => t.fileName).join('\n'), one ? 'the file name' : 'the file names') },
        one ? !!path && { label: 'File path', title: path, run: () => void copy(path!, 'the path') }
          : ts.some(t => absolutePath(t)) && { label: 'File paths', run: () => void copy(ts.map(t => absolutePath(t) ?? '').filter(Boolean).join('\n'), 'the paths') },
      ]),
    },
    SEP,
    !cloud && {
      label: 'Remove from collection…', danger: true, attrs: { 'data-m': 'remove' },
      run: () => {
        if (!confirm('Remove ' + (one ? 'this song' : 'these ' + n + ' songs') + ' from the collection and all its playlists? Files on disk aren’t touched; songs in a music folder come back on the next scan.')) return;
        void lib.removeTracks(ids); view.selected = new Set();
      },
    },
  ]);
}
