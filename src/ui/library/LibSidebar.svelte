<script lang="ts">
  import { readPref, writePref } from '../../lib/prefs';
  import { FACETS, facetItems } from '../../core/library/browse';
  import { asShown } from '../../core/library/summary';
  import { describeRemoval, removalImpact } from '../../core/library/removal';
  import { untrack } from 'svelte';
  import { dock } from '../../lib/dock.svelte';
  import { sidebar, type LibView, type SideKey } from '../../lib/sidebar.svelte';
  import { lib, type RootState } from '../../lib/library.svelte';
  import { menu, SEP, tidy, type MenuEntry } from '../../lib/menu.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { events } from '../../lib/events.svelte';
  import { router } from '../../lib/route.svelte';
  import { downloadBlob } from '../../lib/download';
  import { hasTag, tagsOf } from '../../core/library/tagging';
  import { view, type ViewSel } from '../../lib/view.svelte';
  import { importDetected, importFiles, importWithHome, pickSeratoFolder, refreshWithFile } from '../../lib/importActions';
  import { djWatch } from '../../lib/djWatch.svelte';
  import { localHome } from '../../lib/localHome.svelte';
  import { homeMode } from '../../platform';
  import { IMPORT_ACCEPT } from '../../lib/imports';
  import { canKeepFiles, canPickFolders, pickAudioFiles } from '../../platform';
  import { LOOSE } from '../../store/merge';
  import { LIST_COLORS, type List, type Source, type SourceList } from '../../store/types';
  import { drag } from '../../lib/drag.svelte';
  import { dupes } from '../../lib/dupes.svelte';
  import { auto } from '../../lib/auto.svelte';
  import { canDragOut, playlistM3u8, startPlaylistDrag } from '../../lib/dragout';
  import { allTags, tagColorOf } from '../../lib/tags.svelte';
  import { account } from '../../lib/account.svelte';
  import DevicesSection from './DevicesSection.svelte';
  import AppIcon from '../AppIcon.svelte';
  import { cleanTag } from '../../core/library/tagging';
  const dragOut = canDragOut();

  const APP_NAMES: Record<string, string> = { rekordbox: 'rekordbox', engine: 'Engine DJ', serato: 'Serato', traktor: 'Traktor', apple: 'Apple Music', m3u: 'M3U' };
  const FOUND_NAMES: Record<string, string> = { engine: 'Engine DJ library', serato: 'Serato library', apple: 'iTunes / Apple Music library', rekordbox: 'rekordbox XML', traktor: 'Traktor collection' };

  const counts = $derived.by(() => {
    void lib.version;
    const s = lib.store;
    let all = 0, pending = 0, failed = 0, unlinked = 0, attention = 0;
    if (s) for (const t of s.tracks.values()) {
      // One meaning each (ADR 0109), as the lists and Stats count them; only the best copy of a song counts.
      if (dupes.hidden.has(t.id)) continue;
      const st = lib.analysisState(t);
      if (st !== 'failed') all++;   // as All tracks shows them
      if (st === 'nofile') unlinked++; else if (st === 'waiting') pending++; else if (st === 'failed') failed++;
      const a = s.analysis.get(t.id);
      if (a && (a.grade === 'bad' || a.grade === 'warn') && asShown(t, a)?.grade !== 'ok') attention++;
    }
    return { all, pending, failed, unlinked, attention };
  });
  const top = $derived.by(() => { void lib.version; return lib.childLists(null); });
  /** The main music folder (ADR 0121), read when the collection changes. */
  const mainRoot = $derived.by(() => { void lib.version; return lib.store?.meta.mainRoot ?? null; });
  // Takes the version so nested folders re-render when any list changes (the store's maps aren't reactive).
  const childrenOf = (id: string, _version: number) => lib.childLists(id || null);
  const loose = $derived.by(() => { void lib.version; let n = 0; for (const t of lib.store?.tracks.values() ?? []) if (t.fileKey) n++; return n; });
  let songInput = $state<HTMLInputElement>();
  async function addSongs() {
    if (!canKeepFiles()) { songInput?.click(); return; }
    try { await lib.addFiles(await pickAudioFiles()); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') lib.notice = (e as Error).message; }
  }
  const sources = $derived.by(() => { void lib.version; return [...(lib.store?.sources.values() ?? [])]; });

  let open = $state<Record<string, boolean>>({});
  let browseOpen = $state(readPref('browseOpen', '1') === '1');
  function setBrowse(v: boolean) { browseOpen = v; writePref('browseOpen', v ? '1' : '0'); }
  // How many artists, albums… (only while Browse is open; rebuilt when the tracks change).
  let countsRev = -1, countsCache: Record<string, number> = {};
  const facetCounts = $derived.by(() => {
    void lib.version;
    const st = lib.store;
    if (!st || !browseOpen) return {} as Record<string, number>;
    if (st.rev.tracks !== countsRev) { const ts = [...st.tracks.values()]; countsCache = Object.fromEntries(FACETS.map(f => [f.by, facetItems(ts, f.by).filter(i => i.key).length])); countsRev = st.rev.tracks; }
    return countsCache;
  });
  // A slow second click on the open playlist's name renames it, as songs' cells are edited in place;
  // a double-click does too.
  let slow = 0;
  function nameClick(e: MouseEvent, l: List) {
    clearTimeout(slow);
    if (drag.suppressClick) return;
    const again = view.sel.kind === 'list' && view.sel.id === l.id && e.detail === 1 && !lib.readOnly;
    view.select({ kind: 'list', id: l.id });
    if (l.kind === 'folder') open[l.id] = true;
    if (again) slow = window.setTimeout(() => (view.editing = l.id), 550);
  }
  // The selected playlist is always in sight: the folders above it open (also after coming back from
  // another page, which forgets them).
  $effect(() => {
    const sel = view.sel;
    if (sel.kind !== 'list') return;
    untrack(() => { for (let q = lib.store?.lists.get(sel.id)?.parentId; q; q = lib.store?.lists.get(q)?.parentId ?? null) open[q] = true; });
  });
  let fileInput = $state<HTMLInputElement>();
  let pathEdit = $state<string | null>(null);
  // DJ libraries browsed where they are (ADR 0063): each one's tree, opened folder by folder.
  let djOpen = $state<Record<string, boolean>>({});
  const djKids = $derived.by(() => {
    void lib.version;
    const m = new Map<string, Map<string, SourceList[]>>();
    for (const src of lib.store?.sources.values() ?? []) {
      const k = new Map<string, SourceList[]>();
      for (const l of src.tree ?? []) { const par = l.parent ?? ''; (k.get(par) ?? k.set(par, []).get(par)!).push(l); }
      m.set(src.id, k);
    }
    return m;
  });
  /** GLUE's copy of a DJ list (the version argument makes it follow changes). */
  const copyOf = (sourceId: string, ext: string, _version: number) => lib.linkedCopy(sourceId, ext);
  const kidsOf = (src: Source, parent: string | null) => djKids.get(src.id)?.get(parent ?? '') ?? [];
  // Live following is GLUE Home's (ADR 0065); in the browser alone, a library is read again on Refresh.
  const live = $derived.by(() => { void lib.version; return !!localHome.link && homeMode(); });
  let refreshInput = $state<HTMLInputElement>(), refreshFor: string | null = null;
  const chooseAgain = new Set<string>();
  /** Refresh: read it again where GLUE can reach it; if it can't, the next Refresh asks for the file. */
  async function refresh(src: Source) {
    if (!src.origin || chooseAgain.has(src.id)) { refreshFor = src.id; refreshInput?.click(); return; }
    if (await djWatch.refresh(src)) return;
    chooseAgain.add(src.id);
    lib.notice = 'GLUE can’t reach ' + (APP_NAMES[src.app] ?? src.app) + '’s file here: click Refresh again and choose it.';
  }
  /** Bring a DJ library's list (a folder with everything in it; '' = all) into GLUE, and show it. */
  function importDj(src: Source, ext: string, name: string) {
    const n = lib.importLists(src.id, [ext]), copy = lib.linkedCopy(src.id, ext);
    lib.notice = n ? 'Imported ' + (ext ? '“' + name + '”' : 'all of ' + name) + ' into GLUE: ' + n + ' playlist' + (n === 1 ? '' : 's') + ' or folder' + (n === 1 ? '' : 's') + ', kept in step with ' + (APP_NAMES[src.app] ?? src.app) + '.' : '“' + name + '” is in GLUE already.';
    if (!copy) return;
    for (let q = copy.parentId; q; q = lib.store?.lists.get(q)?.parentId ?? null) open[q] = true;
    view.select({ kind: 'list', id: copy.id });
  }
  const tags = $derived.by(() => { void lib.version; return allTags(); });
  // Tags can be hundreds: a scrolling list, filtered by name once there are more than a few.
  let tagFilter = $state('');
  const shownTags = $derived(tagFilter.trim() ? tags.filter(t => t.name.toLowerCase().includes(tagFilter.trim().toLowerCase())) : tags);
  function newTag() {
    const name = cleanTag(prompt(view.selected.size ? 'New tag for the ' + view.selected.size + ' selected track' + (view.selected.size === 1 ? '' : 's') : 'New tag') ?? '');
    if (!name) return;
    if (view.selected.size) lib.tagTracks([...view.selected], [name]); else lib.rememberTags([name]);
  }
  function renameTag(name: string) {
    const to = cleanTag(prompt('Rename the tag “' + name + '” (on every track and playlist)', name) ?? '');
    if (to && to !== name) { lib.renameTag(name, to); if (view.sel.kind === 'tag' && view.sel.name.toLowerCase() === name.toLowerCase()) view.select({ kind: 'tag', name: to }); }
  }
  function deleteTag(name: string, n: number) {
    if (!confirm('Delete the tag “' + name + '”?' + (n ? ' It comes off ' + n + ' track' + (n === 1 ? '' : 's') + '; the tracks stay.' : ''))) return;
    lib.deleteTag(name);
    if (view.sel.kind === 'tag' && view.sel.name.toLowerCase() === name.toLowerCase()) view.select({ kind: 'all' });
  }

  const isSel = (s: ViewSel) => JSON.stringify(s) === JSON.stringify(view.sel);
  drag.onOpenFolder = id => { open[id] = true; };

  function newList(kind: 'folder' | 'playlist', parentId: string | null = null) {
    const l = lib.createList(kind, '', parentId);
    if (!l) return;
    if (parentId) open[parentId] = true;
    view.editing = l.id;
    if (kind === 'playlist') view.select({ kind: 'list', id: l.id });
  }
  function rename(l: List, name: string) { view.editing = null; if (name.trim() && name.trim() !== l.name) lib.updateList(l.id, { name: name.trim() }); }
  function remove(l: List) {
    const what = l.kind === 'folder' ? 'the folder “' + l.name + '” and everything in it' : 'the playlist “' + l.name + '”';
    if (confirm('Delete ' + what + '? The tracks stay in your collection.')) { lib.deleteList(l.id); if (isSel({ kind: 'list', id: l.id })) view.select({ kind: 'all' }); }
  }
  /** A playlist (or folder) dragged by its row: around the tree, into folders, or out of the window
      onto GLUE Home's drag dock, which adds its songs (ADR 0056). The music-note icon has its own drag
      (the playlist as a file, ADR 0027). */
  function startListDrag(e: DragEvent, l: List) {
    const el = e.target as HTMLElement, dt = e.dataTransfer;
    if (!dt || el.closest('.drag-out')) return;
    if (view.editing === l.id || el.closest('input')) { e.preventDefault(); return; }
    dt.setData('text/plain', dock.available ? dock.payload(dock.tracksOf(l.id)) : l.name);
    dt.effectAllowed = 'copyMove';
    drag.beginNative({ kind: 'list', id: l.id, label: l.name });
  }
  /** How the hovered list shows the pending drop. */
  function dropCls(id: string): string {
    const t = drag.active ? drag.target : null;
    if (!t) return '';
    if ((t.type === 'playlist' || t.type === 'folder') && t.id === id) return 'drop-add';
    if (t.type === 'list' && t.id === id) return 'drop-' + t.at;
    return '';
  }
  /** Folders a list can move into (not itself or its own sub-folders). */
  function moveTargets(l: List): List[] {
    const all = [...(lib.store?.lists.values() ?? [])].filter(x => x.kind === 'folder' && x.id !== l.id);
    const inside = (x: List) => { for (let p: string | null = x.parentId; p; p = lib.store?.lists.get(p)?.parentId ?? null) if (p === l.id) return true; return false; };
    return all.filter(x => !inside(x)).sort((a, b) => lib.listPath(a).localeCompare(lib.listPath(b)));
  }
  function moveTo(l: List, parentId: string | null) {
    lib.placeList(l.id, parentId, Infinity);
    if (parentId) open[parentId] = true;
  }
  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };

  // ─── Menus: right-click on a row or a section's head, or its ⋯ (ADR 0067) ───
  /** The row whose menu is open (outlined meanwhile). */
  let menuRow = $state<string | null>(null);
  const menued = (key: string) => !!menu.at && menuRow === key;
  function onMenu(e: MouseEvent, key: string, build: () => MenuEntry[], label: string) { if (menu.context(e, build, label)) menuRow = key; }
  function onMore(el: Element, key: string, build: () => MenuEntry[], label: string) { menu.from(el, build, label); menuRow = key; }
  const plural = (n: number, one: string) => n + ' ' + one + (n === 1 ? '' : 's');

  const LIB_VIEWS: [ViewSel['kind'], string][] = [['all', 'All tracks'], ['recent', 'Recently added'], ['attention', 'Lower quality'], ['pending', 'Not analysed yet'], ['failed', 'Couldn’t analyse'], ['unlinked', 'No file linked'], ['dupes', 'Duplicates']];
  const libShown = (): MenuEntry[] => tidy([
    ...LIB_VIEWS.filter(([k]) => k !== 'all').map(([k, label]) => {
      const v = k as LibView, on = !sidebar.hidden.has(v);
      return { label, checked: on, stay: true, attrs: { 'data-view-shown': k }, run: () => (on ? hideView(v) : sidebar.show(v)) };
    }),
    sidebar.hidden.size > 0 && SEP,
    sidebar.hidden.size > 0 && { label: 'Show them all', run: () => sidebar.show() },
  ]);
  function hideView(v: LibView) { sidebar.hide(v); if (view.sel.kind === v) view.select({ kind: 'all' }); }
  function libMenu(k: ViewSel['kind'], label: string): MenuEntry[] {
    return tidy([
      { label: 'Open', run: () => view.select({ kind: k } as ViewSel) },
      { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: label, sel: { kind: k } as ViewSel }) },
      k !== 'all' && { label: 'Hide “' + label + '”', attrs: { 'data-m': 'hide-view' }, title: 'Take it out of the sidebar; bring it back by right-clicking “Library”', run: () => hideView(k as LibView) },
      SEP,
      { label: 'Shown in Library', sub: libShown },
    ]);
  }
  /** A section's head: what its buttons do, and collapsing it. */
  function secMenu(k: SideKey): MenuEntry[] {
    const own: (MenuEntry | false)[] =
      k === 'library' ? [{ head: 'Shown in Library' }, ...libShown()]
      : k === 'playlists' ? [{ label: 'New playlist', run: () => newList('playlist') }, { label: 'New folder', run: () => newList('folder') }, { label: 'Build a playlist from your collection…', run: () => auto.show(null) }, SEP, { label: 'Recently deleted…', attrs: { 'data-m': 'bin' }, run: () => (view.binOpen = true) }]
      : k === 'tags' ? [{ label: 'New tag…', run: newTag }]
      : k === 'music' ? [canPickFolders() && { label: 'Add a music folder…', run: () => void lib.addFolder() }, { label: 'Add songs…', run: () => void addSongs() }]
      : [{ label: 'Import a library file…', run: () => { if (homeMode()) void importWithHome(); else fileInput?.click(); } }, { label: 'Look for libraries in another folder…', run: () => void lib.addLibraryPlace('documents') }];
    return tidy([...own, SEP,
      { label: sidebar.open(k) ? 'Collapse' : 'Expand', run: () => sidebar.toggle(k) },
      { label: sidebar.focus === k ? 'Show all sections again' : 'Give it the full height', run: () => sidebar.maximize(k) }]);
  }

  /** A playlist's or folder's songs that can play here, in order. */
  function playList(l: List) {
    const ts = dock.tracksOf(l.id).filter(t => lib.playsHere(t));
    if (ts.length) void nowPlaying.play(ts[0].id, ts.map(t => t.id), 0, l.name); else lib.notice = 'Nothing in ' + l.name + ' can play here.';
  }
  function saveM3u8(l: List) {
    const { text, missing } = playlistM3u8(l);
    downloadBlob(new Blob([text], { type: 'audio/x-mpegurl' }), l.name.replace(/[\\/:*?"<>|]+/g, '_') + '.m3u8');
    if (missing) lib.notice = plural(missing, 'song') + ' of ' + l.name + ' have no known place on disk: they’re comments in the file.';
  }
  /** A linked copy's original, in its DJ library's tree (ADR 0063). */
  function showInDj(src: Source, ext: string) {
    djOpen[src.id] = true;
    const byExt = new Map((src.tree ?? []).map(x => [x.externalId, x]));
    for (let q = byExt.get(ext)?.parent; q; q = byExt.get(q)?.parent) djOpen[src.id + ':' + q] = true;
    view.select({ kind: 'dj', sourceId: src.id, id: ext });
  }
  function listMenu(l: List): MenuEntry[] {
    const siblings = childrenOf(l.parentId ?? '', lib.version);
    const src = l.origin ? lib.store?.sources.get(l.origin.sourceId) : undefined, ext = l.origin?.externalId ?? '';
    const songs = dock.tracksOf(l.id).length, ev = events.ofList(l.id);
    return tidy([
      { label: 'Open', run: () => { view.select({ kind: 'list', id: l.id }); if (l.kind === 'folder') open[l.id] = true; } },
      !!ev && { label: 'Open the event', hint: ev.starts.slice(0, 10), attrs: { 'data-m': 'open-event' }, run: () => router.go('#/events/' + ev.id) },
      l.event === '*' && { label: 'Open the calendar', run: () => router.go('#/events') },
      songs > 0 && { label: 'Play', hint: String(songs), attrs: { 'data-m': 'play' }, run: () => playList(l) },
      songs > 0 && { label: 'Play next', attrs: { 'data-m': 'play-next' }, run: () => nowPlaying.enqueue(dock.tracksOf(l.id).map(t => t.id), 'next') },
      songs > 0 && { label: 'Add to queue', attrs: { 'data-m': 'queue' }, run: () => nowPlaying.enqueue(dock.tracksOf(l.id).map(t => t.id), 'end') },
      { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: l.name, sel: { kind: 'list', id: l.id } }) },
      SEP,
      { label: 'Rename', attrs: { 'data-m': 'rename' }, run: () => (view.editing = l.id) },
      { colors: LIST_COLORS, value: l.color ?? null, pick: (c: string | null) => lib.setListColor(l.id, c) },
      { label: 'Tags…', hint: l.tags?.length ? plural(l.tags.length, 'tag') : undefined, attrs: { 'data-m': 'tags' }, run: () => (view.tagFor = { listId: l.id, x: menu.point.x, y: menu.point.y }) },
      l.kind === 'folder' && { label: 'New playlist inside', run: () => newList('playlist', l.id) },
      l.kind === 'folder' && { label: 'New folder inside', run: () => newList('folder', l.id) },
      SEP,
      { label: 'Move up', disabled: siblings[0]?.id === l.id, run: () => lib.nudgeList(l.id, -1) },
      { label: 'Move down', disabled: siblings[siblings.length - 1]?.id === l.id, run: () => lib.nudgeList(l.id, 1) },
      {
        label: 'Move to', find: 'Find a folder', attrs: { 'data-m': 'move-to' },
        sub: () => [{ label: 'Top level', checked: !l.parentId, attrs: { 'data-move-to': '' }, run: () => moveTo(l, null) }, SEP,
          ...moveTargets(l).map(f => ({ label: lib.listPath(f), checked: l.parentId === f.id, color: f.color ?? null, attrs: { 'data-move-to': f.id }, run: () => moveTo(l, f.id) }))],
      },
      SEP,
      dock.available && { label: 'Add to drag dock', attrs: { 'data-dock-list': l.id }, run: () => void dock.add(dock.tracksOf(l.id), l.name) },
      l.kind === 'playlist' && { label: 'Save as a playlist file (.m3u8)', run: () => saveM3u8(l) },
      !!src && !!src.tree?.some(x => x.externalId === ext) && { label: 'Show in ' + (APP_NAMES[src.app] ?? src.app) + '’s library', run: () => showInDj(src, ext) },
      SEP,
      { label: 'Delete…', danger: true, attrs: { 'data-m': 'delete' }, run: () => remove(l) },
    ]);
  }
  function tagMenu(t: { name: string; tracks: number }): MenuEntry[] {
    const sel = [...view.selected], s = lib.store;
    const having = sel.filter(id => { const tr = s?.tracks.get(id); return !!tr && hasTag(tagsOf(tr), t.name); }).length;
    const only = view.filters.tag.some(x => x.toLowerCase() === t.name.toLowerCase());
    return tidy([
      { label: 'Show its songs', run: () => view.select({ kind: 'tag', name: t.name }) },
      { label: only ? 'Stop showing only it here' : 'Show only it here', title: 'Filter the songs on screen by this tag', run: () => view.toggleFilter('tag', t.name) },
      { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: t.name, sel: { kind: 'tag', name: t.name } }) },
      sel.length > having && { label: 'Put it on the ' + plural(sel.length - having, 'selected song'), attrs: { 'data-m': 'tag-on' }, run: () => lib.tagTracks(sel, [t.name]) },
      having > 0 && { label: 'Take it off the ' + plural(having, 'selected song'), attrs: { 'data-m': 'tag-off' }, run: () => lib.tagTracks(sel, [], [t.name]) },
      SEP,
      { label: 'Rename…', run: () => renameTag(t.name) },
      { label: 'Delete…', danger: true, run: () => deleteTag(t.name, t.tracks) },
    ]);
  }
  // What it takes with it, said first (ADR 0111): its songs leave the collection, with their ratings, notes, cues
  // and playlist places; the files stay on disk.
  function removeFolder(r: RootState) {
    const songs = lib.folderSongs(r.root.id), what = removalImpact(songs, lib.store?.lists.values() ?? []);
    const kept = what.elsewhere ? ' ' + what.elsewhere.toLocaleString() + ' also on another computer stay, as that computer’s.' : '';
    if (confirm('Remove “' + r.root.name + '” from this collection?\n\nIts songs leave the collection: ' + describeRemoval(what) + '. Their ratings, notes, cues and places in playlists go with them.' + kept + ' No files are deleted from the disk.')) void lib.removeFolder(r.root.id);
  }
  function copyPath(path: string) { void navigator.clipboard.writeText(path).then(() => (lib.notice = 'Copied ' + path + '.'), () => (lib.notice = 'The browser didn’t allow copying.')); }
  function folderMenu(r: RootState): MenuEntry[] {
    const path = r.root.absPath;
    return tidy([
      { label: 'Show its songs', run: () => view.select({ kind: 'root', id: r.root.id }) },
      { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: r.root.name, sel: { kind: 'root', id: r.root.id } }) },
      !r.dir && { label: 'Find the folder…', run: () => void lib.relinkFolder(r.root.id) },
      !!r.dir && !r.granted && { label: 'Allow access', run: () => void lib.reconnectFolder(r.root.id) },
      { label: 'Scan again', run: () => void lib.scanRoot(r.root.id) },
      SEP,
      { label: 'Where is it on disk…', title: path ?? 'Not known yet', run: () => (pathEdit = r.root.id) },
      !!path && { label: 'Copy its path', title: path, run: () => copyPath(path) },
      dock.available && { label: 'Add its songs to the drag dock', run: () => void dock.add(dock.tracksOfFolder(r.root.id), r.root.name) },
      SEP,
      // The main folder (ADR 0121): among duplicates, its copy is the best (a lossless one elsewhere still wins).
      !lib.readOnly && (mainRoot === r.root.id
        ? { label: 'Not the main folder any more', attrs: { 'data-m': 'unmain' }, run: () => dupes.setMainRoot(null) }
        : { label: 'Make it the main folder', attrs: { 'data-m': 'main' }, title: 'Among duplicates, the copy in this folder is kept (a lossless copy elsewhere still beats a lossy one here)', run: () => dupes.setMainRoot(r.root.id) }),
      SEP,
      { label: 'Remove from collection…', danger: true, run: () => removeFolder(r) },
    ]);
  }
  function removeSource(s: Source) { if (confirm('Remove the ' + (APP_NAMES[s.app] ?? s.app) + ' import and its playlists? Tracks with a linked file stay.')) lib.deleteSource(s.id); }
  /** Another computer's library (ADR 0099): that computer's name, else null (this computer's own). */
  const elsewhere = (s: Source): string | null => lib.store && !lib.store.ownSource(s) ? (lib.store.shared?.here.members[s.computer!]?.name ?? 'another computer') : null;
  function sourceMenu(s: Source): MenuEntry[] {
    const name = APP_NAMES[s.app] ?? s.app, st = djWatch.status[s.id], n = s.tree?.length ?? 0;
    if (elsewhere(s)) return tidy([
      { label: 'Show its songs', run: () => view.select({ kind: 'source', id: s.id }) },
      n > 0 && { label: djOpen[s.id] ? 'Hide its playlists' : 'Show its playlists', run: () => (djOpen[s.id] = !djOpen[s.id]) },
      n > 0 && { label: 'Import all ' + n + ' into GLUE', run: () => importDj(s, '', name) },
    ]);
    return tidy([
      { label: 'Show its songs', run: () => view.select({ kind: 'source', id: s.id }) },
      { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: name, sel: { kind: 'source', id: s.id } }) },
      n > 0 && { label: djOpen[s.id] ? 'Hide its playlists' : 'Show its playlists', run: () => (djOpen[s.id] = !djOpen[s.id]) },
      n > 0 && { label: 'Import all ' + n + ' into GLUE', run: () => importDj(s, '', name) },
      SEP,
      live ? st !== 'live' && st !== 'reading' && { label: 'Find its file…', title: 'GLUE Home follows a library live once it knows its file', run: () => void importWithHome() }
        : { label: 'Refresh', title: 'Read this library again', run: () => void refresh(s) },
      SEP,
      { label: 'Remove this import…', danger: true, run: () => removeSource(s) },
    ]);
  }
  function djMenuOf(src: Source, l: SourceList): MenuEntry[] {
    const copy = lib.linkedCopy(src.id, l.externalId), whole = !!copy && !copy.origin?.chain;
    return tidy([
      { label: 'Show its songs', run: () => view.select({ kind: 'dj', sourceId: src.id, id: l.externalId }) },
      { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: l.name, sel: { kind: 'dj', sourceId: src.id, id: l.externalId } }) },
      { label: whole ? 'Import again (brings back what’s missing)' : 'Import to GLUE', attrs: { 'data-dj-import': l.externalId }, run: () => importDj(src, l.externalId, l.name) },
      !!copy && { label: 'Open GLUE’s copy', run: () => view.select({ kind: 'list', id: copy!.id }) },
    ]);
  }
