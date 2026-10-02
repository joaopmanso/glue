/* Names, judged one way everywhere: Duplicates, No file linked, joining a collection, the cover look-up. Before, five
   rules disagreed: "Frankie & Johnny" and "Frankie And Johnny" were one song for No file linked, two for Duplicates and
   joining; "Feather" lost its title to the "feat." rule; a name in another script (Japanese, Cyrillic…) came out
   empty, so such songs all looked alike (measured on the user's collection, 2026-10-02). */
const ACCENTS = /[̀-ͯ]/g;
const lower = (s: string | null | undefined) => (s || '').toLowerCase().normalize('NFKD').replace(ACCENTS, '');
// "&" and "and" left out alike: "A & B" is "A and B", and also "A, B" (artists listed either way).
const spaced = (s: string) => s.replace(/&|\band\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** A featuring credit, up to the next bracket: "Song ft. X (Remix)" keeps "(Remix)". */
const FEATURING = /\b(feat|ft|featuring)\b\.?[^()[\]]*/g;

/** Lowercase letters and digits of any script, one space apart, without accents, "&" or "and". Joining a collection
    (`trackKey`) and playlist names. */
export const fold = (s: string | null | undefined) => spaced(lower(s));

/** Words that make another version of a song (the user, 2026-09-30: an instrumental and the vocal, a studio and a
    live take, a 4- and a 7-minute version were grouped as duplicates). Read from the title's (…) and […] parts and
    what follows " - ", so a name like "Clean Bandit" never counts; "live" also from the album ("Live at …"). */
const MARK = /\b(instrumental|inst|a ?cappella|acappella|acapella|live|unplugged|remix|dub|vip|bootleg|acoustic|demo|extended|radio edit|radio version|edit|rework|flip|mashup|karaoke|reprise|clean version|clean)\b/g;
const SAME_MARK: Record<string, string> = { inst: 'instrumental', 'a cappella': 'acapella', acappella: 'acapella', 'radio edit': 'edit', 'radio version': 'edit', 'clean version': 'clean' };
export function versionOf(title: string, album = ''): string {
  const t = (title || '').toLowerCase();
  const parts = [...t.matchAll(/[([]([^)\]]*)[)\]]/g)].map(m => m[1]).join(' ') + ' ' + t.split(/\s[-–—]\s/).slice(1).join(' ');
  const marks = new Set<string>();
  for (const m of parts.matchAll(MARK)) { const w = m[1].replace(/\s+/g, ' '); marks.add(SAME_MARK[w] ?? w); }
  if (/\blive\b/.test((album || '').toLowerCase())) marks.add('live');
  return [...marks].sort().join(',');
}

/** What a (…) part may say without naming another recording: the release's words and a year, besides the version
    words (`versionOf` judges those) and a featuring credit. */
const RELEASE = /\b(album|version|original|mix|single|lp|ep|mono|stereo|re ?master(ed)?|digital(ly)?|mastered|explicit|bonus|track|deluxe|edition|anniversary|expanded)\b/g;
const saysNothing = (inside: string) => /^\s*(feat|ft|featuring|with)\b/.test(inside) || !inside.replace(MARK, ' ').replace(RELEASE, ' ').replace(/[^\p{L}]+/gu, '');

/** A song's or an artist's name as GLUE compares it (Duplicates, No file linked): `fold`, without […] parts (labels,
    catalogue numbers), a featuring credit, or (…) parts that only say the release or the version ("(Album Version)",
    "(Remastered 2009)", "(Extended Mix)", "(1909-34)"). Other (…) parts are part of the name: "(Live at Hyde Park)",
    "(BBC Session)", "(Remixed by …)", "(Numa Crew)" (without them, about a quarter of the new "probable" groups on
    the user's collection were other recordings). A name that's all brackets stays itself. */
export function songName(s: string | null | undefined): string {
  const t = lower(s).replace(FEATURING, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\(([^)]*)\)/g, (m, inside: string) => saysNothing(inside) ? ' ' : m);
  return spaced(t) || fold(s);
}

/** Without any (…) or […] part or a featuring credit: for finding a cover, where releases are named every which way
    ("Album (Deluxe Edition)", "Album [Remastered]"). */
export const bare = (s: string | null | undefined) => spaced(lower(s).replace(FEATURING, ' ').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')) || fold(s);
