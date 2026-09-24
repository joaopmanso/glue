<script lang="ts">
  import { THEMES, loadFonts, themes, type Mode } from '../lib/themes.svelte';

  // The previews show every theme in its real fonts.
  $effect(() => { for (const t of THEMES) loadFonts(t); });
  const MODES: [Mode, string][] = [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match system']];
</script>

<section class="tp" aria-label="Appearance">
  <div class="head">
    <h3 class="label">Appearance</h3>
    <span class="seg modes" role="radiogroup" aria-label="Dark or light">
      {#each MODES as [m, label] (m)}
        <button type="button" role="radio" aria-checked={themes.mode === m} id={'mode-' + m} onclick={() => themes.set(themes.theme, m)}>{label}</button>
      {/each}
    </span>
  </div>
  <div class="grid" role="radiogroup" aria-label="Theme">
    {#each THEMES as t (t.id)}
      <button type="button" role="radio" class="card" id={'theme-' + t.id} aria-checked={themes.theme === t.id} onclick={() => themes.set(t.id)}>
        <div class="theme-scope preview" data-theme={t.id} data-mode={themes.resolved}>
          <div class="pv-top"><b class="pv-brand">MCO</b><span class="pv-tab">Library</span><span class="pv-dot"></span></div>
          <div class="pv-body">
            <div class="pv-side"><i></i><i class="on"></i><i></i><i></i></div>
            <div class="pv-main">
              <div class="pv-title">Friday set</div>
              <div class="pv-row"><span>Linguistics</span><span class="pv-mono">124 · 8A</span><span class="pv-q ok">Lossless</span></div>
              <div class="pv-row sel"><span>Radix</span><span class="pv-mono">122 · 4A</span><span class="pv-q warn">Caution</span></div>
              <div class="pv-row"><span>Bebida</span><span class="pv-mono">122 · 4A</span><span class="pv-q bad">Lossy</span></div>
              <span class="pv-btn">Play</span>
            </div>
          </div>
        </div>
        <span class="name">{t.name}{#if t.id === 'classic'}<small> current</small>{/if}</span>
        <span class="blurb">{t.blurb}</span>
      </button>
    {/each}
  </div>
</section>

<style>
  .tp { display: grid; gap: 10px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .modes { grid-template-columns: repeat(3, auto); }
  .modes button { padding: 4px 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .card { display: grid; gap: 6px; text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px 8px 12px; cursor: pointer; color: var(--ink); }
  .card:hover { border-color: var(--line-2); }
  .card[aria-checked="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
  .name { font-weight: 700; font-size: 14px; padding: 0 4px; }
  .name small { font-weight: 500; color: var(--muted); font-size: 11.5px; }
  .blurb { color: var(--muted); font-size: 12px; line-height: 1.4; padding: 0 4px; }
  /* The preview is drawn with the previewed theme's own tokens (.theme-scope). */
  .preview { background: var(--ground); color: var(--ink); font-family: var(--font-sans); border-radius: 6px; overflow: hidden; border: 1px solid var(--line); height: 150px; display: grid; grid-template-rows: auto 1fr; font-size: 10px; }
  .pv-top { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  .pv-brand { font-family: var(--font-display); font-weight: var(--display-weight); letter-spacing: var(--display-tracking); font-size: 13px; color: var(--ink); }
  .pv-tab { background: var(--raised); padding: 1px 6px; border-radius: var(--radius); color: var(--ink-2); }
  .pv-dot { margin-left: auto; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); }
  .pv-body { display: grid; grid-template-columns: 40px 1fr; gap: 6px; padding: 6px; min-height: 0; }
  .pv-side { display: grid; gap: 4px; align-content: start; }
  .pv-side i { height: 7px; border-radius: 2px; background: var(--raised); }
  .pv-side i.on { background: color-mix(in srgb, var(--accent) 40%, transparent); }
  .pv-main { display: grid; gap: 3px; align-content: start; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 5px 6px; min-width: 0; }
  .pv-title { font-family: var(--font-display); font-weight: var(--display-weight); letter-spacing: var(--display-tracking); font-size: 12px; }
  .pv-row { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; color: var(--ink-2); }
  .pv-row.sel { background: color-mix(in srgb, var(--accent) 18%, transparent); border-radius: 2px; color: var(--ink); }
  .pv-mono { font-family: var(--font-mono); color: var(--muted); font-size: 9px; }
  .pv-q { font-family: var(--font-mono); font-size: 7.5px; text-transform: uppercase; letter-spacing: .05em; border: 1px solid currentColor; border-radius: 2px; padding: 0 3px; }
  .pv-q.ok { color: var(--ok); } .pv-q.warn { color: var(--warn); } .pv-q.bad { color: var(--bad); }
  .pv-btn { justify-self: start; margin-top: 2px; background: var(--accent); color: var(--accent-ink); border-radius: var(--radius); padding: 1px 8px; font-weight: 700; }
</style>
