<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import { view, type ViewSel } from '../../lib/view.svelte';
  import { importDetected, importFiles, pickSeratoFolder } from '../../lib/importActions';
  import { IMPORT_ACCEPT } from '../../lib/imports';
  import { canKeepFiles, canPickFolders, pickAudioFiles } from '../../platform';
  import { LOOSE } from '../../store/merge';
  import { LIST_COLORS, type List } from '../../store/types';
  import { drag } from '../../lib/drag.svelte';
  import { dupes } from '../../lib/dupes.svelte';
  import { auto } from '../../lib/auto.svelte';
  import { canDragOut, startPlaylistDrag } from '../../lib/dragout';
  import { allTags, tagColorOf } from '../../lib/tags.svelte';
  import { account } from '../../lib/account.svelte';
  import DevicesSection from './DevicesSection.svelte';
  import { cleanTag } from '../../core/library/tagging';
  const dragOut = canDragOut();

  const APP_NAMES: Record<string, string> = { rekordbox: 'rekordbox', engine: 'Engine DJ', serato: 'Serato', traktor: 'Traktor', apple: 'Apple Music', m3u: 'M3U' };
  const FOUND_NAMES: Record<string, string> = { engine: 'Engine DJ library', serato: 'Serato library', apple: 'iTunes / Apple Music library', rekordbox: 'rekordbox XML', traktor: 'Traktor collection' };

  const counts = $derived.by(() => {
    void lib.version;
    const s = lib.store;
    let all = 0, pending = 0, unlinked = 0, attention = 0;
    if (s) for (const t of s.tracks.values()) {
      all++;
      if (t.status !== 'linked') unlinked++;
      if (lib.needsAnalysis(t)) pending++;
      const a = s.analysis.get(t.id);
      if (a && (a.grade === 'bad' || a.grade === 'warn')) attention++;
    }
    return { all, pending, unlinked, attention };
  });
  const top = $derived.by(() => { void lib.version; return lib.childLists(null); });
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
  let fileInput = $state<HTMLInputElement>();
  let pathEdit = $state<string | null>(null);
  let menuFor = $state<string | null>(null);   // the list whose ⋯ menu is open
  let tagMenu = $state<string | null>(null);   // the tag whose ⋯ menu is open
  let allShown = $state(false);
  const TAGS_SHOWN = 12;
  const tags = $derived.by(() => { void lib.version; return allTags(); });
  function newTag() {
    const name = cleanTag(prompt(view.selected.size ? 'New tag for the ' + view.selected.size + ' selected track' + (view.selected.size === 1 ? '' : 's') : 'New tag') ?? '');
    if (!name) return;
    if (view.selected.size) lib.tagTracks([...view.selected], [name]); else lib.rememberTags([name]);
  }
  function renameTag(name: string) {
    tagMenu = null;
    const to = cleanTag(prompt('Rename the tag “' + name + '” (on every track and playlist)', name) ?? '');
    if (to && to !== name) { lib.renameTag(name, to); if (view.sel.kind === 'tag' && view.sel.name.toLowerCase() === name.toLowerCase()) view.select({ kind: 'tag', name: to }); }
  }
  function deleteTag(name: string, n: number) {
    tagMenu = null;
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
    menuFor = null;
    const what = l.kind === 'folder' ? 'the folder “' + l.name + '” and everything in it' : 'the playlist “' + l.name + '”';
    if (confirm('Delete ' + what + '? The tracks stay in your collection.')) { lib.deleteList(l.id); if (isSel({ kind: 'list', id: l.id })) view.select({ kind: 'all' }); }
  }
  function pressList(e: PointerEvent, l: List) {
    if (view.editing === l.id || (e.target as HTMLElement).closest('.tools, .twist, input, .drag-out')) return;
    drag.begin(e, { kind: 'list', id: l.id, label: l.name });
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
    menuFor = null;
    lib.placeList(l.id, parentId, Infinity);
    if (parentId) open[parentId] = true;
  }
  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };
</script>

