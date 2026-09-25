<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { declaredLabel } from '../core/audio/verdict';
  import { fmtKHz } from '../core/format';
  import MusicCard from './MusicCard.svelte';
  import type { MusicResult } from '../core/types';

  /** summary: what to show without a live analysis (a track on another device: its stored summary). */
  type Cell = { k: string; val: string; sub: string; tone: string };
  let { summary = null }: { summary?: { grade: string; label: string; headline: string; sub: string; cells: Cell[]; music: MusicResult | null } | null } = $props();

  const v = $derived(summary ?? app.verdict);
  const cells = $derived.by((): Cell[] => {
    if (summary) return summary.cells;
    const info = app.info, v = app.verdict;
    if (!info || !v) return [];
    const cut = v.cut;
    const bw = cut.full && !cut.wall ? fmtKHz(Math.max(cut.fc, cut.fade)) : fmtKHz(cut.fc);
    const bwSub = cut.wall ? 'sharp wall, −' + Math.round(cut.drop) + ' dB' : cut.full ? 'reaches the top' : 'gradual fade' + (cut.reach && cut.reach > cut.fc + 500 ? ', quieter to ' + fmtKHz(cut.reach) : '');
    let depthVal = '—', depthSub = info.lossless === false ? 'not meaningful for lossy' : 'not measured', depthTone = '';
    if (v.depth) {
      depthVal = v.depth.eff + '-bit';
      depthSub = v.depth.float ? 'inside ' + (info.bitsLabel || 'float') : 'of ' + v.depth.declared + ' declared';
      depthTone = v.depth.eff < v.depth.declared && !v.depth.float ? (v.depth.declared >= 20 && v.depth.eff <= 16 ? 'bad' : 'warn') : v.depth.float && v.depth.eff === 16 ? 'bad' : 'ok';
    }
    const exp = v.expected;
    return [
      { k: 'Declared', val: declaredLabel(info), sub: info.container, tone: '' },
      { k: 'Expected bandwidth', val: exp ? 'up to ' + fmtKHz(exp.hz) : '—', sub: exp ? exp.why : info.lossless == null ? 'format unknown' : 'unknown bitrate', tone: '' },
      { k: 'Measured bandwidth', val: bw, sub: bwSub, tone: v.bwTone },
      { k: 'Effective depth', val: depthVal, sub: depthSub, tone: depthTone },
      { k: 'Likely origin', val: v.origin, sub: info.example ? 'example track' : (info.encoder || info.vendor || 'from spectrum and tags').slice(0, 48), tone: '' },
    ];
  });
</script>

<aside class="side">
  {#if app.info?.example}
    <p id="example-note" class="example-note"><span class="tag">EXAMPLE</span> A synthetic track generated in your browser: a 16 kHz lossy-style cutoff and 16-bit samples, labelled as 96 kHz / 24-bit FLAC. Open one of your own files to analyze it.</p>
  {/if}
  {#if v}
    <section id="verdict" class="verdict" data-grade={v.grade} aria-live="polite">
      <div class="v-main">
        <span class="pill" id="v-pill">{v.label}</span>
        <div class="v-text">
          <h2 id="v-head">{v.headline}</h2>
          <p id="v-sub">{v.sub}</p>
        </div>
      </div>
      <div class="readouts" id="readouts">
        {#each cells as c (c.k)}
          <div data-tone={c.tone}><span class="label">{c.k}</span><span class="val">{c.val}</span><span class="sub">{c.sub}</span></div>
        {/each}
      </div>
    </section>
  {/if}
  <MusicCard music={summary ? summary.music : undefined} />
</aside>
