<script lang="ts">
  /* A new event, or an event's details (ADR 0074): name, day and times, the user's set, where, who's
     playing, a link, notes, its status and when to be reminded. */
  import { untrack } from 'svelte';
  import { lib } from '../../lib/library.svelte';
  import { events } from '../../lib/events.svelte';
  import { router } from '../../lib/route.svelte';
  import { REMIND_DAYS, type EventStatus, type GlueEvent } from '../../core/library/events';

  let { id = null, day, onclose }: { id?: string | null; day: string; onclose: () => void } = $props();
  // Its values once, when it opens.
  const e = untrack(() => (id ? events.get(id) : null)), first = untrack(() => day);
  const time = (s: string | null | undefined) => (s && s.length > 10 ? s.slice(11, 16) : s && /^\d{2}:\d{2}$/.test(s) ? s : '');
  const me = (lib.alias ?? lib.profile)?.name.trim().toLowerCase() ?? '';

  let name = $state(e?.name ?? '');
  let date = $state(e?.starts.slice(0, 10) ?? first);
  let starts = $state(e ? time(e.starts) : '22:00');
  let ends = $state(time(e?.ends));
  let setStart = $state(time(e?.setStart));
  let setEnd = $state(time(e?.setEnd));
  let venue = $state(e?.venue ?? ''), address = $state(e?.address ?? ''), city = $state(e?.city ?? '');
  let lineup = $state((e?.lineup ?? []).map(l => l.name + (l.me && l.name.trim().toLowerCase() !== me ? ' (me)' : '')).join('\n'));
  let url = $state(e?.url ?? ''), notes = $state(e?.notes ?? '');
  let status = $state<EventStatus>(e?.status ?? 'planned');
  let remindDays = $state(e?.remindDays ?? REMIND_DAYS);

  function save() {
    if (!date) return;
    const at = (t: string) => (t ? date + 'T' + t : null);
    const fields: Partial<GlueEvent> & { starts: string } = {
      name: name.trim() || 'Event', starts: at(starts) ?? date, ends: at(ends), setStart: setStart || null, setEnd: setEnd || null,
      venue: venue.trim(), address: address.trim(), city: city.trim(),
      lineup: lineup.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const mine = /\s*\(me\)$/i.test(l), n = l.replace(/\s*\(me\)$/i, ''); return { name: n, ...(mine || n.toLowerCase() === me ? { me: true } : {}) }; }),
      url: url.trim(), notes, status, remindDays: Math.max(0, Math.min(60, Math.round(Number(remindDays) || 0))),
    };
    if (e) { events.update(e.id, fields); onclose(); return; }
    const made = events.create(fields);
    onclose();
    if (made) router.go('#/events/' + made.id);
  }
  const focus = (el: HTMLInputElement) => { queueMicrotask(() => el.focus()); };
</script>

<div class="scrim" role="presentation" onpointerdown={ev => { if (ev.target === ev.currentTarget) onclose(); }}>
  <div class="dlg" id="event-editor" role="dialog" aria-modal="true" aria-labelledby="ev-h" tabindex="-1" onkeydown={ev => { if (ev.key === 'Escape') { ev.preventDefault(); onclose(); } }}>
    <form onsubmit={ev => { ev.preventDefault(); save(); }}>
      <h2 id="ev-h">{e ? 'Edit the event' : 'New event'}</h2>
      <div class="grid">
        <label class="wide"><span>Name</span><input id="ev-name" bind:value={name} placeholder="Lux, Friday residency, Studio session…" use:focus autocomplete="off" /></label>
        <label><span>Day</span><input id="ev-date" type="date" bind:value={date} required /></label>
        <label><span>Status</span>
          <select id="ev-status" bind:value={status}><option value="planned">Planned</option><option value="played">Played</option><option value="cancelled">Cancelled</option></select>
        </label>
        <label><span>Doors</span><input id="ev-starts" type="time" bind:value={starts} /></label>
        <label><span>Ends</span><input id="ev-ends" type="time" bind:value={ends} /></label>
        <label><span>My set from</span><input id="ev-set-start" type="time" bind:value={setStart} /></label>
        <label><span>to</span><input id="ev-set-end" type="time" bind:value={setEnd} /></label>
        <label class="wide"><span>Venue</span><input id="ev-venue" bind:value={venue} autocomplete="off" /></label>
        <label class="wide2"><span>Address</span><input id="ev-address" bind:value={address} autocomplete="off" /></label>
        <label class="half"><span>City</span><input id="ev-city" bind:value={city} autocomplete="off" /></label>
        <label class="wide"><span>Lineup <small>one name per line; yours is marked when it's your profile's name, or add “(me)”</small></span><textarea id="ev-lineup" rows="3" bind:value={lineup}></textarea></label>
        <label class="wide"><span>Link</span><input id="ev-url" type="url" bind:value={url} placeholder="https://…" autocomplete="off" /></label>
        <label class="wide"><span>Notes</span><textarea id="ev-notes" rows="3" bind:value={notes}></textarea></label>
        <label class="wide remind"><span>Remind me</span>
          <span class="rd"><input id="ev-remind" type="number" min="0" max="60" bind:value={remindDays} /> days before, while it has no music (0: never)</span>
        </label>
      </div>
      <div class="acts">
        <button type="button" class="btn-ghost" onclick={onclose}>Cancel</button>
        <button type="submit" class="btn" id="ev-save">{e ? 'Save' : 'Add the event'}</button>
      </div>
    </form>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; }
  .dlg { width: min(640px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 20px 22px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); }
  form { display: grid; gap: 14px; }
  h2 { font-size: 20px; margin: 0; }
  .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 12px; }
  label { display: grid; gap: 4px; min-width: 0; grid-column: span 2; }
  label.wide { grid-column: 1 / -1; }
  label.wide2 { grid-column: span 3; }
  label.half { grid-column: span 1; }
  label:has(input[type="time"]) { grid-column: span 1; }
  label span { font-size: 12px; color: var(--ink-2); }
  label small { color: var(--muted); font-size: 11px; margin-left: 6px; }
  input, select, textarea { width: 100%; background: var(--ground); border: 1px solid var(--line-2); border-radius: 6px; padding: 7px 9px; font: 13.5px var(--font-sans); color: var(--ink); }
  textarea { resize: vertical; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
  .rd { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12.5px; }
  .rd input { width: 64px; }
  .acts { display: flex; gap: 8px; justify-content: flex-end; }
  @media (max-width: 560px) { label, label.wide2, label.half, label:has(input[type="time"]) { grid-column: 1 / -1; } }
</style>
