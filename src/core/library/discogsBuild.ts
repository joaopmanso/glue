/* The Discogs playlist builder (ADR 0190): from records or tracks the user picked (the seeds), a playlist of tracks like
   them, as the library's builder makes one from a song (autoplaylist.ts). Vinyl tracks have no tempo or key, so "like
   them" is by record: the same styles above all, genres, the label, years near, the artists. Then the user's rules:
   tracks per record, compilations, artists, styles, labels, formats, years, vinyl or digital. Pure. */
import { rng, tagFit } from './autoplaylist';

/** A track the builder can pick: an item of a Discogs playlist (a song id, or `dg:<release>:<position>`). */
export interface DgCandidate {
  id: string;
  /** Its record (a library song not on any record: none). */
  record: number | null;
  /** The record's names, or the song's (lower case where compared). */
  artists: string[]; labels: string[]; year: number | null;
  genres: string[]; styles: string[]; formats: string[];
  /** A compilation's track ("Various"). */
  compilation: boolean;
  digital: boolean;
  bpm: number | null;
  duration: number | null;
}

export type Have = 'vinyl' | 'digital' | 'both';
export interface BuildOptions {
  count: number;
  /** Tracks of one record: 1, 2, or any (0). */
  perRecord: number;
  compilations: boolean;
  have: Have;
  artists: string[]; artistsOnly: boolean;
  /** Empty: the seeds' own (preferred). */
  styles: string[]; stylesOnly: boolean;
  labels: string[]; formats: string[];
  years: [number | null, number | null] | null;
  /** Items to leave out (already in a Discogs playlist). */
  avoid: string[];
  randomness: number;
  seed: number;
}
export const BUILD_DEFAULTS: Omit<BuildOptions, 'seed'> = { count: 20, perRecord: 1, compilations: true, have: 'both', artists: [], artistsOnly: false, styles: [], stylesOnly: false, labels: [], formats: [], years: null, avoid: [], randomness: 0.3 };

export interface BuildResult { ids: string[]; relaxed: string[]; available: number }

const low = (xs: string[]) => xs.map(x => x.toLowerCase());
/** What the seeds have together: the styles, genres, labels, artists and their years, to be like. */
function profileOf(seeds: DgCandidate[]) {
  const all = (pick: (c: DgCandidate) => string[]) => [...new Set(seeds.flatMap(c => low(pick(c))))];
  const years = seeds.map(c => c.year).filter((y): y is number => y != null);
  const bpms = seeds.map(c => c.bpm).filter((b): b is number => b != null);
  return { styles: all(c => c.styles), genres: all(c => c.genres), labels: all(c => c.labels), artists: all(c => c.artists),
    year: years.length ? years.reduce((a, b) => a + b, 0) / years.length : null, bpm: bpms.length ? bpms.reduce((a, b) => a + b, 0) / bpms.length : null };
}

/** The rules a candidate must pass; `loose`: the steps relaxed so far. */
function passes(c: DgCandidate, o: BuildOptions, loose: { years: boolean; styles: boolean; spread: boolean }, perRecord: Map<number, number>, used: Set<string>, avoid: Set<string>): boolean {
  if (used.has(c.id) || avoid.has(c.id)) return false;
  if (o.have === 'vinyl' && c.digital) return false;
  if (o.have === 'digital' && !c.digital) return false;
  if (!o.compilations && c.compilation) return false;
  if (o.perRecord && !loose.spread && c.record != null && (perRecord.get(c.record) ?? 0) >= o.perRecord) return false;
  const has = (xs: string[], want: string[]) => !want.length || low(xs).some(x => want.includes(x));
  if (o.artistsOnly && o.artists.length && !has(c.artists, low(o.artists))) return false;
  if (o.stylesOnly && o.styles.length && !loose.styles && !has(c.styles, low(o.styles))) return false;
  if (o.labels.length && !has(c.labels, low(o.labels))) return false;
  if (o.formats.length && !has(c.formats, low(o.formats))) return false;
  const [from, to] = o.years ?? [null, null];
  if (!loose.years && (from != null || to != null) && (c.year == null || (from != null && c.year < from) || (to != null && c.year > to))) return false;
  return true;
}

