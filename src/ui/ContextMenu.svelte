<script lang="ts">
  /* The page's context menu (lib/menu, ADR 0067): a panel for the menu and one for each open submenu,
     kept inside the window. Mouse and keyboard as in a desktop app: arrows, Enter, → and ← for
     submenus, a letter jumps, Esc goes back; a long submenu has a find field. */
  import { tick, untrack } from 'svelte';
  import { menu, isAction, type MenuEntry } from '../lib/menu.svelte';
  import Stars from './library/Stars.svelte';

  interface Panel {
    id: number; label: string; build: () => MenuEntry[] | Promise<MenuEntry[]>; entries: MenuEntry[] | null; failed: string;
    active: number; q: string; find: string; from: number; x: number; y: number; below: DOMRect | null; beside: DOMRect | null;
  }
  let panels = $state.raw<Panel[]>([]);
  const els: HTMLElement[] = $state([]);
  let back: HTMLElement | null = null;   // what had focus before the menu opened
  let pid = 0, timer = 0;
  /** A submenu gets its find field once it's long. */
  const FIND_AT = 8;
  const finding = (p: Panel | undefined) => !!p?.find && (p.entries ?? []).filter(isAction).length > FIND_AT;

  function load(p: Panel): Panel {
    let r: MenuEntry[] | Promise<MenuEntry[]>;
    try { r = p.build(); } catch (e) { return { ...p, entries: [], failed: (e as Error).message }; }
    if (r instanceof Promise) {
      r.then(es => set(p.id, { entries: es }), e => set(p.id, { entries: [], failed: (e as Error).message }));
      return { ...p, entries: null };
    }
    return { ...p, entries: r };
  }
  function set(id: number, patch: Partial<Panel>) { panels = panels.map(p => p.id === id ? { ...p, ...patch } : p); }

  $effect(() => {
    const at = menu.at;
    untrack(() => {
      clearTimeout(timer);
      if (!at) { if (panels.length) { panels = []; restore(); } return; }
      if (!panels.length) back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      panels = [load({ id: ++pid, label: at.label, build: at.build, entries: null, failed: '', active: -1, q: '', find: at.find, from: -1, x: at.x, y: at.y, below: at.below, beside: null })];
      void tick().then(() => { if (finding(panels[0])) focusIn(0); else els[0]?.focus({ preventScroll: true }); });
    });
  });
  // Anything else happening on the page closes it: a press outside, scrolling, resizing, leaving the page.
  $effect(() => {
    if (!menu.at) return;
    const outside = (e: Event) => {
      const t = e.target;
      if (t instanceof Element && (t.closest('.cmenu') || menu.at?.opener?.contains(t))) return;
      dismiss();
    };
    const dismissNow = () => dismiss();
    addEventListener('pointerdown', outside, true); addEventListener('scroll', outside, true);
    addEventListener('resize', dismissNow); addEventListener('blur', dismissNow); addEventListener('hashchange', dismissNow);
    return () => {
      removeEventListener('pointerdown', outside, true); removeEventListener('scroll', outside, true);
      removeEventListener('resize', dismissNow); removeEventListener('blur', dismissNow); removeEventListener('hashchange', dismissNow);
    };
  });

  function restore() { const b = back; back = null; if (b?.isConnected) b.focus({ preventScroll: true }); }
  /** Closed by something else: focus goes where that puts it. */
  function dismiss() { clearTimeout(timer); back = null; panels = []; menu.close(); }
  /** Closed by the keyboard or by choosing: focus goes back to where it was, then the choice runs. */
  function closeThen(run?: () => void) { clearTimeout(timer); panels = []; restore(); menu.close(); run?.(); }

  const views = $derived(panels.map(p => {
    const es = p.entries ?? [], q = p.q.trim().toLowerCase();
    return q ? es.filter(e => isAction(e) && (e.label + ' ' + (e.detail ?? '')).toLowerCase().includes(q)) : es;
  }));
  const usable = (level: number, i: number) => { const e = views[level]?.[i]; return !!e && isAction(e) && !e.disabled; };
  const button = (level: number, i: number) => els[level]?.querySelector<HTMLElement>('[data-i="' + i + '"]') ?? null;

  function activate(level: number, i: number, focus: boolean) {
    const p = panels[level];
    if (!p) return;
    if (p.active !== i) set(p.id, { active: i });
    const b = button(level, i);
    if (focus && !finding(p)) b?.focus({ preventScroll: true });
    b?.scrollIntoView({ block: 'nearest' });
  }
  function move(level: number, dir: 1 | -1, start?: number) {
    const p = panels[level], n = views[level]?.length ?? 0;
    if (!p || !n) return;
    let i = start ?? (p.active >= 0 ? p.active : dir === 1 ? -1 : n);
    for (let k = 0; k < n; k++) { i = ((i + dir) % n + n) % n; if (usable(level, i)) { activate(level, i, true); return; } }
  }
  async function openSub(level: number, i: number, keyboard: boolean) {
    const e = views[level]?.[i];
    if (!e || !isAction(e) || !e.sub || e.disabled) return;
    const b = button(level, i);
    if (!b) return;
    if (panels[level + 1]?.from === i) { if (keyboard) focusIn(level + 1); return; }
    const p = load({ id: ++pid, label: e.label, build: e.sub, entries: null, failed: '', active: -1, q: '', find: e.find ?? '', from: i, x: 0, y: 0, below: null, beside: b.getBoundingClientRect() });
    panels = [...panels.slice(0, level + 1).map((x, k) => k === level ? { ...x, active: i } : x), p];
    await tick();
    if (keyboard || finding(panels[level + 1])) focusIn(level + 1);
  }
  function focusIn(level: number) {
    const p = panels[level];
    if (!p) return;
    if (finding(p)) els[level]?.querySelector('input')?.focus({ preventScroll: true });
    else if (p.active < 0) move(level, 1); else activate(level, p.active, true);
  }
  function backTo(level: number) { panels = panels.slice(0, level + 1); const p = panels[level]; if (p) activate(level, p.active, true); }

  function choose(level: number, i: number) {
    const e = views[level]?.[i];
    if (!e || !isAction(e) || e.disabled) return;
    if (e.sub) { void openSub(level, i, true); return; }
    if (e.stay) {
      e.run?.();
      // Built again, so ticks and names show what just changed.
      const p = panels[level], fresh = load(p);
      panels = [...panels.slice(0, level), { ...fresh, active: p.active, q: p.q }];
      return;
    }
    closeThen(e.run);
  }
  function hover(level: number, i: number) {
    clearTimeout(timer);
    activate(level, i, true);
    const e = views[level]?.[i];
    if (e && isAction(e) && e.sub && !e.disabled) { if (panels[level + 1]?.from !== i) timer = window.setTimeout(() => void openSub(level, i, false), 140); }
    else if (panels.length > level + 1) timer = window.setTimeout(() => { panels = panels.slice(0, level + 1); }, 260);
  }
  function key(e: KeyboardEvent, level: number) {
    const p = panels[level];
    if (!p) return;
    const inFind = (e.target as HTMLElement).tagName === 'INPUT';
    e.stopPropagation();   // not the page's shortcuts (Space plays)
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(level, 1); break;
      case 'ArrowUp': e.preventDefault(); move(level, -1); break;
      case 'Home': if (!inFind) { e.preventDefault(); move(level, 1, -1); } break;
      case 'End': if (!inFind) { e.preventDefault(); move(level, -1, views[level].length); } break;
      case 'ArrowRight': if (!inFind && p.active >= 0) { e.preventDefault(); void openSub(level, p.active, true); } break;
      case 'ArrowLeft': if (!inFind && level > 0) { e.preventDefault(); backTo(level - 1); } break;
      case 'Escape':
        e.preventDefault();
        if (inFind && p.q) set(p.id, { q: '', active: -1 });
        else if (level > 0) backTo(level - 1);
        else closeThen();
        break;
      case 'Enter': {
        e.preventDefault();
        let i = p.active;
        if (i < 0 && inFind) i = views[level].findIndex((_, k) => usable(level, k));
        if (i >= 0) choose(level, i);
        break;
      }
      case ' ': if (!inFind) { e.preventDefault(); if (p.active >= 0) choose(level, p.active); } break;
      case 'Tab': e.preventDefault(); closeThen(); break;
      default:
        // A letter jumps to the next entry starting with it.
        if (!inFind && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const es = views[level], k0 = p.active, c = e.key.toLowerCase();
          for (let k = 1; k <= es.length; k++) {
            const j = (k0 + k + es.length) % es.length, x = es[j];
            if (isAction(x) && !x.disabled && x.label.toLowerCase().startsWith(c)) { activate(level, j, true); break; }
          }
        }
    }
  }

  /** Where a panel goes: at the pointer, under what opened it, or beside its item; always inside the window. */
  function place(node: HTMLElement, p: Panel) {
    const put = () => {
      const w = node.offsetWidth, h = node.offsetHeight, W = innerWidth, H = innerHeight;
      let x: number, y: number;
      if (p.beside) {
        x = p.beside.right + 4; if (x + w > W - 8) x = p.beside.left - w - 4;
        y = p.beside.top - 5;
      } else if (p.below) {
        x = p.x; y = p.below.bottom + 2;
        if (y + h > H - 8 && p.below.top - h - 2 >= 8) y = p.below.top - h - 2;
      } else {
        x = p.x; y = p.y;
        if (x + w > W - 8) x = x - w;
        if (y + h > H - 8) y = y - h;
      }
      node.style.left = Math.max(8, Math.min(x, W - w - 8)) + 'px';
      node.style.top = Math.max(8, Math.min(y, H - h - 8)) + 'px';
    };
    put();
    const ro = new ResizeObserver(put);
    ro.observe(node);
    return { update(np: Panel) { p = np; put(); }, destroy() { ro.disconnect(); } };
  }
