<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Severity } from '../core/types';

  const CHIP: Record<Severity, [string, string]> = { bad: ['✕', 'Fail'], warn: ['!', 'Caution'], ok: ['✓', 'Pass'], info: ['i', 'Note'] };
  /** findings / elsewhere: another device's track, from its stored summary (the file's clues stay there). */
  let { findings: given = undefined, elsewhere = '' }: { findings?: { sev: Severity; title: string; detail?: string }[]; elsewhere?: string } = $props();
  const findings = $derived(given ?? app.verdict?.findings ?? []);
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
        <li class="ev" data-sev={f.sev}><span class="chip"><i aria-hidden="true">{CHIP[f.sev][0]}</i>{CHIP[f.sev][1]}</span><div><b>{f.title}</b>{#if f.detail}<p>{f.detail}</p>{/if}</div></li>
      {/each}
    </ul>
    <div>
      <div class="label" style="margin-bottom:8px">Origin clues in the file</div>
      <div class="clues" id="clues">
        {#each clues as c, i (i)}
          <span class="clue">{c.label}<code>{c.match}</code></span>
        {:else}
          <span class="empty">{elsewhere ? 'In the file on ' + elsewhere + '.' : 'No encoder, ripper or downloader strings found.'}</span>
        {/each}
      </div>
    </div>
  </div>
</section>
