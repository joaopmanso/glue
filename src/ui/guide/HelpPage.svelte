<script lang="ts">
  /* #/help (ADR 0126): the help centre as a page. It works before anything is set up, and can be linked to. */
  import Gluey from './Gluey.svelte';
  import HelpBody from './HelpBody.svelte';
  import { lib } from '../../lib/library.svelte';
  let { id = null }: { id?: string | null } = $props();
  let open = $derived(id);
</script>

<section class="hp" id="help-page">
  <header>
    <Gluey size={58} pose="wave" />
    <div><h2>Help</h2><p>How GLUE works, a feature at a time. “Show me” runs a feature’s tour in your library.</p></div>
    <a class="lib" href="#/" onclick={() => { if (lib.phase === 'profiles') lib.backToLibrary(); }}>← {lib.phase === 'library' ? 'Back to the library' : 'Back to GLUE'}</a>
  </header>
  <HelpBody {open} page />
</section>

<style>
  .hp { max-width: 900px; margin: 0 auto; padding: 24px 16px 80px; display: grid; gap: 18px; }
  header { display: flex; gap: 16px; align-items: center; }
  header div { flex: 1; }
  h2 { margin: 0; font-size: 28px; }
  header p { margin: 4px 0 0; color: var(--muted); }
  .lib { color: var(--muted); text-decoration: none; font-size: 13px; white-space: nowrap; }
  .lib:hover { color: var(--accent); }
  @media (max-width: 600px) { header { flex-wrap: wrap; } }
</style>
