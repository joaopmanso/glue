<script lang="ts">
  /* Changes that clashed with another device's (ADR 0095): both values, and the answer. Until it's
     given, the other device's value is the one in place (this device's is kept here, nothing is lost). */
  import { shared } from '../../lib/shared.svelte';
  import { lib } from '../../lib/library.svelte';
  import { account } from '../../lib/account.svelte';
  import { mergeBoth, type Clash } from '../../core/shared/merge3';

  let open = $state(true);
  let busy = $state(false);
  const FIELD: Record<string, string> = {
    title: 'title', artist: 'artist', album: 'album', genre: 'genre', label: 'label', year: 'year', comment: 'comment',
    grouping: 'grouping', rating: 'rating', notes: 'notes', tags: 'tags', name: 'name', items: 'songs', color: 'colour',
    parentId: 'folder',
  };
  function what(c: Clash): string {
    const parts = c.at ? c.at.split('.') : [], s = lib.store;
    if (c.file.startsWith('tracks/') && parts[0] === 'items') {
      const t = s?.tracks.get(parts[1]);
      return '“' + (t?.title || t?.fileName || 'A song') + '”' + (parts[2] ? ', ' + (FIELD[parts[2]] ?? parts.slice(2).join(' ')) : '');
    }
    if (c.file.startsWith('lists/')) {
      const l = s?.lists.get(c.file.slice(6, -5));
      return 'Playlist “' + (l?.name ?? '…') + '”' + (parts[0] ? ', ' + (FIELD[parts[0]] ?? parts[0]) : '');
    }
    if (c.file === 'collection.json') return 'The collection' + (parts[0] ? ', ' + (FIELD[parts[0]] ?? parts[0]) : '');
    return c.file;
  }
  const show = (v: unknown) => v === undefined || v === null ? '(deleted)' : Array.isArray(v) ? v.length + ' item' + (v.length === 1 ? '' : 's')
    : typeof v === 'object' ? '(changed)' : String(v) || '(empty)';
  const who = (c: Clash) => account.devices.find(d => d.id === c.by)?.name ?? 'another device';
  const when = (c: Clash) => c.when ? new Date(c.when).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
  async function answer(cs: Clash[], how: 'mine' | 'theirs' | 'both') {
    busy = true;
    try { await shared.resolve(cs, how); } finally { busy = false; }
  }
</script>

{#if shared.clashes.length}
  <aside class="clashes" id="clashes" aria-live="polite">
    <button type="button" class="head" onclick={() => (open = !open)} aria-expanded={open}>
      <b>{shared.clashes.length} change{shared.clashes.length === 1 ? '' : 's'} clash{shared.clashes.length === 1 ? 'es' : ''} with {who(shared.clashes[0])}</b>
      <span aria-hidden="true">{open ? '▾' : '▸'}</span>
    </button>
    {#if open}
      <ul>
        {#each shared.clashes as c (c.file + ':' + c.at)}
          <li data-clash={c.file + ':' + c.at}>
            <p class="w">{what(c)}</p>
            <p class="v">
              <span>Here: <b>{show(c.local)}</b></span>
              <span>{who(c)}{when(c) ? ' (' + when(c) + ')' : ''}: <b>{show(c.remote)}</b></span>
            </p>
            <p class="acts">
              <button type="button" class="mini" data-keep="mine" disabled={busy} onclick={() => void answer([c], 'mine')}>Keep this device’s</button>
              <button type="button" class="mini" data-keep="theirs" disabled={busy} onclick={() => void answer([c], 'theirs')}>Take {who(c)}’s</button>
              {#if mergeBoth(c.local, c.remote) !== undefined}
                <button type="button" class="mini" data-keep="both" disabled={busy} onclick={() => void answer([c], 'both')}>Merge both</button>
              {/if}
            </p>
          </li>
        {/each}
      </ul>
      {#if shared.clashes.length > 1}
        <p class="all">For all:
          <button type="button" class="link" data-all="mine" disabled={busy} onclick={() => void answer(shared.clashes, 'mine')}>this device’s</button> ·
          <button type="button" class="link" data-all="theirs" disabled={busy} onclick={() => void answer(shared.clashes, 'theirs')}>the other device’s</button>
        </p>
      {/if}
    {/if}
  </aside>
{/if}

<style>
  .clashes {
    position: fixed; right: 16px; bottom: 80px; z-index: 55; width: min(380px, calc(100vw - 32px)); max-height: 60vh; overflow-y: auto;
    background: var(--surface); border: 1px solid color-mix(in srgb, var(--warn) 60%, var(--line)); border-radius: 10px;
    box-shadow: 0 16px 40px rgb(0 0 0 / .45); font-size: 13px;
  }
  .head {
    display: flex; justify-content: space-between; gap: 8px; width: 100%; padding: 10px 12px; border: 0; cursor: pointer;
    background: color-mix(in srgb, var(--warn) 10%, var(--surface)); color: inherit; text-align: left; font: inherit;
  }
  ul { list-style: none; margin: 0; padding: 4px 12px; display: grid; gap: 10px; }
  li { border-top: 1px solid var(--line); padding-top: 8px; display: grid; gap: 4px; }
  li:first-child { border-top: 0; }
  .w { margin: 0; font-weight: 550; }
  .v { margin: 0; display: grid; gap: 2px; color: var(--muted); }
  .v b { color: var(--ink); font-weight: 500; }
  .acts { margin: 2px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .all { margin: 0; padding: 6px 12px 10px; color: var(--muted); }
  .mini { background: none; border: 1px solid var(--line); border-radius: 4px; color: var(--ink); font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; }
  button:disabled { opacity: .5; cursor: default; }
</style>
