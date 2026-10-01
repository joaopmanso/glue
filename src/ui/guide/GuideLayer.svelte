<script lang="ts">
  /* Gluey on screen (ADR 0126): his button in the corner (the panel of tours and help), the offer for people who used
     GLUE before him, and the tour itself: the page dimmed but for the part he talks about, and his speech bubble. */
  import { tick, untrack } from 'svelte';
  import Gluey from './Gluey.svelte';
  import { guide } from '../../lib/guide.svelte';
  import { lib } from '../../lib/library.svelte';
  import { account } from '../../lib/account.svelte';
  import { phone } from '../../lib/phone.svelte';
  import { router } from '../../lib/route.svelte';
  import { TOURS, type TourStep } from '../../core/guide/tours';

  const inLibrary = $derived(lib.phase === 'library' && !!lib.store && lib.onboarding !== 'music');
  // The first tour, once per person, when the library is on screen and the account has said what it knows.
  // (After a moment: a new profile shows the library for an instant before "Add your music".)
  const ready = $derived(inLibrary && account.ready && (router.current.name === 'library' || router.current.name === 'track'));
  $effect(() => {
    if (!ready) return;
    const t = setTimeout(() => { if (ready) void guide.welcome(); }, 1200);
    return () => clearTimeout(t);
  });
  // Signed in later (or another device's): what it has seen counts here too.
  $effect(() => { const id = account.user?.id; if (id) untrack(() => void guide.sync()); });

  const run = $derived(guide.running);
  const step = $derived<TourStep | null>(run ? run.tour.steps[run.step] ?? null : null);
  let rect = $state<DOMRect | null>(null), dir = 1, bubble = $state<HTMLElement>();
  let size = $state({ w: 1280, h: 800 });

  const find = (name: string) => [...document.querySelectorAll<HTMLElement>(`[data-guide="${name}"]`)].find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) ?? null;

  // Each stop: its target looked for a moment (the page it opened is drawing), brought into view, and followed.
  $effect(() => {
    const s = step, r = run;
    if (!s || !r) { rect = null; return; }
    let stop = false, el: HTMLElement | null = null, tries = 0;
    const measure = () => { size = { w: innerWidth, h: innerHeight }; rect = el ? el.getBoundingClientRect() : null; };
    const look = () => {
      if (stop) return;
      if (!s.target) { el = null; measure(); return; }
      el = find(s.target);
      if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); measure(); return; }
      if (++tries < 25) { setTimeout(look, 120); return; }
      if (s.optional) guide.skipMissing(dir < 0); else { el = null; measure(); }
    };
    rect = null; look();
    const id = setInterval(() => { if (el) measure(); }, 250);
    addEventListener('resize', measure); addEventListener('scroll', measure, true);
    void tick().then(() => bubble?.querySelector<HTMLElement>('[data-guide-next]')?.focus());
    return () => { stop = true; clearInterval(id); removeEventListener('resize', measure); removeEventListener('scroll', measure, true); };
  });

  const PAD = 8, GAP = 14, BW = 340;
  /** Where the bubble goes: beside the target on its side, kept on screen; the middle when there's no target. */
  const at = $derived.by(() => {
    const r = rect, w = size.w, h = size.h, place = step?.place ?? 'right';
    const bw = Math.min(BW, w - 24);
    if (!r || place === 'center') return { left: (w - bw) / 2, top: Math.max(24, h / 2 - 140), w: bw };
    let left = place === 'left' ? r.left - PAD - GAP - bw : place === 'right' ? r.right + PAD + GAP : r.left + r.width / 2 - bw / 2;
    let top = place === 'top' ? r.top - PAD - GAP - 200 : place === 'bottom' ? r.bottom + PAD + GAP : r.top;
    if (place === 'right' && left + bw > w - 12) left = Math.max(12, r.left - PAD - GAP - bw);
    left = Math.min(Math.max(12, left), w - bw - 12);
    top = Math.min(Math.max(12, top), h - 230);
    return { left, top, w: bw };
  });

  function key(e: KeyboardEvent) {
    if (!run) return;
    if (e.key === 'Escape') { e.preventDefault(); guide.end(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); dir = 1; guide.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); dir = -1; guide.back(); }
  }
  const tours = $derived(TOURS.filter(t => !!t.phone === phone.active));
</script>

<svelte:window onkeydown={key} />