</script>


{#snippet djNode(src: Source, l: SourceList, depth: number)}
  {@const kids = kidsOf(src, l.externalId)}
  {@const key = src.id + ':' + l.externalId}
  {@const copy = copyOf(src.id, l.externalId, lib.version)}
  {@const whole = !!copy && !copy.origin?.chain}
  <li>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="item dj" class:sel={isSel({ kind: 'dj', sourceId: src.id, id: l.externalId })} class:menued={menued('dj:' + key)} style:padding-left={8 + depth * 14 + 'px'} data-dj={l.externalId}
      oncontextmenu={e => onMenu(e, 'dj:' + key, () => djMenuOf(src, l), l.name)}>
      {#if kids.length}<button type="button" class="twist" aria-label={djOpen[key] ? 'Collapse' : 'Expand'} onclick={() => (djOpen[key] = !djOpen[key])}>{djOpen[key] ? '▾' : '▸'}</button>{:else}<span class="twist"></span>{/if}
      {#if l.kind === 'folder'}<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h5l1.5 1.5h6.5v8h-13z" fill="currentColor"/></svg>
      {:else}<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5v8.2a2.3 2.3 0 1 0 1.5 2.1V5.5l5-1.3v5.4a2.3 2.3 0 1 0 1.5 2.1V1.2z" fill="currentColor"/></svg>{/if}
      <button type="button" class="name" title={l.name + ' in ' + (APP_NAMES[src.app] ?? src.app)} onclick={() => { view.select({ kind: 'dj', sourceId: src.id, id: l.externalId }); if (kids.length) djOpen[key] = true; }}>{l.name}</button>
      {#if whole}<button type="button" class="ingl" title="In GLUE, kept in step: open GLUE's copy" onclick={() => view.select({ kind: 'list', id: copy!.id })}>✓</button>{/if}
      <span class="n">{l.kind === 'playlist' || l.items.length ? l.items.length : ''}</span>
      <span class="tools" class:open={menued('dj:' + key)}>
        <button type="button" class="more" title="More (or right-click)" aria-haspopup="menu" aria-expanded={menued('dj:' + key)} onclick={e => onMore(e.currentTarget, 'dj:' + key, () => djMenuOf(src, l), l.name)}>⋯</button>
      </span>
    </div>
    {#if kids.length && djOpen[key]}<ul>{#each kids as k (k.externalId)}{@render djNode(src, k, depth + 1)}{/each}</ul>{/if}
  </li>
{/snippet}

{#snippet node(l: List, depth: number)}
  {@const kids = l.kind === 'folder' ? childrenOf(l.id, lib.version) : []}
  <li>
    <div class={'item ' + dropCls(l.id)} class:colored={!!l.color} class:sel={isSel({ kind: 'list', id: l.id })} class:lifted={drag.active && drag.payload?.kind === 'list' && drag.payload.id === l.id}
      style:padding-left={8 + depth * 14 + 'px'} style:--lc={l.color ?? null}
      role="treeitem" aria-selected={isSel({ kind: 'list', id: l.id })} aria-expanded={l.kind === 'folder' ? !!open[l.id] : undefined} tabindex="-1"
      data-drop="list" data-id={l.id} draggable={view.editing !== l.id} ondragstart={e => startListDrag(e, l)} ondragend={() => drag.end()}
      class:menued={menued('l:' + l.id)} oncontextmenu={e => { if (view.editing !== l.id) onMenu(e, 'l:' + l.id, () => listMenu(l), l.name); }}>
      {#if l.kind === 'folder'}
        <button type="button" class="twist" aria-label={open[l.id] ? 'Collapse' : 'Expand'} onclick={() => (open[l.id] = !open[l.id])}>{open[l.id] ? '▾' : '▸'}</button>
        <svg class="icon" class:colored={!!l.color} viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h5l1.5 1.5h6.5v8h-13z" fill="currentColor"/></svg>
      {:else}
        <span class="twist"></span>
        {#if dragOut}
          <span class="drag-out" draggable="true" role="button" tabindex="-1" aria-label={'Drag ' + l.name + ' out as a playlist file'}
            title="Drag out as a playlist file (.m3u8) to Explorer or the desktop; rekordbox imports it with File › Import › Import Playlist"
            ondragstart={e => startPlaylistDrag(e, l)}>
            <svg class="icon" class:colored={!!l.color} viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5v8.2a2.3 2.3 0 1 0 1.5 2.1V5.5l5-1.3v5.4a2.3 2.3 0 1 0 1.5 2.1V1.2z" fill="currentColor"/></svg>
          </span>
        {:else}
          <svg class="icon" class:colored={!!l.color} viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5v8.2a2.3 2.3 0 1 0 1.5 2.1V5.5l5-1.3v5.4a2.3 2.3 0 1 0 1.5 2.1V1.2z" fill="currentColor"/></svg>
        {/if}
      {/if}
      {#if view.editing === l.id}
        <input class="rename" value={l.name} use:focus onblur={e => rename(l, e.currentTarget.value)}
          onkeydown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') view.editing = null; }}>
      {:else}
        <button type="button" class="name" onclick={e => nameClick(e, l)} ondblclick={() => { clearTimeout(slow); view.editing = l.id; }}>
          {l.name}{#if l.origin}{@const app = lib.store?.sources.get(l.origin.sourceId)?.app}<span class="imp" title={app ? 'From ' + (APP_NAMES[app] ?? app) + ', kept in step with it' : 'Imported; its library isn’t in GLUE any more'}>{#if app}<AppIcon {app} size={13} />{:else}↓{/if}</span>{/if}
        </button>
        {#if dropCls(l.id) === 'drop-add'}<span class="plus" aria-hidden="true">+</span>{:else}<span class="n">{l.kind === 'playlist' || l.items.length ? l.items.length : ''}</span>{/if}
        <span class="tools" class:open={menued('l:' + l.id)}>
          <button type="button" class="more" title="More (or right-click)" aria-haspopup="menu" aria-expanded={menued('l:' + l.id)} onclick={e => onMore(e.currentTarget, 'l:' + l.id, () => listMenu(l), l.name)}>⋯</button>
        </span>
      {/if}
    </div>
    {#if kids.length && open[l.id]}
      <ul role="group">{#each kids as k (k.id)}{@render node(k, depth + 1)}{/each}</ul>
    {/if}
  </li>
{/snippet}

{#snippet secHead(k: SideKey, label: string)}
  <h3 class="label"><button type="button" class="sechead" aria-expanded={sidebar.open(k)} data-sec={k} title={sidebar.open(k) ? 'Collapse' : 'Expand'} onclick={() => sidebar.toggle(k)}><span class="chev" class:shut={!sidebar.open(k)} aria-hidden="true">▾</span>{label}</button></h3>
{/snippet}
{#snippet maxBtn(k: SideKey)}
  <button type="button" class="maxb" class:on={sidebar.focus === k} data-max={k} title={sidebar.focus === k ? 'Show all sections again' : 'Give this section the full height'} aria-pressed={sidebar.focus === k} onclick={() => sidebar.maximize(k)}>{sidebar.focus === k ? '⤡' : '⤢'}</button>
{/snippet}

<nav class="lside" class:focused={!!sidebar.focus} aria-label="Library">
  <section class:max={sidebar.focus === 'library'} data-guide="library-views">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="head" class:menued={menued('sec:library')} oncontextmenu={e => onMenu(e, 'sec:library', () => secMenu('library'), 'Section')}>{@render secHead('library', 'Library')}<span class="add">{@render maxBtn('library')}</span></div>
    {#if sidebar.open('library')}
    <ul>
      {#each [['all', 'All tracks', counts.all], ['recent', 'Recently added', null], ['attention', 'Lower quality', counts.attention], ['pending', 'Not analysed yet', counts.pending], ['failed', 'Couldn’t analyse', counts.failed], ['unlinked', 'No file linked', counts.unlinked], ['dupes', 'Duplicates', dupes.groups.length]].filter(([k, , n]) => !sidebar.hidden.has(k as LibView) && (k !== 'failed' || !!n)) as [k, label, n] (k)}
        <li><button type="button" class="item name" class:sel={isSel({ kind: k } as ViewSel)} class:menued={menued('v:' + k)} data-view={k} title={k === 'attention' ? 'For information: songs whose quality is lower than a lossless file of their format (lossy, transcoded, upsampled, padded to 24-bit, or doubtful). Nothing to do.' : undefined} onclick={() => view.select({ kind: k } as ViewSel)}
          oncontextmenu={e => onMenu(e, 'v:' + k, () => libMenu(k as ViewSel['kind'], String(label)), String(label))}>{label}<span class="n">{n ?? ''}</span></button></li>
        {#if k === 'all'}
          <!-- Browse by a field (the user's list, 2026-09-28): its values, then one value's songs. -->
          <li class="browse-head"><button type="button" class="twist" id="browse-toggle" aria-expanded={browseOpen} aria-label={browseOpen ? 'Hide Browse' : 'Show Browse'} onclick={() => setBrowse(!browseOpen)}>{browseOpen ? '▾' : '▸'}</button><button type="button" class="item name sub" onclick={() => setBrowse(!browseOpen)}>Browse</button></li>
          {#if browseOpen}
            {#each FACETS as f (f.by)}
              <li><button type="button" class="item name sub2" class:sel={(view.sel.kind === 'browse' || view.sel.kind === 'facet') && view.sel.by === f.by} data-browse={f.by} onclick={() => view.select({ kind: 'browse', by: f.by })}>{f.name}<span class="n">{facetCounts[f.by] || ''}</span></button></li>
            {/each}
          {/if}
        {/if}
      {/each}
      {#if sidebar.hidden.size}<li><button type="button" class="inline morev" id="hidden-views" title="Hidden by right-clicking them" onclick={e => onMore(e.currentTarget, 'sec:library', libShown, 'Shown in Library')}>{sidebar.hidden.size} hidden · show…</button></li>{/if}
    </ul>
    {/if}
  </section>

  <section class:max={sidebar.focus === 'playlists'} data-guide="playlists">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="head" class:menued={menued('sec:playlists')} oncontextmenu={e => onMenu(e, 'sec:playlists', () => secMenu('playlists'), 'Section')}>
      {@render secHead('playlists', 'Playlists')}
      <span class="add">
        <button type="button" id="new-playlist" title="New playlist (or drop tracks here)" class:hot={drag.active && drag.target?.type === 'new'} data-drop="new" onclick={() => newList('playlist')}>+ Playlist</button>
        <button type="button" id="new-auto" title="Generate a playlist from your collection" onclick={() => auto.show(null)}>+ Auto</button>
        <button type="button" id="new-folder" title="New folder" onclick={() => newList('folder')}>+ Folder</button>
        {@render maxBtn('playlists')}
      </span>
    </div>
    {#if sidebar.open('playlists')}
    <ul class="tree" role="tree">
      {#each top as l (l.id)}{@render node(l, 0)}{/each}
      {#if !top.length}<li class="empty">No playlists yet. Create one, or import a DJ library.</li>{/if}
      {#if drag.active && drag.payload?.kind === 'list'}<li class="topzone" class:on={drag.target?.type === 'top'} data-drop="top">Move to the top level</li>{/if}
    </ul>
    <button type="button" class="binlink" id="open-bin" title="Playlists and folders deleted in the last 30 days" onclick={() => (view.binOpen = true)}>Recently deleted</button>
    {/if}
  </section>

  <section class="tags-sec" class:max={sidebar.focus === 'tags'}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="head" class:menued={menued('sec:tags')} oncontextmenu={e => onMenu(e, 'sec:tags', () => secMenu('tags'), 'Section')}>
      {@render secHead('tags', 'Tags' + (tags.length ? ' · ' + tags.length : ''))}
      <span class="add"><button type="button" id="new-tag" title={view.selected.size ? 'Make a tag and put it on the selected tracks' : 'Make a tag'} onclick={newTag}>+ Tag</button>{@render maxBtn('tags')}</span>
    </div>
    {#if sidebar.open('tags')}
    {#if tags.length > 8}<input class="tfilter" id="tag-filter" type="search" placeholder="Filter {tags.length} tags" bind:value={tagFilter} aria-label="Filter tags">{/if}
    <ul class="taglist">
      {#each shownTags as t (t.name)}
        {@const hot = drag.active && drag.target?.type === 'tag' && drag.target.name === t.name}
        <li>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="item tagitem" class:sel={view.sel.kind === 'tag' && view.sel.name.toLowerCase() === t.name.toLowerCase()} class:drop-add={hot} data-drop="tag" data-tag={t.name} style:--tc={tagColorOf(t.name)}
            class:menued={menued('t:' + t.name)} oncontextmenu={e => onMenu(e, 't:' + t.name, () => tagMenu(t), t.name)}>
            <i class="tdot" aria-hidden="true"></i>
            <button type="button" class="name" onclick={() => view.select({ kind: 'tag', name: t.name })}>{t.name}</button>
            {#if hot}<span class="plus" aria-hidden="true">+</span>{:else}<span class="n" title={t.lists ? 'On ' + t.lists + ' playlist' + (t.lists === 1 ? '' : 's') + ' too' : ''}>{t.tracks}</span>{/if}
            <span class="tools" class:open={menued('t:' + t.name)}>
              <button type="button" class="more" title="More (or right-click)" aria-haspopup="menu" aria-expanded={menued('t:' + t.name)} onclick={e => onMore(e.currentTarget, 't:' + t.name, () => tagMenu(t), t.name)}>⋯</button>
            </span>
          </div>
        </li>
      {:else}
        <li class="empty">{tags.length ? 'No tag matches.' : 'No tags yet. Tag tracks from the Tags column, or drag tracks onto a tag here.'}</li>
      {/each}
    </ul>
    {/if}
  </section>

  <section class:max={sidebar.focus === 'music'} data-guide="add-music">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="head" class:menued={menued('sec:music')} oncontextmenu={e => onMenu(e, 'sec:music', () => secMenu('music'), 'Section')}>
      {@render secHead('music', 'Music')}
      <span class="add">
        {#if canPickFolders()}<button type="button" id="add-folder" title="Add a folder of music" onclick={() => lib.addFolder()}>+ Folder</button>{/if}
        <button type="button" id="add-songs" title="Add individual songs" onclick={addSongs}>+ Songs</button>
        {@render maxBtn('music')}
      </span>
    </div>
    <input type="file" multiple accept="audio/*,.flac,.wav,.aif,.aiff,.aifc,.m4a,.mp4,.alac,.mp3,.aac,.ogg,.oga,.opus,.webm,.mka" bind:this={songInput} hidden id="songs-input"
      onchange={e => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void lib.addFileCopies(f); }}>
    {#if sidebar.open('music')}
    <ul>
      {#each lib.musicFolders as r (r.root.id)}
        <li>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="item" class:sel={isSel({ kind: 'root', id: r.root.id })} class:menued={menued('r:' + r.root.id)} data-root={r.root.id} oncontextmenu={e => onMenu(e, 'r:' + r.root.id, () => folderMenu(r), r.root.name)}>
            <button type="button" class="name" onclick={() => view.select({ kind: 'root', id: r.root.id })} title={r.root.absPath ?? 'Location on disk not known yet'}>📁 {r.root.name}{#if mainRoot === r.root.id}<span class="mainf" title="Your main folder: among duplicates, its copy is kept">main</span>{/if}</button>
            {#if !r.dir}<button type="button" class="reconnect" title="GLUE lost its link to this folder (restored backup or cleared browser data): choose it again" onclick={() => lib.relinkFolder(r.root.id)}>Find folder</button>
            {:else if !r.granted}<button type="button" class="reconnect" onclick={() => lib.reconnectFolder(r.root.id)}>Allow</button>{/if}
            <span class="tools">
              {#if dock.available}<button type="button" title="Add this folder's songs to the drag dock" data-dock-root={r.root.id} onclick={() => void dock.add(dock.tracksOfFolder(r.root.id), r.root.name)}>⇲</button>{/if}
              <button type="button" title="Scan again" onclick={() => lib.scanRoot(r.root.id)}>↻</button>
              <button type="button" title="Where is this folder on disk? (for exports)" onclick={() => (pathEdit = pathEdit === r.root.id ? null : r.root.id)}>⌖</button>
              <button type="button" title="Remove from collection" onclick={() => removeFolder(r)}>×</button>
            </span>
          </div>
          {#if pathEdit === r.root.id}
            <form class="path" onsubmit={e => { e.preventDefault(); const v = new FormData(e.currentTarget).get('p'); void lib.setRootPath(r.root.id, String(v ?? '')); pathEdit = null; }}>
              <input name="p" value={r.root.absPath ?? ''} placeholder={navigator.userAgent.includes('Windows') ? 'C:\\Users\\you\\Music' : '/Users/you/Music'}>
              <button type="submit">Save</button>
            </form>
          {/if}
        </li>
      {/each}
      {#if loose}
        <li><button type="button" class="item name" class:sel={isSel({ kind: 'root', id: LOOSE })} class:menued={menued('r:' + LOOSE)} onclick={() => view.select({ kind: 'root', id: LOOSE })} title="Songs added one by one"
          oncontextmenu={e => onMenu(e, 'r:' + LOOSE, () => [{ label: 'Show its songs', run: () => view.select({ kind: 'root', id: LOOSE }) }, { label: 'Add songs…', run: () => void addSongs() }], 'Added songs')}>🎵 Added songs<span class="n">{loose}</span></button></li>
      {/if}
      {#if !lib.musicFolders.length && !loose}<li class="empty">{canPickFolders() ? 'Add the folders your music lives in, or single songs (or drop them here). GLUE only reads them.' : 'Add songs, or drop them onto GLUE: they’re copied into GLUE’s storage. Linking whole folders needs Chrome or Edge.'}</li>{/if}
    </ul>
    {/if}
  </section>

  <section class:max={sidebar.focus === 'dj'}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="head" class:menued={menued('sec:dj')} oncontextmenu={e => onMenu(e, 'sec:dj', () => secMenu('dj'), 'Section')}>
      {@render secHead('dj', 'DJ libraries')}
      <span class="add">
        <button type="button" id="find-libs" title="Allow another folder for GLUE to look for DJ libraries in" onclick={() => lib.addLibraryPlace('documents')}>Look in…</button>
        <button type="button" id="import-lib" onclick={() => { if (homeMode()) void importWithHome(); else fileInput?.click(); }} title="Choose a library file yourself: rekordbox XML, Engine DJ m.db, Traktor NML, iTunes / Apple Music XML, M3U">+ Import</button>
        {@render maxBtn('dj')}
      </span>
    </div>
    <input type="file" multiple accept={IMPORT_ACCEPT} bind:this={refreshInput} hidden id="refresh-input"
      onchange={e => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; if (refreshFor) { chooseAgain.delete(refreshFor); void refreshWithFile(refreshFor, f); } }}>
    <input type="file" multiple accept={IMPORT_ACCEPT} bind:this={fileInput} hidden id="import-input"
      onchange={e => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void importFiles(f); }}>
    {#if sidebar.open('dj')}
    <ul id="dj-libs">
      {#each sources as s (s.id)}
        {@const d = lib.detected.find(x => x.sourceId === s.id)}
        {@const changed = d?.status === 'changed' && d.modified > (s.origin?.modified ?? 0) + 1000}
        <li>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="item" class:sel={isSel({ kind: 'source', id: s.id })} class:menued={menued('s:' + s.id)} data-source={s.id} oncontextmenu={e => onMenu(e, 's:' + s.id, () => sourceMenu(s), APP_NAMES[s.app] ?? s.app)}>
            {#if s.tree?.length}<button type="button" class="twist" data-dj-open={s.id} aria-label={djOpen[s.id] ? 'Hide its playlists' : 'Show its playlists'} onclick={() => (djOpen[s.id] = !djOpen[s.id])}>{djOpen[s.id] ? '▾' : '▸'}</button>{:else}<span class="twist"></span>{/if}
            <AppIcon app={s.app} />
            <button type="button" class="name" onclick={() => view.select({ kind: 'source', id: s.id })} title={'Imported ' + new Date(s.importedAt).toLocaleString() + ' from ' + (s.origin ? s.origin.relPath : s.fileName)}>{APP_NAMES[s.app] ?? s.app}<small> {s.fileName}</small></button>
            <span class="n">{s.tracks.length}</span>
            {#if elsewhere(s)}<span class="onpc" data-dj-where={s.id} title={'On ' + elsewhere(s) + ': GLUE reads it there, and keeps it up to date for every device'}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 13.5h5M8 11v2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>{elsewhere(s)}</span>
            {:else if live}
              {#if djWatch.status[s.id] === 'live' || djWatch.status[s.id] === 'reading'}<span class="live" class:reading={djWatch.status[s.id] === 'reading'} data-dj-live={s.id} title={djWatch.status[s.id] === 'reading' ? 'Reading its changes…' : 'Followed live through GLUE Home: its changes show here within seconds'}>●</span>
              {:else}<button type="button" class="update" data-dj-find={s.id} title="GLUE Home follows a library live once it knows its file: choose it" onclick={() => void importWithHome()}>Find its file…</button>{/if}
            {:else}<button type="button" class="refresh" class:update={changed} data-dj-refresh={s.id} title={changed ? 'Changed since GLUE read it (' + new Date(d!.modified).toLocaleString() + '): read it again' : 'Read this library again (with GLUE Home running, GLUE follows it live)'} onclick={() => void refresh(s)}>{changed ? 'Update' : 'Refresh'}</button>{/if}
            {#if !elsewhere(s)}<span class="tools keep"><button type="button" title="Remove this import" onclick={() => removeSource(s)}>×</button></span>{/if}
          </div>
          {#if djOpen[s.id] && s.tree?.length}
            <ul class="djtree" aria-label={(APP_NAMES[s.app] ?? s.app) + ' playlists'}>
              <li class="djall"><button type="button" class="inline" data-dj-all={s.id} onclick={() => importDj(s, '', APP_NAMES[s.app] ?? s.app)}>Import all {s.tree.length} into GLUE</button></li>
              {#each kidsOf(s, null) as l (l.externalId)}{@render djNode(s, l, 1)}{/each}
            </ul>
          {/if}
        </li>
      {/each}
      {#each lib.detected.filter(d => d.status === 'new') as d (d.place + d.relPath)}
        <li class="found">
          <AppIcon app={d.kind} size={18} />
          <span class="fwho"><b>{FOUND_NAMES[d.kind]}</b><small title={[d, ...(d.also ?? [])].map(x => x.placeName + '/' + x.relPath).join('\n')}>{d.placeName}/{d.relPath}{#if d.also?.length}<span class="also"> + {d.also.length} more {d.also.length === 1 ? 'drive' : 'drives'}</span>{/if}</small></span>
          <button type="button" class="addlib" onclick={() => importDetected(d)}>Add</button>
          <button type="button" class="dismiss" data-dismiss={d.relPath} title="Take it off this list (it can still be imported by hand, with + Import)" aria-label={'Take ' + FOUND_NAMES[d.kind] + ' off the list'} disabled={lib.readOnly} onclick={() => lib.dismissLibrary(d)}>×</button>
        </li>
      {/each}
      {#each lib.places.filter(p => !p.granted) as p (p.key)}
        <li class="found dim"><span class="fwho"><b>{p.name}</b><small>allow again to look for libraries</small></span>
          <button type="button" onclick={() => lib.allowLibraryPlace(p.key)}>Allow</button>
          <button type="button" title="Stop looking here" onclick={() => lib.forgetLibraryPlace(p.key)}>×</button></li>
      {/each}
      {#if lib.detecting}<li class="empty">Looking for DJ libraries…</li>
      {:else if !sources.length && !lib.detected.length}<li class="empty">No DJ libraries found yet.</li>{/if}
    </ul>
    <details class="where">
      <summary>Where are my libraries?</summary>
      <ul class="howto">
        <li><b>Engine DJ</b>, <b>Serato</b>, <b>iTunes</b>: inside your Music folder. Add Music under “Music” above and they show up here. Serato on an external drive: add the drive, or <button type="button" class="inline" onclick={pickSeratoFolder}>choose its _Serato_ folder</button>.</li>
        <li><b>Traktor</b>: Documents › Native Instruments. <button type="button" class="inline" onclick={() => lib.addLibraryPlace('documents')}>Allow that folder once</button>.</li>
        <li><b>rekordbox</b>: its library can’t be read by a web page. In rekordbox use File › Export Collection in xml format and save it in your GLUE folder (<b>{lib.homeName}</b>); it appears here, with Update after each new export.</li>
        <li><b>Apple Music</b> (Mac): File › Library › Export Library, saved in your GLUE folder.</li>
      </ul>
    </details>
    {/if}
  </section>
  
  {#if account.signedIn}<DevicesSection />{/if}   <!-- also in a cloud library: a phone sends songs to a GLUE Home from here (ADR 0077) -->
</nav>

<style>
  .lside { display: grid; gap: 18px; align-content: start; font-size: 13.5px; overflow-y: auto; overflow-x: hidden; padding-right: 4px; min-width: 0; }
  section { display: grid; gap: 4px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .sechead { background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
  .sechead:hover { color: var(--ink); }
  .chev { display: inline-block; font-size: 9px; transition: transform .12s; }
  .chev.shut { transform: rotate(-90deg); }
  .maxb { opacity: .55; }
  .maxb:hover, .maxb.on { opacity: 1; }
  /* A long tag list scrolls within the sidebar; a filter narrows it. */
  .tfilter { width: 100%; box-sizing: border-box; background: var(--ground); border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink); font-size: 12px; padding: 3px 7px; }
  .taglist { max-height: 260px; overflow-y: auto; }
  /* One section maximized: it takes the sidebar's height, its list scrolls; the others show their names. */
  .lside.focused { display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
  .lside.focused section:not(.max) { flex: none; }
  section.max { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  section.max > ul, section.max > .taglist { flex: 1; min-height: 0; overflow-y: auto; max-height: none; }
  .add { display: flex; gap: 4px; }
  .add button, .tools button, .found button, .reconnect, .path button { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 11.5px; padding: 1px 7px; cursor: pointer; }
  .add button:hover, .tools button:hover, .found button:hover { color: var(--accent); border-color: var(--accent); }
  .item { display: flex; align-items: center; gap: 4px; border-radius: 4px; min-height: 28px; padding-right: 4px; width: 100%; box-sizing: border-box; min-width: 0; }
  button.item { background: none; border: 0; text-align: left; cursor: pointer; padding: 0 8px; }
  .item:hover { background: var(--raised); }
  .item.sel { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .item { position: relative; }
  .item.lifted { opacity: .4; }
  .browse-head { display: flex; align-items: center; padding-left: 2px; }
  .browse-head .item { padding-left: 2px; color: var(--ink-2); }
  button.item.sub2 { padding-left: 26px; color: var(--ink-2); }
  button.item.sub2.sel { color: var(--ink); }
  /* Its menu is open (right-click or ⋯). */
  .item.menued, .head.menued { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent); border-radius: 4px; }
  .morev { font-size: 11.5px; color: var(--muted); padding: 2px 8px; text-decoration: none; }
  .morev:hover { color: var(--accent); }
  .item.drop-add, .item.drop-into { background: color-mix(in srgb, var(--accent) 20%, transparent); box-shadow: inset 0 0 0 1px var(--accent); }
  .item.drop-before::before, .item.drop-after::after { content: ''; position: absolute; left: 6px; right: 6px; height: 2px; background: var(--accent); border-radius: 1px; pointer-events: none; }
  .item.drop-before::before { top: -1px; }
  .item.drop-after::after { bottom: -1px; }
  .plus { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font-weight: 800; font-size: 14px; line-height: 1; flex: none; }
  .icon { width: 13px; height: 13px; flex: none; color: var(--muted); }
  .icon.colored { color: var(--lc); }
  .drag-out { display: grid; place-items: center; cursor: grab; border-radius: 3px; padding: 2px; margin: -2px; }
  .drag-out:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  /* A colour tints the whole row, with a bar on the left. */
  .item.colored { background: color-mix(in srgb, var(--lc) 14%, transparent); box-shadow: inset 3px 0 0 var(--lc); }
  .item.colored:hover { background: color-mix(in srgb, var(--lc) 22%, transparent); }
  .item.colored.sel { background: color-mix(in srgb, var(--lc) 30%, transparent); }
  .tools.open { display: flex; }
  /* A library row keeps room for its tools: showing them on hover mustn't move its buttons. */
  .tools.keep { display: flex; visibility: hidden; }
  .item:hover .tools.keep, .item:focus-within .tools.keep { visibility: visible; }
  .tdot { width: 9px; height: 9px; border-radius: 50%; background: var(--tc); flex: none; margin-right: 4px; }
  .tagitem { padding-left: 10px !important; }
  .more-tags { padding: 4px 8px; font-size: 12px; }
  .more { font-size: 13px !important; line-height: 1; padding: 0 6px 2px !important; }
  .topzone { margin-top: 4px; padding: 6px 8px; border: 1px dashed var(--line-2); border-radius: 4px; color: var(--muted); font-size: 12px; text-align: center; }
  .topzone.on { border-color: var(--accent); color: var(--accent); }
  .add button.hot { color: var(--accent-ink); border-color: var(--accent); background: var(--accent); }
  .name { flex: 1; min-width: 0; background: none; border: 0; text-align: left; cursor: pointer; padding: 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; justify-content: space-between; gap: 6px; }
  div.item > .name { padding-left: 2px; }
  section > ul > li > div.item { padding-left: 8px; }
  .name small, .found small { color: var(--muted); }
  .imp { color: var(--muted); font-size: 11px; margin-left: 4px; display: inline-flex; align-items: center; flex: none; }
  .n { color: var(--muted); font-family: var(--font-mono); font-size: 11.5px; }
  .twist { width: 16px; flex: none; background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0; font-size: 11px; text-align: center; }
  .tools { display: none; gap: 2px; }
  .item:hover .tools, .item:focus-within .tools { display: flex; }
  .rename, .path input { flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--accent); border-radius: 3px; padding: 2px 6px; font-size: 13px; }
  .path { display: flex; gap: 4px; padding: 4px 4px 6px 8px; }
  .path input { border-color: var(--line-2); font-family: var(--font-mono); font-size: 12px; }
  .reconnect { color: var(--warn); border-color: var(--warn); }
  .empty, .hint { color: var(--muted); font-size: 12.5px; padding: 4px 8px; }
  .fwho { display: grid; min-width: 0; line-height: 1.3; flex: 1; }
  .fwho b { font-weight: 600; }
  .fwho small { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .found.dim { opacity: .8; }
  .addlib, .update { border-color: var(--accent) !important; color: var(--accent) !important; }
  .update { background: none; border: 1px solid; border-radius: 4px; font-size: 11.5px; padding: 1px 7px; cursor: pointer; }
  .where summary { cursor: pointer; color: var(--muted); font-size: 12.5px; padding: 4px 8px; }
  .howto { display: grid; gap: 6px; padding: 4px 8px 4px 10px; color: var(--ink-2); font-size: 12.5px; }
  .found { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 4px 8px; background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 4px; font-size: 12.5px; }
  .inline { background: none; border: 0; padding: 0; color: var(--accent); text-decoration: underline; cursor: pointer; font-size: inherit; }
  .live { color: var(--ok, #3ecf8e); font-size: 10px; padding: 0 4px; cursor: help; }
  .live.reading { color: var(--accent); animation: blink 1s infinite alternate; }
  @keyframes blink { to { opacity: .35; } }
  .refresh { font-size: 11px; padding: 1px 6px; }
  .ingl { all: unset; cursor: pointer; color: var(--accent); font-size: 11px; font-weight: 800; padding: 0 3px; }
  .mainf { margin-left: 6px; font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ok); border: 1px solid currentColor; border-radius: 3px; padding: 0 4px; vertical-align: 1px; }
  .djtree { list-style: none; margin: 0; padding: 0; }
  .onpc { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .onpc svg { width: 12px; height: 12px; }
  .djall { padding: 2px 0 4px 30px; font-size: 12px; }
  .binlink { background: none; border: 0; padding: 4px 12px 8px; color: var(--muted); font-size: 11px; cursor: pointer; text-align: left; }
  .binlink:hover { color: var(--text); text-decoration: underline; }
</style>
