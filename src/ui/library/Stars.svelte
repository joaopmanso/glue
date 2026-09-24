<script lang="ts">
  /* Five stars in half steps. Click the left half of a star for x.5; click the current value to clear.
     `dim` shows a value that isn't the user's own (from an imported DJ library). */
  let { value, dim = false, size = 13, onset }: { value: number | null; dim?: boolean; size?: number; onset: (v: number | null) => void } = $props();
  const STAR = 'M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z';
  let hover = $state<number | null>(null);
  const shown = $derived(hover ?? value ?? 0);
  const at = (e: PointerEvent, i: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return i + (e.clientX - r.left < r.width / 2 ? 0.5 : 1);
  };
  const fill = (i: number) => Math.max(0, Math.min(1, shown - i));
  const label = (v: number | null) => v ? v + ' star' + (v === 1 ? '' : 's') : 'not rated';
</script>

<span class="stars" class:dim={dim && hover == null} role="slider" tabindex="0" aria-label="Rating" aria-valuemin="0" aria-valuemax="5" aria-valuenow={value ?? 0} aria-valuetext={label(value)}
  title={dim ? 'From your DJ library: ' + label(value) + '. Click to rate in MCO.' : label(value)}
  onpointerleave={() => (hover = null)} onpointerdown={e => e.stopPropagation()} onclick={e => e.stopPropagation()} ondblclick={e => e.stopPropagation()}
  onkeydown={e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); onset(Math.min(5, (value ?? 0) + 0.5)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); onset((value ?? 0) - 0.5 || null); }
    else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') { e.preventDefault(); e.stopPropagation(); onset(null); }
  }}>
  {#each [0, 1, 2, 3, 4] as i (i)}
    <button type="button" tabindex="-1" aria-label={'Rate ' + (i + 1)} style:width={size + 'px'} style:height={size + 'px'}
      onpointermove={e => (hover = at(e, i))}
      onclick={e => { e.stopPropagation(); const v = at(e as unknown as PointerEvent, i); onset(!dim && v === value ? null : v); hover = null; }}>
      <svg class="bg" viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} /></svg>
      <span class="fgwrap" style:width={fill(i) * 100 + '%'}><svg class="fg" viewBox="0 0 24 24" aria-hidden="true" style:width={size + 'px'} style:height={size + 'px'}><path d={STAR} /></svg></span>
    </button>
  {/each}
</span>

<style>
  .stars { display: inline-flex; gap: 1px; align-items: center; vertical-align: middle; border-radius: 3px; }
  .stars:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button { background: none; border: 0; padding: 0; cursor: pointer; position: relative; display: block; }
  .bg { width: 100%; height: 100%; display: block; fill: var(--line-2); }
  .fgwrap { position: absolute; left: 0; top: 0; bottom: 0; overflow: hidden; pointer-events: none; }
  .fg { display: block; fill: var(--warn); }
  .dim .fg { fill: var(--muted); }
</style>