/** How much a candidate is like the seeds and what's asked (higher is better). */
function score(c: DgCandidate, o: BuildOptions, p: ReturnType<typeof profileOf>): number {
  const styles = o.styles.length ? low(o.styles) : p.styles;
  let s = 4 * tagFit(low(c.styles), styles) + 1.5 * tagFit(low(c.genres), p.genres);
  if (low(c.labels).some(l => p.labels.includes(l))) s += 1.2;
  const artists = o.artists.length ? low(o.artists) : p.artists;
  if (low(c.artists).some(a => artists.includes(a))) s += o.artists.length ? 2.5 : 1;
  if (c.year != null && p.year != null) s += Math.max(0, 1 - Math.abs(c.year - p.year) / 8);
  if (c.bpm != null && p.bpm != null) s += 0.6 * Math.max(0, 1 - Math.abs(c.bpm - p.bpm) / (p.bpm * 0.08));
  return s;
}

/** The seeds first, then tracks like them, picked one by one (the best few, weighted to the top). */
export function buildDiscogs(pool: DgCandidate[], seeds: string[], o: BuildOptions): BuildResult {
  const byId = new Map(pool.map(c => [c.id, c]));
  const seedC = seeds.map(id => byId.get(id)).filter((c): c is DgCandidate => !!c);
  const p = profileOf(seedC), random = rng(o.seed), avoid = new Set(o.avoid.filter(x => !seeds.includes(x)));
  const ids: string[] = [], used = new Set<string>(), perRecord = new Map<number, number>(), relaxed: string[] = [];
  const take = (c: DgCandidate) => { ids.push(c.id); used.add(c.id); if (c.record != null) perRecord.set(c.record, (perRecord.get(c.record) ?? 0) + 1); };
  for (const c of seedC) if (!used.has(c.id)) take(c);
  const steps: [{ years: boolean; styles: boolean; spread: boolean }, string | null][] = [
    [{ years: false, styles: false, spread: false }, null],
    [{ years: true, styles: false, spread: false }, 'other years too'],
    [{ years: true, styles: true, spread: false }, 'other styles too'],
    [{ years: true, styles: true, spread: true }, 'more tracks of the same records'],
  ];
  const available = pool.filter(c => passes(c, o, steps[0][0], new Map(), new Set(), avoid)).length;
  while (ids.length < o.count) {
    let chosen: DgCandidate | null = null;
    for (const [loose, note] of steps) {
      const ok = pool.filter(c => passes(c, o, loose, perRecord, used, avoid));
      if (!ok.length) continue;
      const scored = ok.map(c => ({ c, s: score(c, o, p) + random() * 0.01 })).sort((a, b) => b.s - a.s);
      const k = Math.max(1, Math.round(1 + o.randomness * Math.min(12, scored.length - 1)));
      const top = scored.slice(0, k), temp = 0.15 + o.randomness * 1.5;
      const w = top.map(x => Math.exp((x.s - top[0].s) / temp));
      let r = random() * w.reduce((a, b) => a + b, 0), pick = 0;
      while (pick < top.length - 1 && (r -= w[pick]) > 0) pick++;
      chosen = top[pick].c;
      if (note && !relaxed.includes(note)) relaxed.push(note);
      break;
    }
    if (!chosen) break;
    take(chosen);
  }
  if (ids.length < o.count) relaxed.push('only ' + ids.length + ' track' + (ids.length === 1 ? '' : 's') + ' fit');
  return { ids, relaxed, available };
}

/** Another track for one place: the best that fits the rules and isn't in the list. */
export function replaceOne(pool: DgCandidate[], current: string[], index: number, seeds: string[], o: BuildOptions): string | null {
  const byId = new Map(pool.map(c => [c.id, c]));
  const p = profileOf(seeds.map(id => byId.get(id)).filter((c): c is DgCandidate => !!c));
  const used = new Set(current), perRecord = new Map<number, number>();
  current.forEach((id, i) => { const c = byId.get(id); if (i !== index && c?.record != null) perRecord.set(c.record, (perRecord.get(c.record) ?? 0) + 1); });
  const random = rng(o.seed + index * 7919);
  const ok = pool.filter(c => passes(c, o, { years: false, styles: false, spread: false }, perRecord, used, new Set(o.avoid)))
    .map(c => ({ c, s: score(c, o, p) + random() * 1.2 })).sort((a, b) => b.s - a.s);
  return ok[0]?.c.id ?? null;
}
