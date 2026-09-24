<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { player } from '../lib/player.svelte';
  import { stems } from '../lib/stems.svelte';
  import Sidebar from './Sidebar.svelte';
  import SpecPanel from './SpecPanel.svelte';
  import LtasPanel from './LtasPanel.svelte';
  import Evidence from './Evidence.svelte';
  import Facts from './Facts.svelte';

  // A new result gets a fresh player source and clears any stems from the previous file.
  // Only app.res / app.playBlob are dependencies; the calls themselves read player/stems state.
  $effect(() => {
    const res = app.res, blob = app.playBlob;
    if (!res) return;
    untrack(() => {
      stems.reset();
      player.setSource(blob, { duration: res.duration, sampleRate: res.sr });
    });
  });
</script>

<div id="results" class="results">
  <div class="workspace">
    <Sidebar />
    <SpecPanel />
  </div>
  <div class="cols">
    <LtasPanel />
    <Evidence />
  </div>
  <Facts />
</div>
