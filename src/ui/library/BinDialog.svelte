<script lang="ts">
  /* Recently deleted playlists and folders (ADR 0090): whatever deleted them (you, another device, a DJ
     library that changed), kept 30 days; Restore puts one back with everything that was in it. */
  import { lib } from '../../lib/library.svelte';
  import { view } from '../../lib/view.svelte';
  import type { BinEntry } from '../../store/collection';

  let entries = $state<BinEntry[] | null>(null);
  let busy = $state('');
  async function load() { entries = (await lib.store?.binEntries().catch(() => [])) ?? []; }
  void load();
  function close() { view.binOpen = false; }
  async function restore(e: BinEntry) {
    busy = e.name;
    try {
      const n = await lib.store!.restoreFromBin(e.name);
      lib.notice = 'Restored “' + e.lists[0].name + '”' + (n > 1 ? ' and ' + (n - 1) + ' inside it' : '') + '.';
      await load();
    } catch (err) { lib.notice = 'Couldn’t restore it: ' + (err as Error).message; }
    finally { busy = ''; }
  }
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const inside = (e: BinEntry) => { const songs = e.lists.reduce((a, l) => a + l.items.length, 0); return (e.lists.length > 1 ? e.lists.length - 1 + ' inside · ' : '') + songs + ' song' + (songs === 1 ? '' : 's'); };
</script>

<div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget) close(); }}>
  <div class="dlg" id="bin" role="dialog" aria-modal="true" aria-labelledby="bin-h" tabindex="-1" onkeydown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
    <h2 id="bin-h">Recently deleted</h2>
    <p class="fine">Playlists and folders deleted in the last 30 days, here or on your other devices.</p>
    {#if entries === null}<p class="fine">Looking…</p>
    {:else if !entries.length}<p class="fine" id="bin-empty">Nothing deleted lately.</p>
    {:else}
      <ul>
        {#each entries as e (e.name)}
          <li data-bin={e.lists[0].id}>
            <span class="what"><b>{e.lists[0].name || 'Untitled'}</b><small>{e.lists[0].kind === 'folder' ? 'Folder' : 'Playlist'} · {inside(e)} · deleted {when(e.deletedAt)}</small></span>
            <button type="button" class="btn" disabled={!!busy} onclick={() => void restore(e)}>{busy === e.name ? 'Restoring…' : 'Restore'}</button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="acts"><button type="button" class="btn" onclick={close}>Close</button></div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; }
  .dlg { width: min(560px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 20px 22px; display: grid; gap: 12px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); }
  h2 { margin: 0; font-size: 18px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  li { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
  .what { flex: 1; min-width: 0; display: grid; }
  .what b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .what small { color: var(--muted); font-size: 12px; }
  .acts { display: flex; justify-content: flex-end; }
</style>
