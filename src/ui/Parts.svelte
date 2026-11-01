<script lang="ts" module>
  /* A meta line's parts, parted by hairlines instead of middle dots (ADR 0191). Empty parts are left out; a part can
     carry its own class, id and title. */
  export type Part = string | false | null | undefined | 0 | { text: string; cls?: string; id?: string; title?: string };
</script>

<script lang="ts">
  let { items, cls = '' }: { items: Part[]; cls?: string } = $props();
  const shown = $derived(items.filter((p): p is Exclude<Part, false | null | undefined | 0> => !!p && (typeof p === 'string' || !!p.text)));
</script>

<span class={'parts ' + cls}>{#each shown as p, i (i)}{#if typeof p === 'string'}<span>{p}</span>{:else}<span class={p.cls} id={p.id} title={p.title}>{p.text}</span>{/if}{/each}</span>
