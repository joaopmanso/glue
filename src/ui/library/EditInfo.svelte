<script lang="ts">
  /* Edit songs' info (ADR 0071): one song, or several at once, where fields that differ show "(mixed)"
     and only the fields changed are applied. Kept in GLUE at once; GLUE Home writes them into the files
     of this computer's music folders (now, or when it next runs). */
  import { lib } from '../../lib/library.svelte';
  import { view } from '../../lib/view.svelte';
  import { INFO_FIELDS, type InfoField } from '../../core/library/tags';
  import type { Track } from '../../store/types';

  const NAMES: Record<InfoField, string> = { title: 'Title', artist: 'Artist', album: 'Album', genre: 'Genre', label: 'Label', year: 'Year', grouping: 'Grouping', comment: 'Comment' };
  const ORDER: InfoField[] = ['title', 'artist', 'album', 'genre', 'label', 'year', 'grouping', 'comment'];

  const want = view.infoFor!;
  const tracks = want.ids.map(id => lib.store?.tracks.get(id)).filter((t): t is Track => !!t && lib.canEditInfo(t));
  const one = tracks.length === 1 ? tracks[0] : null;
  const mixed = Object.fromEntries(INFO_FIELDS.map(k => [k, tracks.some(t => (t[k] ?? '') !== (tracks[0]?.[k] ?? ''))])) as Record<InfoField, boolean>;
  const start = Object.fromEntries(INFO_FIELDS.map(k => [k, mixed[k] ? '' : tracks[0]?.[k] ?? ''])) as Record<InfoField, string>;
  let values = $state({ ...start });
  const changed = $derived(INFO_FIELDS.filter(k => values[k].trim() !== start[k].trim() && !(k === 'title' && !values[k].trim())));

  // Where the edits go: this computer's music folders get them in the files, through GLUE Home.
  const inFiles = tracks.filter(t => t.rootId && t.relPath && !t.fileKey).length;
  const note = !inFiles ? (one ? 'This song’s file isn’t in one of this computer’s music folders: the change stays in GLUE.' : 'None of these files are in this computer’s music folders: the changes stay in GLUE.')
    : (inFiles < tracks.length ? inFiles + ' of these ' + tracks.length + ' files are in this computer’s music folders. ' : '')
      + (lib.onHome ? 'GLUE Home writes the changes into ' + (one ? 'the file' : 'the files') + ' now.' : 'GLUE Home isn’t running: GLUE keeps the changes, and GLUE Home writes them into ' + (one ? 'the file' : 'the files') + ' when it next runs.');

  // Suggestions from the collection, for the fields that repeat.
  const suggest = (k: InfoField) => { const s = new Set<string>(); for (const t of lib.store?.tracks.values() ?? []) { const v = t[k]; if (v) s.add(v); if (s.size > 400) break; } return [...s].sort((a, b) => a.localeCompare(b)); };
  const lists = { genre: suggest('genre'), label: suggest('label'), artist: suggest('artist') };

  function close() { view.infoFor = null; }
  function save() {
    if (changed.length) lib.editInfo(tracks.map(t => t.id), Object.fromEntries(changed.map(k => [k, values[k]])));
    close();
  }
  const focus = (el: HTMLInputElement, k: InfoField) => { if (k === (want.field ?? 'title')) queueMicrotask(() => { el.focus(); el.select(); }); };
</script>

<div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget) close(); }}>
  <div class="dlg" id="edit-info" role="dialog" aria-modal="true" aria-labelledby="info-h" tabindex="-1" onkeydown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
  <form onsubmit={e => { e.preventDefault(); save(); }}>
    <h2 id="info-h">{one ? 'Edit song info' : 'Edit the info of ' + tracks.length + ' songs'}</h2>
    {#if one}<p class="file" title={one.relPath ?? one.importPath ?? one.fileName}>{one.relPath ?? one.importPath ?? one.fileName}</p>{/if}
    <div class="grid">
      {#each ORDER as k (k)}
        <label class:wide={k === 'comment' || k === 'title'} class:half={k === 'year' || k === 'grouping'}>
          <span>{NAMES[k]}{#if changed.includes(k)}<i title="Changed">•</i>{/if}</span>
          <input name={k} data-f={k} use:focus={k} bind:value={values[k]} placeholder={mixed[k] ? '(mixed)' : ''} autocomplete="off" spellcheck="false"
            list={k === 'genre' || k === 'label' || k === 'artist' ? 'info-' + k : undefined} inputmode={k === 'year' ? 'numeric' : undefined} />
        </label>
      {/each}
    </div>
    {#each ['genre', 'label', 'artist'] as const as k (k)}<datalist id={'info-' + k}>{#each lists[k] as v (v)}<option value={v}></option>{/each}</datalist>{/each}
    <p class="fine" id="info-where">{note}</p>
    <div class="acts">
      <button type="button" class="btn-ghost" onclick={close}>Cancel</button>
      <button type="submit" class="btn" id="info-save" disabled={!changed.length}>{changed.length && !one ? 'Change ' + changed.length + ' field' + (changed.length === 1 ? '' : 's') : 'Save'}</button>
    </div>
  </form>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; }
  .dlg { width: min(620px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 20px 22px; display: grid; gap: 12px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); }
  form { display: grid; gap: 12px; }
  h2 { font-size: 20px; margin: 0; }
  .file { margin: -6px 0 0; color: var(--muted); font: 12px var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 12px; }
  label { grid-column: span 2; display: grid; gap: 4px; min-width: 0; }
  label.wide { grid-column: 1 / -1; }
  label.half { grid-column: span 2; }
  label span { font-size: 12px; color: var(--ink-2); display: flex; gap: 6px; }
  label i { color: var(--accent); font-style: normal; }
  input { width: 100%; background: var(--ground); border: 1px solid var(--line-2); border-radius: 6px; padding: 7px 9px; font: 13.5px var(--font-sans); color: var(--ink); }
  input:focus { outline: none; border-color: var(--accent); }
  input::placeholder { color: var(--muted); font-style: italic; }
  .fine { color: var(--muted); font-size: 12.5px; margin: 0; }
  .acts { display: flex; gap: 8px; justify-content: flex-end; }
  @media (max-width: 520px) { label, label.half { grid-column: 1 / -1; } }
</style>
