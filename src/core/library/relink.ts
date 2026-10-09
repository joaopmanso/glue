/* Songs with no file (an imported DJ library's records whose files are gone, e.g. duplicates removed since) matched
   to songs the library has, by what's known of them: title, artist, length, file name, album, size (ADR 0124).
   Each match has a certainty, 0–100, so the sure ones can be linked at once. Pure: no store, no DOM. */
import { fold, songName, versionOf } from './names';

export interface Songish { id: string; title: string; artist: string; album: string; duration: number | null; fileName: string; size: number | null }
export interface RelinkMatch { id: string; sure: number; why: string[] }

const AUDIO = /\.(flac|wav|wave|aif|aiff|aifc|m4a|mp4|alac|mp3|aac|ogg|opus|wv|ape|dsf|dff)$/i;
/** A leading track number: "05 ", "05 - ", "1-01 ". */
const NUMBER = /^(\d{1,2}-)?\d{1,3}(\s*[-._)]\s*|\s+)/;
/** A file's name without its extension, a leading track number, or a copy's " (1)", "_1" or " copy". */
export const fileStem = (f: string) => songName((f || '').replace(/\.[^.]+$/, '').replace(/\s*(\(\d+\)|_\d|-?\s*copy)$/i, '').replace(NUMBER, ''));
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
const titleOf = (t: Songish) => songName(nameOf(t).title);
/** The artists, each on its own: "A & B", "A, B", "A x B", "A feat. B" are the same two. */
const artistsOf = (s: string) => new Set((s || '')
  .split(/\s*(?:,|&|\+|\/|;|\band\b|\bx\b|\b(?:vs|feat|ft)\b\.?|\bfeaturing\b|\bwith\b)\s*/i).map(fold).filter(Boolean));
const words = (s: string) => new Set(s.split(' ').filter(w => w.length > 1));
function overlap(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / Math.max(x.size, y.size);
}

/** What a song is compared by, worked out once per song (2026-10-07: worked out again for every pair, "No file
    linked" took seconds on a library of 13,000 songs, and froze the page as the library kept changing). */
interface Keyed { s: Songish; title: string; titleWords: Set<string>; joined: string; file: string; artist: string; artists: Set<string>; album: string; version: string }
/** A title without its spaces: "Ruff House" is "Ruffhouse" (the user's Engine DJ record and the copy kept, 2026-10-09). */
const joinedOf = (title: string) => title.replace(/ /g, '');
function keyed(t: Songish): Keyed {
  const title = titleOf(t), artist = nameOf(t).artist;
  return { s: t, title, titleWords: words(title), joined: joinedOf(title), file: fileStem(t.fileName), artist: songName(artist), artists: artistsOf(artist), album: songName(t.album), version: versionOf(t.title || t.fileName, t.album) };
}
function overlapWords(x: Set<string>, y: Set<string>): number {
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / Math.max(x.size, y.size);
}

/** How sure GLUE is that `c` is the song `o` stands for, 0–100, and why. */
export function relinkScore(o: Songish, c: Songish): RelinkMatch { return scoreKeyed(keyed(o), keyed(c)); }
function scoreKeyed(ko: Keyed, kc: Keyed): RelinkMatch {
  const o = ko.s, c = kc.s;
  const why: string[] = [];
  let s = 0;
  const ta = ko.title, tb = kc.title, fa = ko.file, fb = kc.file;
  const sameFile = !!fa && fa === fb;
  if (ta && (ta === tb || (ko.joined.length >= 4 && ko.joined === kc.joined))) { s += 45; why.push('same title'); }
  else if (ta && tb && Math.min(ta.length, tb.length) >= 4 && (ta.includes(tb) || tb.includes(ta))) { s += 30; why.push('similar title'); }
  else { const j = overlapWords(ko.titleWords, kc.titleWords); if (j >= 0.6) { s += Math.round(25 * j); why.push('similar title'); } else if (!sameFile) return { id: c.id, sure: 0, why: [] }; }
  if (sameFile) { s += 20; why.push('same file name'); }
  const aa = ko.artist, ab = kc.artist;
  const sa = ko.artists, sb = kc.artists, common = [...sa].filter(a => sb.has(a)).length;
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
  const la = ko.album, lb = kc.album;
  if (la && la === lb) { s += 5; why.push('same album'); }
  if (o.size && c.size && o.size === c.size) { s += 20; why.push('same size'); }
  // Another version (an instrumental, a remix, a live take): never a sure match.
  if (ko.version !== kc.version) { s = Math.min(s, 40); why.push('another version?'); }
  return { id: c.id, sure: Math.max(0, Math.min(100, s)), why };
}

export interface RelinkOpts { max?: number; min?: number; not?: Set<string> }
/** For each song with no file, its likely matches among `pool`, best first (at most `max`). Two matches about as
    good as each other make neither sure. Only songs that share a title word or a file name are compared. */
export function relinkMatches(orphans: Songish[], pool: Songish[], opts: RelinkOpts = {}): Map<string, RelinkMatch[]> {
  return relinkIndex(pool)(orphans, opts);
}
/** `relinkMatches` with the library's songs indexed once: the songs with no file can then be matched a few at a time
    (the page keeps answering meanwhile). */
export function relinkIndex(pool: Songish[]): (orphans: Songish[], opts?: RelinkOpts) => Map<string, RelinkMatch[]> {
  const byWord = new Map<string, Keyed[]>(), byFile = new Map<string, Keyed[]>(), byJoined = new Map<string, Keyed[]>();
  const add = (m: Map<string, Keyed[]>, k: string, t: Keyed) => { if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(t); };
  for (const p of pool) { const t = keyed(p); for (const w of t.titleWords) add(byWord, w, t); add(byFile, t.file, t); add(byJoined, t.joined, t); }
  return (orphans, opts = {}) => matchAgainst(orphans, byWord, byFile, byJoined, opts);
}
function matchAgainst(orphans: Songish[], byWord: Map<string, Keyed[]>, byFile: Map<string, Keyed[]>, byJoined: Map<string, Keyed[]>, opts: RelinkOpts): Map<string, RelinkMatch[]> {
  const max = opts.max ?? 3, min = opts.min ?? 50;
  const out = new Map<string, RelinkMatch[]>();
  for (const s of orphans) {
    const o = keyed(s), seen = new Set<string>(), cands: Keyed[] = [];
    // The rarest title word some other song has: few songs to compare, and every true match has it. A word no other
    // song has ("INGOT_HM": "hm") left the song with nothing to compare at all.
    const ws = [...o.titleWords].filter(w => byWord.has(w)).sort((a, b) => byWord.get(a)!.length - byWord.get(b)!.length);
    for (const t of [...(byWord.get(ws[0] ?? '') ?? []), ...(byFile.get(o.file) ?? []), ...(byJoined.get(o.joined) ?? [])]) if (t.s.id !== s.id && !seen.has(t.s.id)) { seen.add(t.s.id); cands.push(t); }
    const ms = cands.map(c => scoreKeyed(o, c)).filter(m => m.sure >= min && !opts.not?.has(s.id + '>' + m.id)).sort((a, b) => b.sure - a.sure).slice(0, max);
    if (ms.length > 1 && ms[0].sure - ms[1].sure <= 3) { ms[0] = { ...ms[0], sure: Math.max(0, ms[0].sure - 10), why: [...ms[0].why, 'another song matches as well'] }; }
    if (ms.length) out.set(s.id, ms);
  }
  return out;
}