{#snippet node(l: List, depth: number)}
  {@const kids = l.kind === 'folder' ? childrenOf(l.id, lib.version) : []}
  {@const siblings = childrenOf(l.parentId ?? '', lib.version)}
  <li>
    <div class={'item ' + dropCls(l.id)} class:colored={!!l.color} class:sel={isSel({ kind: 'list', id: l.id })} class:lifted={drag.active && drag.payload?.kind === 'list' && drag.payload.id === l.id}
      style:padding-left={8 + depth * 14 + 'px'} style:--lc={l.color ?? null}
      role="treeitem" aria-selected={isSel({ kind: 'list', id: l.id })} aria-expanded={l.kind === 'folder' ? !!open[l.id] : undefined} tabindex="-1"
      data-drop="list" data-id={l.id} onpointerdown={e => pressList(e, l)}>
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
        <button type="button" class="name" onclick={() => { if (drag.suppressClick) return; view.select({ kind: 'list', id: l.id }); if (l.kind === 'folder') open[l.id] = true; }} ondblclick={() => (view.editing = l.id)}>
          {l.name}{#if l.origin}<span class="imp" title="Imported; refreshed when you import the library again">↓</span>{/if}
        </button>
        {#if dropCls(l.id) === 'drop-add'}<span class="plus" aria-hidden="true">+</span>{:else}<span class="n">{l.kind === 'playlist' ? l.items.length : ''}</span>{/if}
        <span class="tools" class:open={menuFor === l.id}>
          <button type="button" class="more" title="More" aria-haspopup="menu" aria-expanded={menuFor === l.id} onclick={() => (menuFor = menuFor === l.id ? null : l.id)}>⋯</button>
        </span>
      {/if}
    </div>
    {#if menuFor === l.id}
      <div class="menu" role="menu" style:margin-left={8 + depth * 14 + 'px'}>
        <div class="colors" role="group" aria-label="Colour">
          <button type="button" class="sw none" class:on={!l.color} title="No colour" onclick={() => lib.setListColor(l.id, null)}>∅</button>
          {#each LIST_COLORS as c (c)}<button type="button" class="sw" class:on={l.color === c} style:background={c} title="Colour" aria-label="Colour" onclick={() => lib.setListColor(l.id, c)}></button>{/each}
        </div>
        <button type="button" role="menuitem" onclick={() => { menuFor = null; view.editing = l.id; }}>Rename</button>
        <button type="button" role="menuitem" data-tags-open onclick={e => { const el = e.currentTarget.closest('.menu')!.previousElementSibling ?? e.currentTarget; menuFor = null; view.editTags(el, { listId: l.id }); }}>Tags…{#if l.tags?.length}<small class="ltags"> {l.tags.join(', ')}</small>{/if}</button>
        {#if l.kind === 'folder'}<button type="button" role="menuitem" onclick={() => { menuFor = null; newList('playlist', l.id); }}>New playlist inside</button>{/if}
        <button type="button" role="menuitem" disabled={siblings[0]?.id === l.id} onclick={() => lib.nudgeList(l.id, -1)}>Move up</button>
        <button type="button" role="menuitem" disabled={siblings[siblings.length - 1]?.id === l.id} onclick={() => lib.nudgeList(l.id, 1)}>Move down</button>
        <label class="moveto">Move to
          <select value={l.parentId ?? ''} onchange={e => moveTo(l, e.currentTarget.value || null)}>
            <option value="">Top level</option>
            {#each moveTargets(l) as f (f.id)}<option value={f.id}>{lib.listPath(f)}</option>{/each}
          </select>
        </label>
        <button type="button" role="menuitem" class="danger" onclick={() => remove(l)}>Delete…</button>
      </div>
    {/if}
    {#if kids.length && open[l.id]}
      <ul role="group">{#each kids as k (k.id)}{@render node(k, depth + 1)}{/each}</ul>
    {/if}
  </li>
{/snippet}

<svelte:window onpointerdown={e => { const el = e.target as HTMLElement; if (menuFor && !el.closest('.menu, .more')) menuFor = null; if (tagMenu && !el.closest('.menu, .more')) tagMenu = null; }} onkeydown={e => { if (e.key === 'Escape') { menuFor = null; tagMenu = null; } }} />

<nav class="lside" aria-label="Library">
  <section>
    <h3 class="label">Library</h3>
    <ul>
      {#each [['all', 'All tracks', counts.all], ['recent', 'Recently added', null], ['attention', 'Needs attention', counts.attention], ['pending', 'Not analysed yet', counts.pending], ['unlinked', 'No file linked', counts.unlinked], ['dupes', 'Duplicates', dupes.groups.length]] as [k, label, n] (k)}
        <li><button type="button" class="item name" class:sel={isSel({ kind: k } as ViewSel)} onclick={() => view.select({ kind: k } as ViewSel)}>{label}<span class="n">{n ?? ''}</span></button></li>
      {/each}
    </ul>
  </section>

  <section>
    <div class="head">
      <h3 class="label">Playlists</h3>
      <span class="add">
        <button type="button" id="new-playlist" title="New playlist (or drop tracks here)" class:hot={drag.active && drag.target?.type === 'new'} data-drop="new" onclick={() => newList('playlist')}>+ Playlist</button>
        <button type="button" id="new-auto" title="Generate a playlist from your collection" onclick={() => auto.show(null)}>+ Auto</button>
        <button type="button" id="new-folder" title="New folder" onclick={() => newList('folder')}>+ Folder</button>
      </span>
    </div>
    <ul class="tree" role="tree">
      {#each top as l (l.id)}{@render node(l, 0)}{/each}
      {#if !top.length}<li class="empty">No playlists yet. Create one, or import a DJ library.</li>{/if}
      {#if drag.active && drag.payload?.kind === 'list'}<li class="topzone" class:on={drag.target?.type === 'top'} data-drop="top">Move to the top level</li>{/if}
    </ul>
  </section>

  <section class="tags-sec">
    <div class="head">
      <h3 class="label">Tags</h3>
      <span class="add"><button type="button" id="new-tag" title={view.selected.size ? 'Make a tag and put it on the selected tracks' : 'Make a tag'} onclick={newTag}>+ Tag</button></span>
    </div>
    <ul>
      {#each allShown ? tags : tags.slice(0, TAGS_SHOWN) as t (t.name)}
        {@const hot = drag.active && drag.target?.type === 'tag' && drag.target.name === t.name}
        <li>
          <div class="item tagitem" class:sel={view.sel.kind === 'tag' && view.sel.name.toLowerCase() === t.name.toLowerCase()} class:drop-add={hot} data-drop="tag" data-tag={t.name} style:--tc={tagColorOf(t.name)}>
            <i class="tdot" aria-hidden="true"></i>
            <button type="button" class="name" onclick={() => view.select({ kind: 'tag', name: t.name })}>{t.name}</button>
            {#if hot}<span class="plus" aria-hidden="true">+</span>{:else}<span class="n" title={t.lists ? 'On ' + t.lists + ' playlist' + (t.lists === 1 ? '' : 's') + ' too' : ''}>{t.tracks}</span>{/if}
            <span class="tools" class:open={tagMenu === t.name}>
              <button type="button" class="more" title="More" aria-haspopup="menu" aria-expanded={tagMenu === t.name} onclick={() => (tagMenu = tagMenu === t.name ? null : t.name)}>⋯</button>
            </span>
          </div>
          {#if tagMenu === t.name}
            <div class="menu" role="menu">
              <button type="button" role="menuitem" onclick={() => renameTag(t.name)}>Rename…</button>
              <button type="button" role="menuitem" class="danger" onclick={() => deleteTag(t.name, t.tracks)}>Delete…</button>
            </div>
          {/if}
        </li>
      {:else}
        <li class="empty">No tags yet. Tag tracks from the Tags column, or drag tracks onto a tag here.</li>
      {/each}
      {#if tags.length > TAGS_SHOWN}<li><button type="button" class="inline more-tags" onclick={() => (allShown = !allShown)}>{allShown ? 'Show fewer' : 'Show all ' + tags.length + ' tags'}</button></li>{/if}
    </ul>
  </section>

  {#if !lib.cloud}
  <section>
    <div class="head">
      <h3 class="label">Music</h3>
      <span class="add">
        {#if canPickFolders()}<button type="button" id="add-folder" title="Add a folder of music" onclick={() => lib.addFolder()}>+ Folder</button>{/if}
        <button type="button" id="add-songs" title="Add individual songs" onclick={addSongs}>+ Songs</button>
      </span>
    </div>
    <input type="file" multiple accept="audio/*,.flac,.wav,.aif,.aiff,.aifc,.m4a,.mp4,.alac,.mp3,.aac,.ogg,.oga,.opus,.webm,.mka" bind:this={songInput} hidden id="songs-input"
      onchange={e => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void lib.addFileCopies(f); }}>
    <ul>
      {#each lib.roots as r (r.root.id)}
        <li>
          <div class="item" class:sel={isSel({ kind: 'root', id: r.root.id })}>
            <button type="button" class="name" onclick={() => view.select({ kind: 'root', id: r.root.id })} title={r.root.absPath ?? 'Location on disk not known yet'}>📁 {r.root.name}</button>
            {#if !r.dir}<button type="button" class="reconnect" title="GLUE lost its link to this folder (restored backup or cleared browser data): choose it again" onclick={() => lib.relinkFolder(r.root.id)}>Find folder</button>
            {:else if !r.granted}<button type="button" class="reconnect" onclick={() => lib.reconnectFolder(r.root.id)}>Allow</button>{/if}
            <span class="tools">
              <button type="button" title="Scan again" onclick={() => lib.scanRoot(r.root.id)}>↻</button>
              <button type="button" title="Where is this folder on disk? (for exports)" onclick={() => (pathEdit = pathEdit === r.root.id ? null : r.root.id)}>⌖</button>
              <button type="button" title="Remove from collection" onclick={() => { if (confirm('Remove “' + r.root.name + '” from this collection? Its tracks stay but become unlinked. No files are deleted.')) void lib.removeFolder(r.root.id); }}>×</button>
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
        <li><button type="button" class="item name" class:sel={isSel({ kind: 'root', id: LOOSE })} onclick={() => view.select({ kind: 'root', id: LOOSE })} title="Songs added one by one">🎵 Added songs<span class="n">{loose}</span></button></li>
      {/if}
      {#if !lib.roots.length && !loose}<li class="empty">{canPickFolders() ? 'Add the folders your music lives in, or single songs (or drop them here). GLUE only reads them.' : 'Add songs, or drop them onto GLUE: they’re copied into GLUE’s storage. Linking whole folders needs Chrome or Edge.'}</li>{/if}
    </ul>
  </section>

  <section>
    <div class="head">
      <h3 class="label">DJ libraries</h3>
      <span class="add">
        <button type="button" id="find-libs" title="Allow another folder for GLUE to look for DJ libraries in" onclick={() => lib.addLibraryPlace('documents')}>Look in…</button>
        <button type="button" id="import-lib" onclick={() => fileInput?.click()} title="Choose a library file yourself: rekordbox XML, Engine DJ m.db, Traktor NML, iTunes / Apple Music XML, M3U">+ Import</button>
      </span>
    </div>
    <input type="file" multiple accept={IMPORT_ACCEPT} bind:this={fileInput} hidden id="import-input"
      onchange={e => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void importFiles(f); }}>
    <ul id="dj-libs">
      {#each sources as s (s.id)}
        {@const d = lib.detected.find(x => x.sourceId === s.id)}
        <li>
          <div class="item" class:sel={isSel({ kind: 'source', id: s.id })}>
            <button type="button" class="name" onclick={() => view.select({ kind: 'source', id: s.id })} title={'Imported ' + new Date(s.importedAt).toLocaleString() + ' from ' + (s.origin ? s.origin.relPath : s.fileName)}>{APP_NAMES[s.app] ?? s.app}<small> {s.fileName}</small></button>
            {#if d?.status === 'changed'}<button type="button" class="update" title={'Changed since you imported it (' + new Date(d.modified).toLocaleString() + ')'} onclick={() => importDetected(d)}>Update</button>
            {:else}<span class="n">{s.tracks.length}</span>{/if}
            <span class="tools"><button type="button" title="Remove this import" onclick={() => { if (confirm('Remove the ' + (APP_NAMES[s.app] ?? s.app) + ' import and its playlists? Tracks with a linked file stay.')) lib.deleteSource(s.id); }}>×</button></span>
          </div>
        </li>
      {/each}
      {#each lib.detected.filter(d => d.status === 'new') as d (d.place + d.relPath)}
        <li class="found">
          <span class="fwho"><b>{FOUND_NAMES[d.kind]}</b><small title={d.placeName + '/' + d.relPath}>{d.placeName}/{d.relPath}</small></span>
          <button type="button" class="addlib" onclick={() => importDetected(d)}>Add</button>
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
  </section>
  {/if}
  {#if account.signedIn && !lib.cloud}<DevicesSection />{/if}
</nav>

<style>
  .lside { display: grid; gap: 18px; align-content: start; font-size: 13.5px; overflow-y: auto; padding-right: 4px; }
  section { display: grid; gap: 4px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .add { display: flex; gap: 4px; }
  .add button, .tools button, .found button, .reconnect, .path button { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 11.5px; padding: 1px 7px; cursor: pointer; }
  .add button:hover, .tools button:hover, .found button:hover { color: var(--accent); border-color: var(--accent); }
  .item { display: flex; align-items: center; gap: 4px; border-radius: 4px; min-height: 28px; padding-right: 4px; width: 100%; }
  button.item { background: none; border: 0; text-align: left; cursor: pointer; padding: 0 8px; }
  .item:hover { background: var(--raised); }
  .item.sel { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .item { position: relative; }
  .item.lifted { opacity: .4; }
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
  .tdot { width: 9px; height: 9px; border-radius: 50%; background: var(--tc); flex: none; margin-right: 4px; }
  .tagitem { padding-left: 10px !important; }
  .ltags { color: var(--muted); }
  .more-tags { padding: 4px 8px; font-size: 12px; }
  .more { font-size: 13px !important; line-height: 1; padding: 0 6px 2px !important; }
  .menu { display: grid; gap: 2px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px; margin: 2px 4px 6px; box-shadow: 0 8px 24px rgb(0 0 0 / .4); font-size: 13px; }
  .menu > button { background: none; border: 0; text-align: left; padding: 5px 8px; border-radius: 4px; cursor: pointer; color: var(--ink); }
  .menu > button:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 15%, transparent); }
  .menu > button:disabled { color: var(--muted); cursor: default; }
  .menu .danger { color: var(--bad); }
  .colors { display: flex; gap: 5px; padding: 4px 6px 6px; flex-wrap: wrap; }
  .sw { width: 16px; height: 16px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
  .sw.on { border-color: var(--ink); }
  .sw.none { background: none; border-color: var(--line-2); color: var(--muted); font-size: 10px; line-height: 1; }
  .sw.none.on { border-color: var(--ink); }
  .moveto { display: flex; align-items: center; gap: 8px; padding: 4px 8px; color: var(--ink-2); }
  .moveto select { flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--line-2); border-radius: 4px; padding: 2px 4px; font-size: 12.5px; }
  .topzone { margin-top: 4px; padding: 6px 8px; border: 1px dashed var(--line-2); border-radius: 4px; color: var(--muted); font-size: 12px; text-align: center; }
  .topzone.on { border-color: var(--accent); color: var(--accent); }
  .add button.hot { color: var(--accent-ink); border-color: var(--accent); background: var(--accent); }
  .name { flex: 1; min-width: 0; background: none; border: 0; text-align: left; cursor: pointer; padding: 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; justify-content: space-between; gap: 6px; }
  div.item > .name { padding-left: 2px; }
  section > ul > li > div.item { padding-left: 8px; }
  .name small, .found small { color: var(--muted); }
  .imp { color: var(--muted); font-size: 11px; margin-left: 4px; }
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
</style>
