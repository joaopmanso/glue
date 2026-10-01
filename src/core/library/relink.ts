/* Songs with no file (an imported DJ library's records whose files are gone, e.g. duplicates removed since) matched
   to songs the library has, by what's known of them: title, artist, length, file name, album, size (ADR 0124).
   Each match has a certainty, 0–100, so the sure ones can be linked at once. Pure: no store, no DOM. */
import { versionOf } from './duplicates';

export interface Songish { id: string; title: string; artist: string; album: string; duration: number | null; fileName: string; size: number | null }
export interface RelinkMatch { id: string; sure: number; why: string[] }

/** Lower case, no accents, no (…)/[…] parts, no "feat. …", letters and digits only. */
const plain = (s: string) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\(([^)]*)\)|\[([^\]]*)\]/g, ' ').replace(/\b(feat|ft|featuring)\b\.?.*$/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const AUDIO = /\.(flac|wav|wave|aif|aiff|aifc|m4a|mp4|alac|mp3|aac|ogg|opus|wv|ape|dsf|dff)$/i;
/** A leading track number: "05 ", "05 - ", "1-01 ". */
const NUMBER = /^(\d{1,2}-)?\d{1,3}(\s*[-._)]\s*|\s+)/;
/** A file's name without its extension, a leading track number, or a copy's " (1)", "_1" or " copy". */
export const fileStem = (f: string) => plain((f || '').replace(/\.[^.]+$/, '').replace(/\s*(\(\d+\)|_\d|-?\s*copy)$/i, '').replace(NUMBER, ''));
/** What a song is called and by whom. With no artist, "Artist - Title" is read from its title, or from its file name
    when the import had nothing else (the user's library has both, 2026-10-01). */
function nameOf(t: Songish): { title: string; artist: string } {
  const titled = !!t.title && t.title !== t.fileName;
  const own = (titled ? t.title : t.fileName || '').replace(AUDIO, '').replace(NUMBER, '');
  const i = own.indexOf(' - ');
  if (!t.artist && i > 0) return { artist: own.slice(0, i), title: own.slice(i + 3) };
  if (!titled && i > 0) return { artist: t.artist, title: own.slice(i + 3) };
  return { artist: t.artist, title: own };
}
const titleOf = (t: Songish) => plain(nameOf(t).title);
/** The artists, each on its own: "A & B", "A, B", "A x B", "A feat. B" are the same two. */
const artistsOf = (s: string) => new Set((s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .split(/\s*(?:,|&|\+|\/|;|\band\b|\bx\b|\bvs\.?|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b)\s*/).map(a => a.replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean));
const words = (s: string) => new Set(s.split(' ').filter(w => w.length > 1));
function overlap(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / Math.max(x.size, y.size);
}

/** How sure GLUE is that `c` is the song `o` stands for, 0–100, and why. */
export function relinkScore(o: Songish, c: Songish): RelinkMatch {
  const why: string[] = [];
  let s = 0;
  const ta = titleOf(o), tb = titleOf(c), fa = fileStem(o.fileName), fb = fileStem(c.fileName);
  const sameFile = !!fa && fa === fb;
  if (ta && ta === tb) { s += 45; why.push('same title'); }
  else if (ta && tb && Math.min(ta.length, tb.length) >= 4 && (ta.includes(tb) || tb.includes(ta))) { s += 30; why.push('similar title'); }
  else { const j = overlap(ta, tb); if (j >= 0.6) { s += Math.round(25 * j); why.push('similar title'); } else if (!sameFile) return { id: c.id, sure: 0, why: [] }; }
  if (sameFile) { s += 20; why.push('same file name'); }
  const xa = nameOf(o).artist, xb = nameOf(c).artist, aa = plain(xa), ab = plain(xb);
  const sa = artistsOf(xa), sb = artistsOf(xb), common = [...sa].filter(a => sb.has(a)).length;
  if (aa && ab) {
    if (aa === ab || (common === sa.size && common === sb.size)) { s += 25; why.push('same artist'); }
    else if (common || overlap(aa, ab) >= 0.5 || aa.includes(ab) || ab.includes(aa)) { s += 15; why.push('similar artist'); }
    else { s -= 15; why.push('another artist'); }
  } else s += 8;
  if (o.duration && c.duration) {
    const d = Math.abs(o.duration - c.duration);
    if (d <= 1.5) { s += 20; why.push('same length'); }
    else if (d <= 3) { s += 14; why.push('length ' + Math.round(d) + ' s apart'); }
    else if (d <= 6) { s += 5; why.push('length ' + Math.round(d) + ' s apart'); }
    else { s -= d > 20 ? 50 : 25; why.push('length ' + Math.round(d) + ' s apart'); }
  } else s += 6;
  const la = plain(o.album), lb = plain(c.album);
  if (la && la === lb) { s += 5; why.push('same album'); }
  if (o.size && c.size && o.size === c.size) { s += 20; why.push('same size'); }
  // Another version (an instrumental, a remix, a live take): never a sure match.
  if (versionOf(o.title || o.fileName, o.album) !== versionOf(c.title || c.fileName, c.album)) { s = Math.min(s, 40); why.push('another version?'); }
  return { id: c.id, sure: Math.max(0, Math.min(100, s)), why };
}

/** For each song with no file, its likely matches among `pool`, best first (at most `max`). Two matches about as
    good as each other make neither sure. Only songs that share a title word or a file name are compared. */
export function relinkMatches(orphans: Songish[], pool: Songish[], opts: { max?: number; min?: number; not?: Set<string> } = {}): Map<string, RelinkMatch[]> {
  const max = opts.max ?? 3, min = opts.min ?? 50;
  const byWord = new Map<string, Songish[]>(), byFile = new Map<string, Songish[]>();
  const add = (m: Map<string, Songish[]>, k: string, t: Songish) => { if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(t); };
  for (const t of pool) { for (const w of words(titleOf(t))) add(byWord, w, t); add(byFile, fileStem(t.fileName), t); }
  const out = new Map<string, RelinkMatch[]>();
  for (const o of orphans) {
    const seen = new Set<string>(), cands: Songish[] = [];
    // The rarest title word: few songs to compare, and every true match has it.
    const ws = [...words(titleOf(o))].sort((a, b) => (byWord.get(a)?.length ?? 0) - (byWord.get(b)?.length ?? 0));
    for (const t of [...(byWord.get(ws[0] ?? '') ?? []), ...(byFile.get(fileStem(o.fileName)) ?? [])]) if (t.id !== o.id && !seen.has(t.id)) { seen.add(t.id); cands.push(t); }
    const ms = cands.map(c => relinkScore(o, c)).filter(m => m.sure >= min && !opts.not?.has(o.id + '>' + m.id)).sort((a, b) => b.sure - a.sure).slice(0, max);
    if (ms.length > 1 && ms[0].sure - ms[1].sure <= 3) { ms[0] = { ...ms[0], sure: Math.max(0, ms[0].sure - 10), why: [...ms[0].why, 'another song matches as well'] }; }
    if (ms.length) out.set(o.id, ms);
  }
  return out;
}
