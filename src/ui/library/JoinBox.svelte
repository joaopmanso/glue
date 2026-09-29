<script lang="ts">
  /* Cloud sync on, and the account already has collections (ADR 0101): asked once, on this computer,
     whether this computer's collection goes into one of them (the same songs become one song with a copy
     on each computer) or stays a collection of its own. */
  import { shared } from '../../lib/shared.svelte';

  let into = $state('');
  let busy = $state(false);
  $effect(() => { if (shared.ask && !shared.ask.into.some(c => c.id === into)) into = shared.ask.into[0]?.id ?? ''; });
  async function go(how: 'into' | 'own' | 'later') {
    busy = true;
    try { await shared.answer(how, into); } finally { busy = false; }
  }
</script>

{#if shared.ask}
  {@const a = shared.ask}
  <div class="scrim" role="presentation"></div>
  <div class="box" role="dialog" aria-modal="true" aria-labelledby="join-h" id="join-box">
    <h3 id="join-h">Your account already has a collection</h3>
    <p>“{a.name}” on this computer ({a.tracks.toLocaleString()} song{a.tracks === 1 ? '' : 's'}) isn't in your account yet. With cloud sync on, it's synced with every device you sign in to.</p>
    {#if a.into.length > 1}
      <label>Put it into
        <select id="join-into" bind:value={into}>
          {#each a.into as c (c.id)}<option value={c.id}>“{c.name}” ({(c.stats?.tracks ?? 0).toLocaleString()} songs)</option>{/each}
        </select>
      </label>
    {/if}
    <div class="acts">
      <button type="button" class="btn" id="join-into-go" disabled={busy} onclick={() => void go('into')}>Put this computer’s songs into “{a.into.find(c => c.id === into)?.name ?? a.into[0]?.name}”</button>
      <button type="button" class="mini" id="join-own" disabled={busy} onclick={() => void go('own')}>Keep “{a.name}” as a collection of its own</button>
      <button type="button" class="link" id="join-later" disabled={busy} onclick={() => void go('later')}>Not now</button>
    </div>
    <p class="fine">Putting it in: the same songs become one song, with a copy on each computer; playlists with the same name and place join. A backup of this computer's collection is made first.</p>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 80; background: rgb(0 0 0 / .5); }
  .box { position: fixed; z-index: 81; left: 50%; top: 18vh; transform: translateX(-50%); width: min(520px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; display: grid; gap: 12px; box-shadow: 0 20px 50px rgb(0 0 0 / .5); color: var(--ink-2); font-size: 14px; }
  h3 { margin: 0; font-size: 17px; color: var(--ink); }
  p { margin: 0; }
  label { display: grid; gap: 4px; font-size: 13px; }
  select { font: inherit; }
  .acts { display: grid; gap: 8px; justify-items: start; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 13px; padding: 5px 10px; cursor: pointer; }
  .link { background: none; border: 0; color: var(--muted); text-decoration: underline; cursor: pointer; padding: 0; font-size: 12.5px; }
  .fine { color: var(--muted); font-size: 12.5px; }
</style>
