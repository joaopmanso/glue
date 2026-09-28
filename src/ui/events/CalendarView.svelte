<script lang="ts">
  /* The calendar (ADR 0074): a month of events, what's coming and what's been; a click on a day adds
     one there. Events that need music say so. */
  import { lib } from '../../lib/library.svelte';
  import { events, fmtWhen } from '../../lib/events.svelte';
  import { router } from '../../lib/route.svelte';
  import { readPref, writePref } from '../../lib/prefs';
  import { dayKey, daysUntil, eventDay, monthGrid, needsMusic, type GlueEvent } from '../../core/library/events';
  import EventEditor from './EventEditor.svelte';
  import NeedsMusic from './NeedsMusic.svelte';

  const now = new Date();
  const saved = /^(\d{4})-(\d{2})$/.exec(readPref('calendarMonth', ''));
  let year = $state(saved ? +saved[1] : now.getFullYear());
  let month = $state(saved ? +saved[2] - 1 : now.getMonth());
  $effect(() => { writePref('calendarMonth', year + '-' + String(month + 1).padStart(2, '0')); });
  let adding = $state<string | null>(null);

  const all = $derived(events.all());
  const byDay = $derived.by(() => { const m = new Map<string, GlueEvent[]>(); for (const e of all) { const k = eventDay(e); (m.get(k) ?? m.set(k, []).get(k)!).push(e); } return m; });
  const needing = $derived(new Set(events.needing(now).map(e => e.id)));
  const upcoming = $derived(events.upcoming(now));
  const past = $derived(events.past(now).slice(0, 12));
  const weeks = $derived(monthGrid(year, month));
  const title = $derived(new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  const today = dayKey(now);
  const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 28 + i).toLocaleDateString(undefined, { weekday: 'short' }));

  function step(n: number) { const d = new Date(year, month + n, 1); year = d.getFullYear(); month = d.getMonth(); }
  function soon(e: GlueEvent) { const d = daysUntil(e, now); return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 1 ? 'in ' + d + ' days' : ''; }
  const songs = (e: GlueEvent) => events.tracksOf(e).length;
</script>

