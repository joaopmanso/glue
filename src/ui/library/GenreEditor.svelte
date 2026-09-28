<script lang="ts">
  /* Pick a song's genre (the user's list, 2026-09-28): one of the collection's, the ones added before,
     or a common one; type to find, Enter on a new name adds it. For several songs, the one picked goes
     on all of them. Written into the files through song info (ADR 0071). */
  import { lib } from '../../lib/library.svelte';
  import { phone } from '../../lib/phone.svelte';
  import { view } from '../../lib/view.svelte';
  import { allGenres, setGenre } from '../../lib/genres.svelte';
  import { cleanTag } from '../../core/library/tagging';
  import type { Track } from '../../store/types';

  const W = 280;
  const at = $derived(view.genreFor);
  let q = $state('');
  let forKey = '';
  $effect(() => { const k = at ? at.ids.join(',') : ''; if (k !== forKey) { forKey = k; q = ''; } });
  const tracks = $derived.by(() => { void lib.version; return (at?.ids ?? []).map(id => lib.store?.tracks.get(id)).filter((t): t is Track => !!t && !t.remote); });
  const current = $derived.by(() => { const gs = new Set(tracks.map(t => (t.genre ?? '').trim().toLowerCase())); return gs.size === 1 ? [...gs][0] : null; });
  const genres = $derived(allGenres());
  const offered = $derived.by(() => { const w = q.trim().toLowerCase(); return w ? genres.filter(g => g.name.toLowerCase().includes(w)) : genres; });
  const typed = $derived(cleanTag(q));
  const isNew = $derived(!!typed && !genres.some(g => g.name.toLowerCase() === typed.toLowerCase()));

  function pick(name: string) { if (!at) return; setGenre(at.ids, name); close(); }
  function close() { view.genreFor = null; }
  let winH = $state(window.innerHeight), winW = $state(window.innerWidth);
  const pos = $derived.by(() => {
    if (!at) return null;
    // A phone: a sheet from the bottom, the width of the screen (ADR 0078).
    if (phone.active) { const w = Math.min(winW, 640); return { left: Math.round((winW - w) / 2), top: null, bottom: 0, max: Math.round(winH * .72), w }; }
    const below = winH - at.y - 14, above = at.y - 40, up = below < 300 && above > below;
    return { left: Math.max(8, Math.min(winW - W - 8, at.x)), top: up ? null : at.y + 6, bottom: up ? winH - at.y + 34 : null, max: Math.max(200, Math.min(460, up ? above : below)) };
  });
  // Not on a phone: its keyboard would cover the list.
  const focus = (el: HTMLInputElement) => { if (!phone.active) el.focus({ preventScroll: true }); };
</script>

<svelte:window bind:innerHeight={winH} bind:innerWidth={winW} onpointerdown={e => { if (at && !(e.target as HTMLElement).closest('.gened, [data-genre-open]')) close(); }} />

{#if at && pos && tracks.length}
  {#if phone.active}<div class="scrim" aria-hidden="true"></div>{/if}
  <div class="gened" id="genre-editor" role="dialog" aria-label="Genre" style:left={pos.left + 'px'} style:top={pos.top == null ? null : pos.top + 'px'} style:bottom={pos.bottom == null ? null : pos.bottom + 'px'} style:max-height={pos.max + 'px'} style:width={('w' in pos ? pos.w : W) + 'px'} class:sheet={phone.active}>
    <div class="head"><b>Genre · {tracks.length === 1 ? tracks[0].title || tracks[0].fileName : tracks.length + ' songs'}</b><button type="button" aria-label="Close" onclick={close}>×</button></div>
    <input use:focus id="genre-input" placeholder="Find or add a genre… (Enter)" bind:value={q} autocomplete="off" maxlength="40"
      onkeydown={e => {
        if (e.key === 'Enter') { e.preventDefault(); if (typed) pick(offered.find(g => g.name.toLowerCase() === typed.toLowerCase())?.name ?? (isNew ? typed : offered[0]?.name ?? typed)); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
      }}>
    <div class="list">
      {#if isNew}<button type="button" class="make" id="genre-new" onclick={() => pick(typed)}>+ New genre “{typed}”</button>{/if}
      {#if current}<button type="button" class="opt none" id="genre-clear" onclick={() => pick('')}>No genre</button>{/if}
      {#each offered as g (g.name)}
        <button type="button" class="opt" class:on={current === g.name.toLowerCase()} class:preset={!g.mine} data-genre={g.name} onclick={() => pick(g.name)}>
          <span>{g.name}</span><small>{g.tracks || ''}</small>
        </button>
      {/each}
    </div>
    <p class="foot">{current === null && tracks.length > 1 ? 'They have different genres: the one you pick goes on all of them.' : 'The collection’s genres first, then common ones. Written into the files by GLUE Home.'}</p>
  </div>
{/if}

<style>
  .gened { position: fixed; z-index: 70; background: var(--raised); border: 1px solid var(--line-2); border-radius: 8px; padding: 10px; box-shadow: 0 12px 32px rgb(0 0 0 / .5); display: flex; flex-direction: column; gap: 8px; overflow: hidden; box-sizing: border-box; }
  .gened > * { flex: none; }
  .head { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 13px; }
  .head b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head button { background: none; border: 0; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; }
  input { width: 100%; box-sizing: border-box; background: var(--surface); border: 1px solid var(--line-2); border-radius: 5px; padding: 6px 8px; font-size: 13px; color: var(--ink); }
  input:focus { outline: none; border-color: var(--accent); }
  .gened > .list { display: grid; align-content: start; gap: 1px; flex: 1 1 auto; min-height: 60px; overflow-y: auto; }
  .opt { display: flex; align-items: center; gap: 8px; background: none; border: 0; border-radius: 4px; padding: 4px 6px; color: var(--ink); font-size: 13px; text-align: left; cursor: pointer; }
  .opt:hover { background: var(--surface); }
  .opt.on { background: color-mix(in srgb, var(--accent) 18%, transparent); font-weight: 650; }
  .opt.preset span { color: var(--ink-2); }
  .opt.none { color: var(--muted); font-style: italic; }
  .opt span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .opt small { color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
  .make { text-align: left; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent); border-radius: 4px; color: var(--accent); padding: 4px 8px; font-size: 13px; cursor: pointer; }
  .foot { color: var(--muted); font-size: 11.5px; margin: 0; }
  /* A phone: a sheet from the bottom, with room for fingers. */
  .scrim { position: fixed; inset: 0; z-index: 69; background: rgb(0 0 0 / .45); }
  .gened.sheet { border-radius: 16px 16px 0 0; border-width: 1px 0 0; padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px)); gap: 12px; }
  .sheet .head { font-size: 15px; } .sheet .head button { font-size: 26px; width: 40px; height: 36px; }
  .sheet input { font-size: 16px; padding: 10px 12px; border-radius: 10px; }
  .sheet .opt { font-size: 16px; padding: 11px 6px; }
  .sheet .make { font-size: 15px; padding: 10px; }
</style>
