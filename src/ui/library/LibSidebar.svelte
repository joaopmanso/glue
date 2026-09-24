<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import { view, type ViewSel } from '../../lib/view.svelte';
  import { importFiles, importFound, pickSeratoFolder } from '../../lib/importActions';
  import { IMPORT_ACCEPT } from '../../lib/imports';
  import { canKeepFiles, canPickFolders, pickAudioFiles } from '../../platform';
  import { LOOSE } from '../../store/merge';
  import type { List } from '../../store/types';

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
  const loose = $derived.by(() => { void lib.version; let n = 0; for (const t of lib.store?.tracks.values() ?? []) if (t.fileKey) n++; return n; });
  let songInput: HTMLInputElement;
  async function addSongs() {
    if (!canKeepFiles()) { songInput.click(); return; }
    try { await lib.addFiles(await pickAudioFiles()); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') lib.notice = (e as Error).message; }
  }
  const sources = $derived.by(() => { void lib.version; return [...(lib.store?.sources.values() ?? [])]; });

  let editing = $state<string | null>(null);
  let dropTarget = $state<string | null>(null);
  let open = $state<Record<string, boolean>>({});
  let fileInput: HTMLInputElement;
  let pathEdit = $state<string | null>(null);

  const isSel = (s: ViewSel) => JSON.stringify(s) === JSON.stringify(view.sel);
  const TRACKS = 'application/x-mco-tracks', LIST = 'application/x-mco-list';

  function newList(kind: 'folder' | 'playlist', parentId: string | null = null) {
    const l = lib.createList(kind, '', parentId);
    if (!l) return;
    if (parentId) open[parentId] = true;
    editing = l.id;
    if (kind === 'playlist') view.select({ kind: 'list', id: l.id });
  }
  function onDragOver(e: DragEvent, l: List | null) {
    const types = [...(e.dataTransfer?.types ?? [])];
    const ok = types.includes(TRACKS) ? l?.kind === 'playlist' : types.includes(LIST) ? !l || l.kind === 'folder' : false;
    if (!ok) return;
    e.preventDefault(); e.stopPropagation();
    dropTarget = l?.id ?? 'top';
  }
  function onDrop(e: DragEvent, l: List | null) {
    const dt = e.dataTransfer;
    dropTarget = null;
    if (!dt) return;
    e.preventDefault(); e.stopPropagation();
    const ids = dt.getData(TRACKS), listId = dt.getData(LIST);
    if (ids && l) {
      const n = lib.addToList(l.id, JSON.parse(ids));
      lib.notice = n ? 'Added ' + n + ' track' + (n === 1 ? '' : 's') + ' to ' + l.name + '.' : 'Already in ' + l.name + '.';
    } else if (listId && listId !== l?.id) lib.moveList(listId, l?.id ?? null);
  }
  function rename(l: List, name: string) { editing = null; if (name.trim() && name.trim() !== l.name) lib.updateList(l.id, { name: name.trim() }); }
  function remove(l: List) {
    const what = l.kind === 'folder' ? 'the folder “' + l.name + '” and everything in it' : 'the playlist “' + l.name + '”';
    if (confirm('Delete ' + what + '? The tracks stay in your collection.')) { lib.deleteList(l.id); if (isSel({ kind: 'list', id: l.id })) view.select({ kind: 'all' }); }
  }
  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };
</script>