<div class="cal" id="calendar">
  <NeedsMusic />
  <header class="head">
    <h2>Calendar</h2>
    <div class="nav">
      <button type="button" class="mini" aria-label="Previous month" id="cal-prev" onclick={() => step(-1)}>‹</button>
      <b id="cal-month">{title}</b>
      <button type="button" class="mini" aria-label="Next month" id="cal-next" onclick={() => step(1)}>›</button>
      <button type="button" class="mini" onclick={() => { year = now.getFullYear(); month = now.getMonth(); }}>Today</button>
    </div>
    <button type="button" class="btn" id="new-event" disabled={lib.readOnly} onclick={() => (adding = today)}>+ New event</button>
  </header>

  <div class="body">
    <div class="month" role="grid" aria-label={title}>
      <div class="wk hd" role="row">{#each WEEKDAYS as w (w)}<span role="columnheader">{w}</span>{/each}</div>
      {#each weeks as week (dayKey(week[0]))}
        <div class="wk" role="row">
          {#each week as d (dayKey(d))}
            {@const k = dayKey(d)}
            <div class="day" role="gridcell" class:out={d.getMonth() !== month} class:today={k === today} data-day={k}>
              <button type="button" class="num" title="Add an event on this day" disabled={lib.readOnly} onclick={() => (adding = k)}>{d.getDate()}</button>
              {#each byDay.get(k) ?? [] as e (e.id)}
                <a class="echip" href={'#/events/' + e.id} data-status={e.status} class:needs={needing.has(e.id)} title={e.name + (needing.has(e.id) ? ' · needs music' : '')}>
                  {#if e.starts.length > 10}<small>{e.starts.slice(11, 16)}</small>{/if}{e.name}
                </a>
              {/each}
            </div>
          {/each}
        </div>
      {/each}
    </div>

    <aside class="lists">
      <h3>Coming up</h3>
      {#each upcoming as e (e.id)}
        {@const n = songs(e)}
        <a class="evc" href={'#/events/' + e.id} data-status={e.status} data-event={e.id}>
          <b>{e.name}</b>
          <span>{fmtWhen(e.starts)}{e.venue ? ' · ' + e.venue : ''}{e.city ? ', ' + e.city : ''}</span>
          <span class="meta">{soon(e)}{#if needing.has(e.id)}<i class="warn">needs music</i>{:else if e.status === 'planned'}<i>{n} song{n === 1 ? '' : 's'}</i>{:else}<i>{e.status}</i>{/if}</span>
        </a>
      {:else}<p class="none">Nothing planned. Add a gig with “+ New event”, or click a day.</p>{/each}
      {#if past.length}
        <h3>Been</h3>
        {#each past as e (e.id)}
          <a class="evc past" href={'#/events/' + e.id} data-status={e.status}><b>{e.name}</b><span>{fmtWhen(e.starts, { time: false })}{e.city ? ' · ' + e.city : ''}</span></a>
        {/each}
      {/if}
    </aside>
  </div>
</div>

{#if adding}<EventEditor day={adding} onclose={() => (adding = null)} />{/if}

<style>
  .cal { display: grid; gap: 14px; }
  .head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  h2 { font-size: 22px; margin: 0; }
  .nav { display: flex; align-items: center; gap: 8px; flex: 1; }
  .nav b { min-width: 150px; text-align: center; font-size: 15px; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12.5px; padding: 3px 10px; cursor: pointer; }
  .mini:hover { border-color: var(--accent); color: var(--accent); }
  .body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; }
  .month { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .wk.hd span { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--line); }
  .day { min-height: 96px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 4px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .wk .day:nth-child(7) { border-right: 0; }
  .wk:last-child .day { border-bottom: 0; }
  .day.out { background: color-mix(in srgb, var(--surface) 60%, transparent); }
  .day.out .num { color: var(--muted); opacity: .6; }
  .num { align-self: flex-start; background: none; border: 0; color: var(--ink-2); font: 12px var(--font-mono); padding: 2px 5px; border-radius: 4px; cursor: pointer; }
  .num:hover:not(:disabled) { background: var(--raised); color: var(--accent); }
  .day.today .num { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
  .echip { display: block; font-size: 12px; line-height: 1.35; padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--accent) 16%, transparent); border-left: 3px solid var(--accent); color: var(--ink); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .echip small { color: var(--ink-2); margin-right: 5px; font: 11px var(--font-mono); }
  .echip[data-status="played"] { border-left-color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, transparent); }
  .echip[data-status="cancelled"] { border-left-color: var(--muted); background: var(--raised); color: var(--muted); text-decoration: line-through; }
  .echip.needs { border-left-color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, transparent); }
  .echip:hover { filter: brightness(1.2); }
  .lists { display: grid; gap: 6px; align-content: start; }
  h3 { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 4px 0 2px; }
  .evc { display: grid; gap: 1px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; text-decoration: none; color: var(--ink); background: var(--surface); }
  .evc:hover { border-color: var(--accent); }
  .evc b { font-size: 14px; }
  .evc span { font-size: 12px; color: var(--ink-2); }
  .evc .meta { display: flex; justify-content: space-between; color: var(--muted); }
  .evc i { font-style: normal; }
  .evc i.warn { color: var(--warn); font-weight: 600; }
  .evc[data-status="cancelled"] b { text-decoration: line-through; color: var(--muted); }
  .evc.past { opacity: .75; }
  .none { color: var(--muted); font-size: 13px; }
  @media (max-width: 980px) { .body { grid-template-columns: minmax(0, 1fr); } .day { min-height: 64px; } }
  /* A phone (ADR 0078): the shell's bar says "Calendar". */
  @media (max-width: 760px) { .head h2 { display: none; } .day { min-height: 52px; } }
</style>
