<script lang="ts">
  /* Turning on Cloud sync for a profile (ADR 0040). When the account already has collections from
     other devices, each collection here can be merged with one of them, or kept separate. */
  import { untrack } from 'svelte';
  import { lib } from '../../lib/library.svelte';
  import { account } from '../../lib/account.svelte';
  import { sync, type Member } from '../../lib/sync.svelte';
  import type { Profile } from '../../store/types';

  let { pid, onclose }: { pid: string; onclose: () => void } = $props();
  let profile = $state<Profile | null>(null);
  let choice = $state<Record<string, string>>({});
  let phase = $state<'loading' | 'ask' | 'working' | 'done'>('loading');
  let error = $state('');

  type Option = { value: string; label: string };
  const options = $derived.by((): Option[] => {
    const out: Option[] = [];
    for (const g of sync.groups) if (!g.members.some(m => m.device === account.thisDevice)) out.push({ value: 'g:' + g.id, label: 'Merge into “' + g.name + '” (' + g.members.length + ' devices)' });
    for (const r of sync.remote) {
      if (r.device.id === account.thisDevice) continue;
      for (const c of r.stats?.collections ?? []) {
        const m = { device: r.device.id, profile: r.profile.id, collection: c.id };
        if (sync.groupOf(m)) continue;   // offered through its merged collection
        out.push({ value: 'm:' + m.device + '/' + m.profile + '/' + m.collection, label: 'Merge with ' + r.device.name + ' · ' + c.name + ' (' + c.tracks.toLocaleString() + ' tracks)' });
      }
    }
    return out;
  });

  // Once: turning sync on rewrites the profile, which must not start this again.
  $effect(() => untrack(() => {
    void (async () => {
      try {
        profile = await lib.profileInfo(pid);
        await lib.setProfileSync(pid, true);
        await sync.refresh();
        if (!options.length) return finish();   // the first device: nothing to merge with
        // Suggest merging with a collection of the same name; otherwise keep separate.
        for (const c of profile?.collections ?? []) choice[c.id] = options.find(o => o.label.includes('· ' + c.name + ' ('))?.value ?? 'separate';
        phase = 'ask';
      } catch (e) { error = (e as Error).message; phase = 'ask'; }
    })();
  }));

  async function finish() {
    phase = 'working'; error = '';
    try {
      await sync.push(pid);
      for (const c of profile?.collections ?? []) {
        const v = choice[c.id] ?? 'separate', me: Member = { device: account.thisDevice!, profile: pid, collection: c.id };
        if (v.startsWith('g:')) await sync.merge([me], { group: v.slice(2) });
        else if (v.startsWith('m:')) {
          const [device, prof, collection] = v.slice(2).split('/');
          const other = sync.remote.find(r => r.device.id === device)?.stats?.collections?.find(x => x.id === collection);
          await sync.merge([{ device, profile: prof, collection }, me], { name: other?.name ?? c.name });
        }
      }
      phase = 'done';
      lib.notice = 'Cloud sync is on for ' + (profile?.name ?? 'this profile') + '.';
      onclose();
    } catch (e) { error = (e as Error).message; phase = 'ask'; }
  }
  async function cancel() { await lib.setProfileSync(pid, false); onclose(); }
</script>

<div class="scrim" role="presentation">
  <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="ss-h" id="sync-setup">
    <h2 id="ss-h">Cloud sync for {profile?.name ?? '…'}</h2>
    {#if phase === 'loading' || phase === 'working'}
      <p class="fine" role="status">{phase === 'loading' ? 'Looking at your cloud…' : 'Uploading this profile’s data (not the music)…'}</p>
    {:else}
      <p>Your account already has collections from other devices. For each collection here, merge it with one of them (you'll see one collection with every device's songs and playlists) or keep it separate. Merging changes nothing on either computer and can be undone.</p>
      {#each profile?.collections ?? [] as c (c.id)}
        <fieldset class="row">
          <legend><b>{c.name}</b> on this computer</legend>
          <label><input type="radio" name={'c-' + c.id} value="separate" bind:group={choice[c.id]}> Keep it as a separate collection</label>
          {#each options as o (o.value)}
            <label><input type="radio" name={'c-' + c.id} value={o.value} bind:group={choice[c.id]}> {o.label}</label>
          {/each}
        </fieldset>
      {/each}
      {#if error}<p class="err">{error}</p>{/if}
      <div class="acts">
        <button type="button" class="btn-ghost" onclick={cancel}>Cancel</button>
        <button type="button" class="btn" id="sync-go" onclick={finish}>Turn on Cloud sync</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; overflow-y: auto; }
  .dlg { width: min(600px, 100%); background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 22px; display: grid; gap: 14px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); margin-block: auto; }
  h2 { font-size: 21px; }
  p { color: var(--ink-2); font-size: 14px; }
  .row { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin: 0; display: grid; gap: 6px; }
  legend { padding: 0 4px; font-size: 13.5px; }
  label { display: flex; gap: 8px; align-items: center; font-size: 13.5px; cursor: pointer; }
  .acts { display: flex; gap: 10px; justify-content: flex-end; }
  .fine { color: var(--muted); }
  .err { color: var(--bad); font-size: 13px; }
</style>