{#snippet node(l: List, depth: number)}
  {@const kids = l.kind === 'folder' ? lib.childLists(l.id) : []}
  <li>
    <div class="item" class:sel={isSel({ kind: 'list', id: l.id })} class:drop={dropTarget === l.id} style:padding-left={8 + depth * 14 + 'px'}
      draggable={editing !== l.id} role="treeitem" aria-selected={isSel({ kind: 'list', id: l.id })} aria-expanded={l.kind === 'folder' ? !!open[l.id] : undefined} tabindex="-1"
      ondragstart={e => { e.dataTransfer?.setData(LIST, l.id); }}
      ondragover={e => onDragOver(e, l)} ondragleave={() => { if (dropTarget === l.id) dropTarget = null; }} ondrop={e => onDrop(e, l)}>
      {#if l.kind === 'folder'}
        <button type="button" class="twist" aria-label={open[l.id] ? 'Collapse' : 'Expand'} onclick={() => (open[l.id] = !open[l.id])}>{open[l.id] ? '▾' : '▸'}</button>
      {:else}<span class="twist">♪</span>{/if}
      {#if editing === l.id}
        <input class="rename" value={l.name} use:focus onblur={e => rename(l, e.currentTarget.value)}
          onkeydown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') editing = null; }}>
      {:else}
        <button type="button" class="name" onclick={() => { view.select({ kind: 'list', id: l.id }); if (l.kind === 'folder') open[l.id] = true; }} ondblclick={() => (editing = l.id)}>
          {l.name}{#if l.origin}<span class="imp" title="Imported; refreshed when you import the library again">↓</span>{/if}
        </button>
        <span class="n">{l.kind === 'playlist' ? l.items.length : ''}</span>
        <span class="tools">
          {#if l.kind === 'folder'}<button type="button" title="New playlist in this folder" onclick={() => newList('playlist', l.id)}>+</button>{/if}
          <button type="button" title="Rename" onclick={() => (editing = l.id)}>✎</button>
          <button type="button" title="Delete" onclick={() => remove(l)}>×</button>
        </span>
      {/if}
    </div>
    {#if kids.length && open[l.id]}
      <ul role="group">{#each kids as k (k.id)}{@render node(k, depth + 1)}{/each}</ul>
    {/if}
  </li>
{/snippet}

<nav class="lside" aria-label="Library">
  <section>
    <h3 class="label">Library</h3>
    <ul>
      {#each [['all', 'All tracks', counts.all], ['recent', 'Recently added', null], ['attention', 'Needs attention', counts.attention], ['pending', 'Not analysed yet', counts.pending], ['unlinked', 'No file linked', counts.unlinked]] as [k, label, n] (k)}
        <li><button type="button" class="item name" class:sel={isSel({ kind: k } as ViewSel)} onclick={() => view.select({ kind: k } as ViewSel)}>{label}<span class="n">{n ?? ''}</span></button></li>
      {/each}
    </ul>
  </section>

  <section>
    <div class="head">
      <h3 class="label">Playlists</h3>
      <span class="add">
        <button type="button" id="new-playlist" title="New playlist" onclick={() => newList('playlist')}>+ Playlist</button>
        <button type="button" title="New folder" onclick={() => newList('folder')}>+ Folder</button>
      </span>
    </div>
    <ul class="tree" role="tree" class:drop={dropTarget === 'top'} ondragover={e => onDragOver(e, null)} ondrop={e => onDrop(e, null)} ondragleave={() => { if (dropTarget === 'top') dropTarget = null; }}>
      {#each top as l (l.id)}{@render node(l, 0)}{/each}
      {#if !top.length}<li class="empty">No playlists yet. Create one, or import a DJ library.</li>{/if}
    </ul>
  </section>

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
            {#if !r.granted}<button type="button" class="reconnect" onclick={() => lib.reconnectFolder(r.root.id)}>Allow</button>{/if}
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
      {#if !lib.roots.length && !loose}<li class="empty">{canPickFolders() ? 'Add the folders your music lives in, or single songs (or drop them here). MCO only reads them.' : 'Add songs, or drop them onto MCO: they’re copied into MCO’s storage. Linking whole folders needs Chrome or Edge.'}</li>{/if}
    </ul>
  </section>

  <section>
    <div class="head">
      <h3 class="label">Imported libraries</h3>
      <span class="add"><button type="button" id="import-lib" onclick={() => fileInput.click()} title="rekordbox XML, Engine DJ m.db, Traktor NML, iTunes / Apple Music XML, M3U">+ Import</button></span>
    </div>
    <input type="file" multiple accept={IMPORT_ACCEPT} bind:this={fileInput} hidden id="import-input"
      onchange={e => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void importFiles(f); }}>
    <ul>
      {#each sources as s (s.id)}
        <li>
          <div class="item" class:sel={isSel({ kind: 'source', id: s.id })}>
            <button type="button" class="name" onclick={() => view.select({ kind: 'source', id: s.id })} title={'Imported ' + new Date(s.importedAt).toLocaleString() + ' from ' + s.fileName}>{APP_NAMES[s.app] ?? s.app}<small> {s.fileName}</small></button>
            <span class="n">{s.tracks.length}</span>
            <span class="tools"><button type="button" title="Remove this import" onclick={() => { if (confirm('Remove the ' + (APP_NAMES[s.app] ?? s.app) + ' import and its playlists? Tracks with a linked file stay.')) lib.deleteSource(s.id); }}>×</button></span>
          </div>
        </li>
      {/each}
      {#each lib.found.filter(f => !sources.some(s => s.app === f.kind)) as f (f.rootId + f.relPath)}
        <li class="found"><span>Found: {FOUND_NAMES[f.kind]}<small> {f.relPath}</small></span><button type="button" onclick={() => importFound(f)}>Import</button></li>
      {/each}
    </ul>
    <p class="hint">
      rekordbox: File › Export Collection in xml format. Engine DJ: Music/Engine Library/Database2/m.db.
      Serato: <button type="button" class="inline" onclick={pickSeratoFolder}>choose the _Serato_ folder</button>.
      Traktor: collection.nml. Apple Music: File › Library › Export Library.
    </p>
  </section>
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
  .item.drop, .tree.drop { outline: 1px dashed var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
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
  .found { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 4px 8px; background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 4px; font-size: 12.5px; }
  .inline { background: none; border: 0; padding: 0; color: var(--accent); text-decoration: underline; cursor: pointer; font-size: inherit; }
</style>
