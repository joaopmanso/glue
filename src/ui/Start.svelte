<script lang="ts">
  import { themes } from '../lib/themes.svelte';
  import { loadExample } from '../lib/app.svelte';
  import { drawSplashArt } from './render/splashArt';

  let art: HTMLCanvasElement;
  $effect(() => { void themes.version; if (art) drawSplashArt(art); });
  $effect(() => {
    const ro = new ResizeObserver(() => drawSplashArt(art));
    ro.observe(art);
    void document.fonts?.ready.then(() => drawSplashArt(art));
    return () => ro.disconnect();
  });
</script>

<section class="splash" id="splash" aria-label="Start">
  <div class="splash-copy">
    <h2>Is your hi-res <em>actually</em> hi-res?</h2>
    <p class="lede">GLUE shows what’s really inside a track (where the spectrum stops, how many bits carry signal, which tools touched it) and tells you whether it’s genuine, upsampled, or a lossy rip in disguise.</p>
  </div>
  <button type="button" class="dropzone" id="dropzone" onclick={() => document.getElementById('file-input')?.click()}>
    <canvas id="splash-art" aria-hidden="true" bind:this={art}></canvas>
    <span class="dz-center">
      <svg class="dz-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 6v24M14 20l10 10 10-10"/><path d="M6 30v8a4 4 0 0 0 4 4h28a4 4 0 0 0 4-4v-8"/></svg>
      <b><span class="dz-idle">Drop a track here</span><span class="dz-active">Release to analyze</span></b>
      <span class="dz-sub">or <u>click to choose a file</u></span>
      <small>FLAC · WAV · AIFF · ALAC · MP3 · AAC · Ogg · Opus · WebM</small>
    </span>
  </button>
  <div class="splash-actions">
    <button type="button" class="btn-ghost" id="try-example" onclick={() => loadExample()}>No file handy? Try the example</button>
    <p class="fine">Nothing is uploaded: the analysis runs in your browser.</p>
  </div>
  <ul class="checks">
    <li><b>Lossy walls</b><span>A sharp cutoff at 16, 19 or 20 kHz is the fingerprint of an MP3, AAC or Opus encoder.</span></li>
    <li><b>Upsampling</b><span>A 96 kHz file whose content stops at 22 kHz came from a CD-rate master.</span></li>
    <li><b>Padded bits</b><span>A “24-bit” file whose lowest 8 bits are always zero is 16-bit underneath.</span></li>
    <li><b>Rip fingerprints</b><span>YouTube DASH brands, yt-dlp tags, or a LAME header hiding inside a FLAC.</span></li>
  </ul>
</section>
