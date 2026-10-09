<script lang="ts">
  /* Opening the library or a collection (ADR 0177): what's being done and how far it is, not a dark page with a line of
     text (the user, 2026-10-09). */
  import { lib } from '../../lib/library.svelte';
  import GlueStick from '../GlueStick.svelte';

  const l = $derived(lib.loading ?? { title: 'Opening your library', text: 'Starting…', done: 0, total: 0 });
  const pct = $derived(l.total ? Math.max(3, Math.min(100, Math.round((l.done / l.total) * 100))) : null);
</script>

<div class="opening-card" id="loading-card" role="status" aria-live="polite" aria-busy="true">
  <span class="logo"><GlueStick size={44} /></span>
  <h2>{l.title}</h2>
  <p id="loading-step">{l.text}</p>
  <div class="track" role="progressbar" aria-label={l.text} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
    <span class:indet={pct == null} style:width={pct == null ? '35%' : pct + '%'}></span>
  </div>
  <small class="count" id="loading-count">{l.total ? l.done.toLocaleString() + ' of ' + l.total.toLocaleString() + ' files' : ' '}</small>
</div>

<style>
  .opening-card { max-width: 420px; margin: 12vh auto 0; padding: 28px 28px 22px; display: grid; justify-items: center; gap: 10px; text-align: center;
    border: 1px solid var(--line-2); border-radius: 14px; background: var(--surface); }
  .logo { animation: bob 1.6s ease-in-out infinite; }
  h2 { margin: 4px 0 0; font-size: 18px; }
  p { margin: 0; color: var(--muted); font-size: 14px; min-height: 1.4em; }
  .track { width: 100%; height: 6px; margin-top: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .track span { display: block; height: 100%; border-radius: 3px; background: var(--accent); transition: width .2s ease-out; }
  .track span.indet { animation: slide 1.2s ease-in-out infinite; }
  .count { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; min-height: 1.2em; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(290%); } }
  @keyframes bob { 50% { transform: translateY(-3px); } }
  @media (prefers-reduced-motion: reduce) { .logo, .track span.indet { animation: none; } .track span { transition: none; } }
</style>