</script>

{#each panels as p, level (p.id)}
  {@const es = views[level] ?? []}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="cmenu" class:finding={finding(p)} role="menu" aria-label={p.label} tabindex="-1" bind:this={els[level]} use:place={p}
    onkeydown={e => key(e, level)} oncontextmenu={e => e.preventDefault()}
    onpointerenter={() => { clearTimeout(timer); const up = panels[level - 1]; if (up && up.active !== p.from) set(up.id, { active: p.from }); }}>
    {#if finding(p)}<input class="cfind" type="search" placeholder={p.find} aria-label={p.find} value={p.q} oninput={e => set(p.id, { q: e.currentTarget.value, active: -1 })}>{/if}
    <div class="clist">
      {#if !p.entries}<p class="cnote">Loading…</p>
      {:else if p.failed}<p class="cnote">{p.failed}</p>
      {:else if !es.length}<p class="cnote">{p.q ? 'Nothing matches.' : 'Nothing here.'}</p>
      {:else}
        {#each es as e, i (i)}
          {#if 'sep' in e}<hr>
          {:else if 'head' in e}<p class="chead" title={e.head}>{e.head}</p>
          {:else if 'colors' in e}
            <div class="ccolors" role="group" aria-label="Colour">
              <button type="button" class="sw none" class:on={!e.value} title="No colour" aria-label="No colour" onclick={() => closeThen(() => e.pick(null))}>∅</button>
              {#each e.colors as c (c)}<button type="button" class="sw" class:on={e.value === c} style:background={c} title="Colour" aria-label="Colour" onclick={() => closeThen(() => e.pick(c))}></button>{/each}
            </div>
          {:else if 'stars' in e}
            <div class="cstars"><span>Rating</span><Stars value={e.stars} dim={e.dim} size={15} onset={v => closeThen(() => e.pick(v))} /></div>
          {:else}
            <button type="button" class="citem" class:on={p.active === i} class:danger={e.danger} data-i={i} tabindex="-1" {...e.attrs}
              role={e.checked != null ? 'menuitemcheckbox' : 'menuitem'} aria-checked={e.checked ?? undefined} aria-disabled={e.disabled || undefined}
              aria-haspopup={e.sub ? 'menu' : undefined} aria-expanded={e.sub ? panels[level + 1]?.from === i : undefined} title={e.title}
              style:padding-left={!p.q && e.depth ? 6 + e.depth * 14 + 'px' : null}
              onpointerenter={() => hover(level, i)} onclick={() => choose(level, i)}>
              <span class="cmark" aria-hidden="true">{#if e.checked}✓{:else if e.color}<i style:background={e.color}></i>{/if}</span>
              <span class="clabel">{e.label}{#if p.q && e.detail}<small>{e.detail}</small>{/if}</span>
              <span class="chint">{e.hint ?? ''}</span>
              <span class="carrow" aria-hidden="true">{e.sub ? '›' : ''}</span>
            </button>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
{/each}

<style>
  .cmenu { position: fixed; left: 0; top: 0; z-index: 80; min-width: 210px; max-width: min(380px, calc(100vw - 16px)); max-height: calc(100vh - 16px); display: flex; flex-direction: column; gap: 4px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 7px; padding: 5px; box-shadow: 0 14px 36px rgb(0 0 0 / .5); font-size: 13px; outline: none; }
  .cmenu.finding { width: 300px; }
  .clist { display: grid; gap: 1px; overflow-y: auto; min-height: 0; overscroll-behavior: contain; }
  .finding .clist { max-height: min(60vh, 520px); }
  .cfind { background: var(--ground); border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink); font-size: 12.5px; padding: 5px 8px; outline: none; }
  .cfind:focus { border-color: var(--accent); }
  .citem { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto 8px; align-items: center; gap: 7px; background: none; border: 0; border-radius: 4px; padding: 5px 8px 5px 6px; text-align: left; color: var(--ink); cursor: pointer; font: inherit; outline: none; }
  .citem.on { background: color-mix(in srgb, var(--accent) 17%, transparent); }
  .citem[aria-disabled="true"] { color: var(--muted); cursor: default; }
  .citem[aria-disabled="true"].on { background: color-mix(in srgb, var(--muted) 10%, transparent); }
  .citem.danger { color: var(--bad); }
  .clabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clabel small { display: block; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
  .chint { color: var(--muted); font-size: 11.5px; white-space: nowrap; }
  .carrow { color: var(--muted); font-size: 14px; line-height: 1; }
  .cmark { color: var(--accent); font-size: 12px; font-weight: 700; display: grid; place-items: center; }
  .cmark i { width: 9px; height: 9px; border-radius: 50%; display: block; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 4px 2px; }
  .chead { margin: 0; padding: 5px 8px 3px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cnote { margin: 0; padding: 6px 8px; color: var(--muted); font-size: 12.5px; }
  .ccolors { display: flex; gap: 5px; padding: 5px 8px 6px 27px; flex-wrap: wrap; }
  .sw { width: 16px; height: 16px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
  .sw.on { border-color: var(--ink); }
  .sw.none { background: none; border-color: var(--line-2); color: var(--muted); font-size: 10px; line-height: 1; }
  .sw.none.on { border-color: var(--ink); }
  .cstars { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 8px 4px 27px; color: var(--ink-2); }
</style>
