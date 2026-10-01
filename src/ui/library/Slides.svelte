<script lang="ts">
  /* The homepage's pictures of one chapter, all full size, side by side to scroll through (swipe, the arrows, the dots,
     or the keyboard's ← →). The next one peeks in, so it's clear there's more. Clips play only while on screen. */
  type Shot = { file: string; alt: string; video?: boolean };
  let { slides, media }: { slides: Shot[]; media: (f: string) => string } = $props();
  let rail = $state<HTMLElement>(), at = $state(0);

  const items = () => [...(rail?.querySelectorAll<HTMLElement>('.slide') ?? [])];
  function go(i: number) {
    const n = slides.length, el = items()[((i % n) + n) % n];
    if (rail && el) rail.scrollTo({ left: el.offsetLeft - rail.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function onScroll() {
    if (!rail) return;
    const x = rail.scrollLeft, all = items();
    let best = 0;
    all.forEach((el, i) => { if (Math.abs(el.offsetLeft - rail!.offsetLeft - x) < Math.abs(all[best].offsetLeft - rail!.offsetLeft - x)) best = i; });
    at = best;
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
  }
  /** A muted clip that loads and plays only while on screen. */
  function autoplay(v: HTMLVideoElement) {
    const io = new IntersectionObserver(es => { for (const e of es) { if (e.isIntersecting) { v.preload = 'auto'; void v.play().catch(() => {}); } else v.pause(); } }, { threshold: 0.5 });
    io.observe(v);
    return { destroy: () => io.disconnect() };
  }
</script>

<div class="slides">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="rail" bind:this={rail} onscroll={onScroll} onkeydown={key} tabindex="0" role="region" aria-roledescription="carousel" aria-label="Pictures of GLUE: scroll sideways">
    {#each slides as s, i (s.file)}
      <figure class="slide" aria-label={(i + 1) + ' of ' + slides.length + ': ' + s.alt}>
        {#if s.video}<video class="media" muted loop playsinline preload="none" poster={media(s.file.replace('.mp4', '-poster.webp'))} use:autoplay aria-label={s.alt}><source src={media(s.file)} type="video/mp4"></video>
        {:else}<img class="media" src={media(s.file)} alt={s.alt} loading="lazy" decoding="async">{/if}
      </figure>
    {/each}
  </div>
  {#if slides.length > 1}
    <div class="ctl">
      <button type="button" class="arrow" aria-label="Previous picture" onclick={() => go(at - 1)}>‹</button>
      <span class="dots">{#each slides as s, i (s.file)}<button type="button" class:on={i === at} aria-label={'Picture ' + (i + 1) + ': ' + s.alt} aria-current={i === at} onclick={() => go(i)}></button>{/each}</span>
      <button type="button" class="arrow" aria-label="Next picture" onclick={() => go(at + 1)}>›</button>
      <span class="cap">{slides[at]?.alt}</span>
    </div>
  {/if}
</div>

<style>
  .slides { display: grid; gap: 12px; min-width: 0; }
  .rail { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: 14px; outline-offset: 4px; }
  .rail::-webkit-scrollbar { display: none; }
  .slide { flex: 0 0 92%; scroll-snap-align: start; margin: 0; border-radius: 14px; overflow: hidden; background: var(--surface); border: 1px solid var(--line-2); box-shadow: 0 20px 50px -20px rgb(0 0 0 / .55); }
  .slide:only-child { flex-basis: 100%; }
  .media { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; object-position: top left; background: var(--ground); }
  .ctl { display: flex; align-items: center; gap: 10px; }
  .arrow { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 18px; line-height: 1; cursor: pointer; display: grid; place-items: center; padding: 0 0 2px; }
  .arrow:hover { border-color: var(--accent); color: var(--accent); }
  .dots { display: flex; gap: 6px; }
  .dots button { width: 8px; height: 8px; border-radius: 50%; border: 0; padding: 0; background: var(--line-2); cursor: pointer; }
  .dots button.on { background: var(--accent); width: 22px; border-radius: 4px; }
  .cap { color: var(--muted); font-size: 13px; margin-left: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  @media (prefers-reduced-motion: no-preference) { .dots button { transition: width .25s, background .25s; } }
</style>
