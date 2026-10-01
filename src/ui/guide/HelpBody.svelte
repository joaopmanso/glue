<script lang="ts">
  /* The help centre (ADR 0126): search, the articles, one article with "Show me" (its tour). In Gluey's panel and on
     the #/help page alike. */
  import { ARTICLES, articleById } from '../../lib/help';
  import { renderMarkdown, searchArticles } from '../../core/guide/markdown';
  import { tourById } from '../../core/guide/tours';
  import { guide } from '../../lib/guide.svelte';
  import { lib } from '../../lib/library.svelte';
  import { phone } from '../../lib/phone.svelte';
  import { router } from '../../lib/route.svelte';

  let { open = $bindable(null), page = false }: { open?: string | null; page?: boolean } = $props();
  let q = $state('');
  const found = $derived(searchArticles(ARTICLES, q));
  const art = $derived(articleById(open));
  const tour = $derived(art?.tour ? tourById(art.tour) : null);
  // Tours run in the library (and the desktop's tours on the desktop).
  const tourId = $derived(tour ? (tour.id === 'welcome' && phone.active ? 'welcome-phone' : tour.id) : null);
  // Feature tours are the desktop's; a phone has its own first tour.
  const canShow = $derived(!!tourId && lib.phase === 'library' && !!lib.store && (!phone.active || tourId === 'welcome-phone'));
  function show() {
    const id = tourId;
    if (!id) return;
    if (page) { router.go('#/'); setTimeout(() => guide.start(id), 400); } else guide.start(id);
  }
  // Links between articles (#/help/<id>) open them here, in the panel too.
  function click(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a');
    const m = a?.getAttribute('href')?.match(/^#\/help\/([\w-]+)$/);
    if (!m || page) return;
    e.preventDefault(); open = m[1];
  }
</script>

<div class="help" class:page>
  {#if art}
    <article id="help-article" data-article={art.id}>
      <button type="button" class="back" id="help-back" onclick={() => { if (page) router.go('#/help'); else open = null; }}>← All help</button>
      <h1>{art.title}</h1>
      {#if tour}
        <p class="showme">
          <button type="button" class="gb" id="help-show" disabled={!canShow} onclick={show}>Show me</button>
          {#if !canShow}<small>{lib.phase === 'library' ? 'Shown on a computer.' : 'Shown once your library is set up.'}</small>{/if}
        </p>
      {/if}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="md" onclick={click}>{@html renderMarkdown(art.body)}</div>
    </article>
  {:else}
    <input type="search" id="help-search" placeholder="Search help: duplicates, GLUE Home, cues…" bind:value={q} autocomplete="off" spellcheck="false" />
    <ul class="list" id="help-list">
      {#each found as a (a.id)}
        <li><a href={'#/help/' + a.id} data-article={a.id} onclick={e => { if (!page) { e.preventDefault(); open = a.id; } }}><b>{a.title}</b><span>{a.summary}</span></a></li>
      {:else}<li class="none">Nothing found. Try other words.</li>{/each}
    </ul>
  {/if}
</div>

<style>
  .help { display: grid; gap: 10px; min-height: 0; }
  input[type="search"] { width: 100%; box-sizing: border-box; background: var(--raised); border: 1px solid var(--line-2); border-radius: 8px; padding: 7px 10px; color: var(--ink); }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; overflow-y: auto; }
  .list a { display: grid; gap: 2px; text-decoration: none; background: var(--raised); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; color: var(--ink); }
  .list a:hover { border-color: var(--accent); }
  .list span { color: var(--muted); font-size: 12px; }
  .none { color: var(--muted); font-size: 13px; padding: 6px 2px; }
  article { display: grid; gap: 8px; overflow-y: auto; min-height: 0; }
  article h1 { margin: 0; font-size: 19px; color: var(--ink); }
  .page article h1 { font-size: 30px; }
  .back { justify-self: start; background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0; font-size: 12.5px; }
  .back:hover { color: var(--accent); }
  .showme { display: flex; gap: 10px; align-items: center; margin: 0; }
  .showme small { color: var(--muted); }
  .gb { background: var(--accent); color: var(--accent-ink); border: 1px solid var(--accent); border-radius: 7px; padding: 5px 14px; font-weight: 600; font-size: 13px; cursor: pointer; }
  .gb:disabled { opacity: .45; cursor: default; }
  .md { color: var(--ink-2); font-size: 13.5px; line-height: 1.55; }
  .page .md { font-size: 15px; max-width: 760px; }
  .md :global(h2), .md :global(h3) { color: var(--ink); margin: 14px 0 4px; font-size: 15px; }
  .page .md :global(h2) { font-size: 19px; }
  .md :global(p) { margin: 6px 0; }
  .md :global(ul), .md :global(ol) { margin: 6px 0; padding-left: 20px; }
  .md :global(li) { margin: 3px 0; }
  .md :global(code) { font-family: var(--font-mono); font-size: .92em; background: var(--raised); padding: 0 4px; border-radius: 3px; }
  .md :global(a) { color: var(--accent); }
  .md :global(b) { color: var(--ink); }
</style>
