/* A collection, a playlist or any songs at a glance (the user's list, 2026-09-27): how many, how long,
   how big; who and what (artists, albums, labels, genres, years); formats and quality; tempo and keys;
   when they came in; how much is rated and tagged. Pure: plain per-track facts. */

export type Grade = 'ok' | 'warn' | 'bad' | 'info';
export interface StatTrack {
  duration: number | null; size: number | null;
  artist: string; album: string; label: string; genre: string; year: string;
  /** What the Format filter calls it (MP3, FLAC, WAV…), and whether it's lossless. */
  format: string; lossless: boolean | null;
  grade: Grade | null;
  bpm: number | null;
  /** A key as shown ('8A', 'Am'…), or null. */
  key: string | null;
  addedAt: string;
  rating: number | null;
  tags: string[];
  /** Has its file here. */
  linked: boolean;
}

export interface Stats {
  count: number;
  total: number;                 // seconds, known lengths only
  unknownLength: number;
  size: number;                  // bytes, known sizes only
  artists: number; albums: number; labels: number; genres: number;
  topArtists: [string, number][]; topLabels: [string, number][]; topGenres: [string, number][];
  /** Songs per year of release, oldest first; and per decade. */
  years: [string, number][]; decades: [string, number][];
  formats: [string, number][];   // most first
  lossless: number;
  grades: Record<Grade | 'none', number>;
  bpm: { min: number; max: number; avg: number; median: number } | null;
  /** Songs per BPM step (from the lowest step with songs to the highest). */
  bpmSteps: { from: number; n: number }[];
  keys: [string, number][];      // most first
  /** Songs added per month ('2026-09'), oldest first. */
  added: [string, number][];
  rated: number; tagged: number; noFile: number;
}

const TOP = 10, BPM_STEP = 5;

/** Values by count, most first (ties by name); blanks aren't counted. `fold`: the same value in any case. */
function counts(values: string[], fold = true): [string, number][] {
  const m = new Map<string, { name: string; n: number }>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const k = fold ? v.toLowerCase() : v, e = m.get(k);
    if (e) e.n++; else m.set(k, { name: v, n: 1 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map(e => [e.name, e.n]);
}

export function stats(ts: StatTrack[]): Stats {
  const lens = ts.map(t => t.duration).filter((d): d is number => d != null && d > 0);
  const sizes = ts.map(t => t.size).filter((s): s is number => s != null && s > 0);
  const artists = counts(ts.map(t => t.artist)), albums = counts(ts.map(t => t.album)), labels = counts(ts.map(t => t.label)), genres = counts(ts.map(t => t.genre));
  const yearOf = (y: string) => (/\b(1[89]\d\d|20\d\d)\b/.exec(y) ?? [])[1] ?? '';
  const years = counts(ts.map(t => yearOf(t.year)), false).sort((a, b) => a[0].localeCompare(b[0]));
  const decades = counts(ts.map(t => { const y = yearOf(t.year); return y ? y.slice(0, 3) + '0s' : ''; }), false).sort((a, b) => a[0].localeCompare(b[0]));
  const grades = { ok: 0, warn: 0, bad: 0, info: 0, none: 0 };
  for (const t of ts) grades[t.grade ?? 'none']++;
  const bpms = ts.map(t => t.bpm).filter((b): b is number => b != null && b > 0).sort((a, b) => a - b);
  let bpmSteps: Stats['bpmSteps'] = [];
  if (bpms.length) {
    const lo = Math.floor(bpms[0] / BPM_STEP) * BPM_STEP, hi = Math.floor(bpms[bpms.length - 1] / BPM_STEP) * BPM_STEP;
    bpmSteps = Array.from({ length: (hi - lo) / BPM_STEP + 1 }, (_, i) => ({ from: lo + i * BPM_STEP, n: 0 }));
    for (const b of bpms) bpmSteps[(Math.floor(b / BPM_STEP) * BPM_STEP - lo) / BPM_STEP].n++;
  }
  const mid = bpms.length >> 1;
  return {
    count: ts.length,
    total: lens.reduce((a, b) => a + b, 0), unknownLength: ts.length - lens.length,
    size: sizes.reduce((a, b) => a + b, 0),
    artists: artists.length, albums: albums.length, labels: labels.length, genres: genres.length,
    topArtists: artists.slice(0, TOP), topLabels: labels.slice(0, TOP), topGenres: genres.slice(0, TOP),
    years, decades,
    formats: counts(ts.map(t => t.format), false),
    lossless: ts.filter(t => t.lossless).length,
    grades,
    bpm: bpms.length ? { min: bpms[0], max: bpms[bpms.length - 1], avg: bpms.reduce((a, b) => a + b, 0) / bpms.length, median: bpms.length % 2 ? bpms[mid] : (bpms[mid - 1] + bpms[mid]) / 2 } : null,
    bpmSteps,
    keys: counts(ts.map(t => t.key ?? ''), false),
    added: counts(ts.map(t => /^\d{4}-\d{2}/.test(t.addedAt) ? t.addedAt.slice(0, 7) : ''), false).sort((a, b) => a[0].localeCompare(b[0])),
    rated: ts.filter(t => t.rating != null && t.rating > 0).length,
    tagged: ts.filter(t => t.tags.length > 0).length,
    noFile: ts.filter(t => !t.linked).length,
  };
}
