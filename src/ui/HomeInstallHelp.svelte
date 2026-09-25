<script lang="ts">
  /* Installing GLUE Home (ADR 0044): it isn't code-signed yet, so the browser and the OS warn about
     it. What those screens look like, why it's safe, and how to get past them. */
  import { homeOs } from '../lib/homeApp';
  const os = homeOs();
</script>

<details class="help" id="install-help" open={os !== null}>
  <summary>Windows or your Mac will warn you when installing: that's expected</summary>
  <p>GLUE Home isn’t code-signed yet (that takes a paid certificate), so your computer treats it like any new app from an unknown publisher. It’s built from GLUE’s public source on GitHub, and once installed it updates itself.</p>
  {#if os !== 'mac'}
    <h4>Windows</h4>
    <ol>
      <li><b>A red or orange bar in the browser</b> (“GLUE-Home-Setup.exe isn’t commonly downloaded”): open the ⋯ menu next to it › <b>Keep</b> › <b>Show more</b> › <b>Keep anyway</b>.</li>
      <li><b>A blue “Windows protected your PC” screen</b> when you run it: click <b>More info</b>, then <b>Run anyway</b>.</li>
    </ol>
  {/if}
  {#if os !== 'windows'}
    <h4>macOS</h4>
    <ol>
      <li>Drag GLUE Home to Applications.</li>
      <li><b>“GLUE Home can’t be opened because Apple cannot check it”</b>: Control-click (right-click) it in Applications › <b>Open</b> › <b>Open</b>. On newer macOS: System Settings › Privacy &amp; Security › <b>Open Anyway</b>.</li>
    </ol>
  {/if}
</details>

<style>
  .help { border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; background: var(--ground); font-size: 12.5px; color: var(--ink-2); text-align: left; }
  summary { cursor: pointer; color: var(--ink); font-weight: 600; font-size: 13px; }
  p { margin: 8px 0 0; }
  h4 { margin: 10px 0 4px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  ol { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
</style>
