/* Track and playlist tags (ADR 0032): plain names, compared without case. A track's tags are the
   user's own list once they've edited it; before that, the ones its file or DJ library already has
   (the Grouping field, rekordbox "My Tag" in the comments, #hashtags). Pure, no DOM. */

export const MAX_TAG = 40;

/** Tidy a typed tag: trimmed, single spaces, no leading '#', at most MAX_TAG characters ('' if empty). */
export function cleanTag(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/^#+/, '').trim().slice(0, MAX_TAG).trim();
}
export const tagKey = (s: string) => cleanTag(s).toLowerCase();

/** Unique by tagKey, first spelling wins, empties dropped. */
export function uniqTags(tags: Iterable<string>): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of tags) { const t = cleanTag(raw), k = t.toLowerCase(); if (t && !seen.has(k)) { seen.add(k); out.push(t); } }
  return out;
}

/** Tags already in a file's or DJ app's fields. */
export function foundTags(f: { grouping?: string; comment?: string }): string[] {
  const out: string[] = [];
  if (f.grouping) out.push(...f.grouping.split(/[,;/|]/));
  const c = f.comment ?? '';
  // rekordbox writes My Tags into the comment as "/* Tag / Tag */".
  for (const m of c.matchAll(/\/\*(.*?)\*\//g)) out.push(...m[1].split('/'));
  for (const m of c.replace(/\/\*.*?\*\//g, ' ').matchAll(/(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu)) out.push(m[1]);
  return uniqTags(out);
}

/** What a track is tagged with. */
export function tagsOf(t: { tags?: string[]; grouping?: string; comment?: string }): string[] {
  return t.tags ?? foundTags(t);
}
export const hasTag = (tags: string[], tag: string) => { const k = tagKey(tag); return tags.some(x => x.toLowerCase() === k); };
export function addTags(tags: string[], add: string[]): string[] { return uniqTags([...tags, ...add]); }
export function removeTags(tags: string[], remove: string[]): string[] { const ks = new Set(remove.map(tagKey)); return tags.filter(t => !ks.has(t.toLowerCase())); }

/** A tag's colour: stable for its name, from the given palette. */
export function tagColor(tag: string, palette: string[]): string {
  let h = 2166136261;
  for (const ch of tagKey(tag)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return palette[(h >>> 0) % palette.length];
}

/** Counts of how tracks fall across up to three tags: regions[mask] = tracks with exactly those
    tags among `sets` (bit i = sets[i]); regions[0] = none of them. */
export function venn(trackTags: string[][], sets: string[]): number[] {
  const ks = sets.slice(0, 3).map(tagKey), regions = new Array(1 << ks.length).fill(0);
  for (const tags of trackTags) {
    const have = new Set(tags.map(t => t.toLowerCase()));
    let m = 0;
    ks.forEach((k, i) => { if (have.has(k)) m |= 1 << i; });
    regions[m]++;
  }
  return regions;
}

/** How often each tag occurs, most used first (ties by name). */
export function tagCounts(trackTags: string[][]): [string, number][] {
  const m = new Map<string, { name: string; n: number }>();
  for (const tags of trackTags) for (const t of tags) { const k = t.toLowerCase(), c = m.get(k); if (c) c.n++; else m.set(k, { name: t, n: 1 }); }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map(x => [x.name, x.n]);
}
