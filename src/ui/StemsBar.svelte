<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { player } from '../lib/player.svelte';
  import { stems, STEMS } from '../lib/stems.svelte';
  import { STEM_SR } from '../core/stems/constants';
  import { downloadBlob } from '../lib/download';
  import { fmtEta } from '../core/format';

  const base = $derived(((app.info?.fileName) || 'track').replace(/\.[^.]+$/, ''));

  function run() {
    const src = app.playBlob, res = app.res;
    if (!src || !res) return;
    void stems.run(src, () => app.playBlob === src);
  }
  // Play the current selection, keeping position and play state; the full mix is the original file.
  function apply() {
    const blob = stems.selectionBlob(), res = app.res;
    if (!res) return;
    player.setSource(blob ?? app.playBlob, { keepPosition: true, duration: res.duration, sampleRate: blob ? STEM_SR : res.sr });
  }
  function onChip(e: MouseEvent, i: number) {
    stems.toggle(i, e.altKey || e.shiftKey);   // Alt/Shift-click solos
    apply();
  }
</script>

<div class="stems" id="stems">
  {#if stems.phase === 'idle'}
    <div class="stems-row" id="stems-idle">
      <button type="button" class="btn-ghost sm" id="stems-run" onclick={run}>Separate stems</button>
      <span class="hint" id="stems-hint">
        {#if stems.error}{stems.error}
        {:else}
          Split into drums, bass, other and vocals with HT-Demucs, right here in your browser.
          {@const est = stems.estimate(app.res?.duration ?? 0)}
          {#if est}<b id="stems-estimate">About {fmtEta(est)} for this track on this computer.</b>{/if}
          {#if stems.cached}Model saved on this device (166 MB) · <button type="button" class="linkish" id="stems-forget" onclick={() => stems.forgetModel()}>Remove</button>
          {:else}The first run downloads a 166 MB model and keeps it for next time.{/if}
        {/if}
      </span>
    </div>
  {:else if stems.phase === 'busy'}
    <div class="stems-row" id="stems-busy">
      <span class="stems-status" id="stems-status">{stems.status}</span>
      <div class="bar stems-bar"><span id="stems-bar" style:width={(stems.p ?? 0) * 100 + '%'}></span></div>
      <button type="button" class="btn-ghost sm" id="stems-cancel" onclick={() => stems.cancel()}>Cancel</button>
    </div>
  {:else}
    <div class="stems-row" id="stems-ready">
      <span class="label">Stems</span>
      <div class="stem-chips" id="stem-chips">
        {#each STEMS as s, i (s.name)}
          <span class="stem" style:--c={s.c}>
            <button type="button" class="tog" data-i={i} aria-pressed={stems.sel.includes(i)} onclick={e => onChip(e, i)}>{s.name}</button>
            <button type="button" class="dl" data-i={i} title={'Download ' + s.name.toLowerCase() + ' (24-bit WAV)'} aria-label={'Download ' + s.name.toLowerCase()}
              onclick={() => downloadBlob(stems.stemBlob(i), base + ' - ' + s.name + '.wav')}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"/></svg>
            </button>
          </span>
        {/each}
      </div>
      <button type="button" class="btn-ghost sm" id="stems-all" disabled={stems.sel.length === 4} onclick={() => { stems.sel = [0, 1, 2, 3]; apply(); }}>All</button>
      <button type="button" class="btn-ghost sm" id="stems-dl-mix" onclick={() => { const d = stems.selectionDownload(); downloadBlob(d.blob, base + ' - ' + d.label + '.wav'); }}>Download selection</button>
    </div>
  {/if}
</div>
