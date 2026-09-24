<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Severity } from '../core/types';

  const CHIP: Record<Severity, [string, string]> = { bad: ['✕', 'Fail'], warn: ['!', 'Caution'], ok: ['✓', 'Pass'], info: ['i', 'Note'] };
  const findings = $derived(app.verdict?.findings ?? []);
  const counts = $derived((['bad', 'warn', 'ok'] as Severity[])
    .map(s => [s, findings.filter(f => f.sev === s).length] as const).filter(x => x[1])
    .map(([s, n]) => n + ' ' + CHIP[s][1].toLowerCase()).join(' · '));
  const clues = $derived(app.info?.clues ?? []);
</script>

<section class="panel" aria-label="Evidence">
  <div class="panel-head"><h3>Evidence</h3><span class="hint" id="ev-count">{counts}</span></div>
  <div class="panel-body">
    <ul class="ev-list" id="evidence">
      {#each findings as f, i (i)}
        <li class="ev" data-sev={f.sev}><span class="chip"><i aria-hidden="true">{CHIP[f.sev][0]}</i>{CHIP[f.sev][1]}</span><div><b>{f.title}</b><p>{f.detail}</p></div></li>
      {/each}
    </ul>
    <div>
      <div class="label" style="margin-bottom:8px">Origin clues in the file</div>
      <div class="clues" id="clues">
        {#each clues as c, i (i)}
          <span class="clue">{c.label}<code>{c.match}</code></span>
        {:else}
          <span class="empty">No encoder, ripper or downloader strings found.</span>
        {/each}
      </div>
    </div>
  </div>
</section>