{#if inLibrary}
  <button type="button" class="corner" class:phone={phone.active} data-guide="help" id="gluey-btn" title="Gluey: help and tours" aria-label="Gluey: help and tours" aria-expanded={guide.panel} onclick={() => (guide.panel = !guide.panel)}>
    <Gluey size={34} pose={guide.offer ? 'wave' : 'point'} />
  </button>
  {#if run}<!-- the tour speaks -->
  {:else if guide.offer}
    <div class="offer" class:phone={phone.active} id="gluey-offer" role="dialog" aria-label="Gluey">
      <div class="ohead"><Gluey size={40} pose="wave" /><p><b>New: I’m Gluey.</b> I can show you around GLUE in a minute.</p></div>
      <div class="acts"><button type="button" class="link" id="gluey-offer-no" onclick={() => guide.answerOffer(false)}>No thanks</button><button type="button" class="gb" id="gluey-offer-yes" onclick={() => guide.answerOffer(true)}>Show me</button></div>
    </div>
  {:else if guide.panel}
    <div class="panel" class:phone={phone.active} id="gluey-panel" role="dialog" aria-label="Gluey: help and tours">
      <header><Gluey size={40} pose="wave" /><div><b>Hi, I’m Gluey.</b><span>Pick a tour and I’ll show you around.</span></div><button type="button" class="x" aria-label="Close" onclick={() => (guide.panel = false)}>×</button></header>
      <ul>
        {#each tours as t (t.id)}<li><button type="button" class="tour" data-tour={t.id} onclick={() => guide.start(t.id)}><b>{t.title}</b><span>{t.summary}</span></button></li>{/each}
      </ul>
    </div>
  {/if}
{/if}

{#if run && step}
  <div class="layer" role="presentation">
    <svg class="scrim" width={size.w} height={size.h} aria-hidden="true">
      <defs><mask id="gluey-hole"><rect width="100%" height="100%" fill="#fff" />{#if rect && step.target}<rect x={rect.left - PAD} y={rect.top - PAD} width={rect.width + PAD * 2} height={rect.height + PAD * 2} rx="10" fill="#000" />{/if}</mask></defs>
      <rect width="100%" height="100%" mask="url(#gluey-hole)" class="dim" />
      {#if rect && step.target}<rect class="ring" x={rect.left - PAD} y={rect.top - PAD} width={rect.width + PAD * 2} height={rect.height + PAD * 2} rx="10" />{/if}
    </svg>
    <div class="bubble" bind:this={bubble} id="gluey-bubble" data-step={run.step} data-target={step.target ?? ''} role="dialog" aria-modal="true" aria-labelledby="gluey-title" aria-describedby="gluey-body" style:left={at.left + 'px'} style:top={at.top + 'px'} style:width={at.w + 'px'}>
      <div class="who"><Gluey size={64} pose={step.pose ?? 'point'} flip={step.place === 'left'} /></div>
      <div class="say">
        <h2 id="gluey-title">{step.title}</h2>
        <p id="gluey-body" aria-live="polite">{step.body}</p>
        <div class="foot">
          <span class="dots" aria-label={'Stop ' + (run.step + 1) + ' of ' + run.tour.steps.length}>{#each run.tour.steps as _, i (i)}<i class:on={i === run.step}></i>{/each}</span>
          <span class="btns"><button type="button" class="link" id="gluey-skip" onclick={() => guide.end()}>{run.step === run.tour.steps.length - 1 ? '' : 'Skip'}</button>
          {#if run.step > 0}<button type="button" class="gb ghost" id="gluey-back" onclick={() => { dir = -1; guide.back(); }}>Back</button>{/if}
          <button type="button" class="gb" id="gluey-next" data-guide-next onclick={() => { dir = 1; guide.next(); }}>{run.step === run.tour.steps.length - 1 ? 'Done' : 'Next'}</button></span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .corner { position: fixed; right: 18px; bottom: 92px; z-index: 55; width: 50px; height: 50px; border-radius: 50%; border: 1px solid var(--line-2); background: var(--surface); display: grid; place-items: center; cursor: pointer; box-shadow: 0 8px 24px rgb(0 0 0 / .3); padding: 0; }
  .corner:hover { border-color: var(--accent); }
  .corner.phone { bottom: 196px; right: 12px; width: 44px; height: 44px; }
  .offer, .panel { position: fixed; right: 18px; bottom: 152px; z-index: 56; width: min(340px, calc(100vw - 24px)); background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; box-shadow: 0 16px 40px rgb(0 0 0 / .4); padding: 12px 14px; font-size: 13.5px; color: var(--ink-2); }
  .offer.phone, .panel.phone { right: 12px; bottom: 250px; }
  .offer p { margin: 0; }
  .ohead { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
  .acts { display: flex; justify-content: flex-end; gap: 10px; align-items: center; }
  .panel header { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  .panel header div { display: grid; flex: 1; }
  .panel header span { color: var(--muted); font-size: 12.5px; }
  .x { background: none; border: 0; color: var(--muted); font-size: 18px; cursor: pointer; align-self: flex-start; }
  .panel ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .tour { width: 100%; text-align: left; display: grid; gap: 2px; background: var(--raised); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; cursor: pointer; color: var(--ink); }
  .tour:hover { border-color: var(--accent); }
  .tour span { color: var(--muted); font-size: 12px; }
  .layer { position: fixed; inset: 0; z-index: 90; }
  .scrim { position: absolute; inset: 0; }
  .dim { fill: rgb(0 0 0 / .55); }
  .ring { fill: none; stroke: var(--accent); stroke-width: 2.5; }
  .bubble { box-sizing: border-box; position: absolute; display: flex; gap: 10px; align-items: flex-start; background: var(--surface); border: 1px solid var(--accent); border-radius: 14px; padding: 12px 14px; box-shadow: 0 18px 50px rgb(0 0 0 / .45); }
  .who { flex: none; margin-top: 4px; }
  .say { display: grid; gap: 6px; min-width: 0; flex: 1; }
  .say h2 { margin: 0; font-size: 16px; color: var(--ink); }
  .say p { margin: 0; color: var(--ink-2); font-size: 13.5px; line-height: 1.45; }
  .foot { display: grid; gap: 8px; margin-top: 6px; }
  .btns { display: flex; align-items: center; gap: 8px; }
  .btns .link { margin-right: auto; }
  .gb { background: var(--accent); color: var(--accent-ink); border: 1px solid var(--accent); border-radius: 7px; padding: 5px 14px; font-weight: 600; font-size: 13px; cursor: pointer; }
  .gb.ghost { background: none; color: var(--ink-2); border-color: var(--line-2); font-weight: 500; }
  .gb:hover { filter: brightness(1.08); }
  .dots { display: flex; gap: 4px; }
  .dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-2); }
  .dots i.on { background: var(--accent); }
  .link { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 12.5px; text-decoration: underline; padding: 0; }
  @media (prefers-reduced-motion: no-preference) { .bubble { transition: left .25s ease, top .25s ease; } }
</style>
