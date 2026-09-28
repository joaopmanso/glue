<script lang="ts">
  /* A menu as a sheet from the bottom (the phone layout, ADR 0078): the same entries as the desktop's
     right-click menus (lib/menu); a submenu opens in place, with a way back; long ones get a find field. */
  import { untrack } from 'svelte';
  import { phone } from '../../lib/phone.svelte';
  import { isAction, type MenuAction, type MenuEntry } from '../../lib/menu.svelte';
  import Stars from '../library/Stars.svelte';

  type Panel = { title: string; entries: MenuEntry[]; find?: string };
  // Keyboard shortcuts mean nothing on a phone; counts and arrows stay.
  const KEYS = /^(Space|Enter|Esc|Tab|Backspace|Del(ete)?|F\d{1,2}|(Ctrl|Shift|Alt)\b.*|[⌘⇧⌥].*)$/;
  let panels = $state.raw<Panel[]>([]);
  let q = $state('');
  let loading = $state(false);
  // The sheet's title already names the song: a first heading saying the same goes.
  const built = (s: { title: string; build: () => MenuEntry[] }) => { const es = s.build(), h = es[0]; return h && 'head' in h && h.head.toLowerCase() === s.title.toLowerCase() ? es.slice(1) : es; };
  // Built once when it opens: a change in the library (an analysis landing) mustn't reset it under a finger.
  $effect(() => { const s = phone.sheet; untrack(() => { panels = s ? [{ title: s.title, entries: built(s) }] : []; q = ''; }); });
  const cur = $derived(panels[panels.length - 1] ?? null);
  const shown = $derived.by(() => {
    if (!cur) return [];
    const w = q.trim().toLowerCase();
    return w ? cur.entries.filter(e => isAction(e) && e.label.toLowerCase().includes(w)) : cur.entries;
  });

  function close() { phone.sheet = null; }
  async function choose(e: MenuAction) {
    if (e.disabled) return;
    if (e.sub) {
      loading = true;
      try { const entries = await e.sub(); panels = [...panels, { title: e.label, entries, find: entries.length > 8 ? e.find ?? 'Find…' : undefined }]; q = ''; }
      finally { loading = false; }
      return;
    }
    if (e.stay) { e.run?.(); const s = phone.sheet; if (s && panels.length === 1) panels = [{ title: s.title, entries: built(s) }]; return; }
    close();
    e.run?.();
  }
</script>

{#if cur}
  <div class="scrim" role="presentation" onclick={close}></div>
  <div class="sheet" id="phone-sheet" role="dialog" aria-modal="true" aria-label={cur.title}>
    <div class="grab" aria-hidden="true"></div>
    <header>
      {#if panels.length > 1}<button type="button" class="back" aria-label="Back" onclick={() => { panels = panels.slice(0, -1); q = ''; }}>‹</button>{/if}
      <b>{cur.title}</b>
      <button type="button" class="x" aria-label="Close" onclick={close}>×</button>
    </header>
    {#if cur.find}<input type="search" class="find" placeholder={cur.find} bind:value={q} autocomplete="off" />{/if}
    <div class="items">
      {#each shown as e, i (i)}
        {#if 'sep' in e}<hr />
        {:else if 'head' in e}<p class="head">{e.head}</p>
        {:else if 'stars' in e}<div class="stars"><span>Rating</span><Stars value={e.stars} dim={e.dim} size={26} onset={v => { e.pick(v); close(); }} /></div>
        {:else if 'colors' in e}
          <div class="colors">
            <button type="button" class="sw none" class:on={!e.value} aria-label="No colour" onclick={() => { e.pick(null); close(); }}>∅</button>
            {#each e.colors as c (c)}<button type="button" class="sw" class:on={e.value === c} style:background={c} aria-label="Colour" onclick={() => { e.pick(c); close(); }}></button>{/each}
          </div>
        {:else}
          <button type="button" class="item" class:danger={e.danger} class:checked={e.checked} disabled={e.disabled || loading} style:padding-left={e.depth ? 16 + e.depth * 14 + 'px' : null} {...e.attrs} onclick={() => choose(e)}>
            {#if e.color}<i class="dot" style:background={e.color}></i>{/if}
            <span class="lab">{e.label}{#if e.detail && q}<small>{e.detail}</small>{/if}</span>
            {#if e.checked}<span class="tick">✓</span>{/if}
            {#if e.hint && !KEYS.test(e.hint)}<span class="hint">{e.hint}</span>{/if}
            {#if e.sub}<span class="more">›</span>{/if}
          </button>
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 80; background: rgb(0 0 0 / .45); }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 81; max-width: 640px; margin: 0 auto; max-height: 82dvh; display: flex; flex-direction: column; background: var(--surface); border-radius: 16px 16px 0 0; border-top: 1px solid var(--line-2); box-shadow: 0 -12px 40px rgb(0 0 0 / .45); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .grab { width: 40px; height: 4px; border-radius: 2px; background: var(--line-2); margin: 8px auto 2px; flex: none; }
  header { display: flex; align-items: center; gap: 8px; padding: 6px 12px 8px 16px; border-bottom: 1px solid var(--line); flex: none; }
  header b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
  header button { background: none; border: 0; color: var(--ink-2); font-size: 26px; line-height: 1; width: 40px; height: 40px; cursor: pointer; }
  .find { margin: 10px 14px 4px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--ground); color: var(--ink); font-size: 16px; flex: none; }
  .items { overflow-y: auto; padding: 4px 0 10px; -webkit-overflow-scrolling: touch; }
  .item { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 50px; padding: 0 18px; background: none; border: 0; color: var(--ink); font-size: 16px; text-align: left; cursor: pointer; }
  .item:active { background: var(--raised); }
  .item:disabled { color: var(--muted); }
  .item.danger { color: var(--bad); }
  .lab { flex: 1; min-width: 0; display: grid; }
  .lab small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hint { color: var(--muted); font: 12px var(--font-mono); }
  .tick { color: var(--accent); font-weight: 700; }
  .more { color: var(--muted); font-size: 22px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 4px 0; }
  .head { margin: 10px 18px 2px; font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .stars { display: flex; align-items: center; justify-content: space-between; padding: 8px 18px; color: var(--ink-2); font-size: 14px; }
  .colors { display: flex; gap: 12px; padding: 10px 18px; flex-wrap: wrap; }
  .sw { width: 30px; height: 30px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
  .sw.on { border-color: var(--ink); }
  .sw.none { background: var(--raised); color: var(--muted); }
</style>
