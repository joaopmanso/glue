/* The cover look-up's reference for GLUE Home's Rust (crates/glue-engine/src/covers.rs, ADR 0086, 0156): the website's
   own functions (src/core/library/coverSearch.ts, names.ts `bare`, home/ui/lookup.ts's kept name) run on names in
   several scripts and shapes, and on services' answers, into tests/golden/covers.json. crates/glue-engine/tests/
   covers_golden.rs replays it: the same keys (they name what's kept, `f/<hash>.txt`), addresses and picks. Fails when
   what it records isn't what's committed. Regenerate (on purpose): GOLDEN=1 npx vitest run tests/covers.golden.test.ts */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookupKey, norm, pick, same, searchUrl, SERVICES, type CoverQuery } from '../src/core/library/coverSearch';
import { bare } from '../src/core/library/names';
import { sha256 } from '../src/core/hash';

const OUT = join(__dirname, 'golden', 'covers.json');

const NAMES = [
  'Daft Punk', 'The Beatles', 'Beyoncé', 'Sigur Rós', 'Simon & Garfunkel', 'Simon and Garfunkel', 'AC/DC', 'Guns N’ Roses',
  'Random Access Memories (Deluxe Edition)', 'Abbey Road [2019 Remix]', 'Song ft. Someone (Remix)', 'Feather', 'Featuring Me',
  'Get Lucky feat. Pharrell Williams', 'Album with Strings', 'the the', 'Øystein Sevåg', '坂本龍一', 'Кино', 'ﬁve ½ ① ™',
  '  spaced   out  ', '(all brackets)', '[label 123]', '', 'Ⅻ Roman', 'Ça va', 'Mötley Crüe', 'İstanbul', 'ΣΊΣΥΦΟΣ',
];
const QUERIES: CoverQuery[] = [
  { artist: 'Daft Punk', album: 'Random Access Memories (Deluxe Edition)', title: 'Get Lucky' },
  { artist: 'Daft Punk', album: '', title: 'Get Lucky feat. Pharrell Williams' },
  { artist: 'Simon & Garfunkel', album: 'Bridge Over Troubled Water', title: '' },
  { artist: '', album: 'No Artist', title: 'x' },
  { artist: 'A', album: '', title: '' },
  { artist: '坂本龍一', album: '戦場のメリークリスマス', title: '' },
  { artist: 'Weird "Quotes"', album: 'Al"bum', title: '' },
  { artist: 'The Beatles', album: 'Abbey Road [2019 Remix]', title: '' },
];
const PAIRS: [string, string][] = [
  ['Random Access Memories', 'Random Access Memories (10th Anniversary Edition)'], ['Abbey Road', 'Abbey Road Deluxe'],
  ['ABC', 'ABCD'], ['Beyoncé', 'Beyonce'], ['The Beatles', 'Beatles'], ['', 'x'], ['Kino', 'Кино'], ['Lost', 'Lost in Space'],
];
// Answers as each service gives them (trimmed to what `pick` reads).
const ANSWERS: { service: 'deezer' | 'itunes' | 'musicbrainz'; q: CoverQuery; answer: unknown }[] = [
  { service: 'deezer', q: QUERIES[0], answer: { data: [
    { title: 'Random Access Memories', artist: { name: 'Someone Else' }, cover_xl: 'https://e-cdns-images.dzcdn.net/wrong.jpg' },
    { title: 'Random Access Memories (Drumless Edition)', artist: { name: 'Daft Punk' }, cover_big: 'https://e-cdns-images.dzcdn.net/ram.jpg' },
  ] } },
  { service: 'deezer', q: QUERIES[1], answer: { data: [{ title: 'Get Lucky (Radio Edit)', artist: { name: 'Daft Punk' }, album: { cover_xl: 'https://e-cdns-images.dzcdn.net/gl.jpg' } }] } },
  { service: 'deezer', q: QUERIES[2], answer: { data: [{ title: 'Other', artist: { name: 'Simon & Garfunkel' }, cover_xl: 'x' }] } },
  { service: 'itunes', q: QUERIES[2], answer: { results: [{ collectionName: 'Bridge over Troubled Water', artistName: 'Simon and Garfunkel', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg' }] } },
  { service: 'itunes', q: QUERIES[1], answer: { results: [{ trackName: 'Get Lucky', artistName: 'Daft Punk, Pharrell Williams & Nile Rodgers', artworkUrl100: 'https://is1-ssl.mzstatic.com/x/100x100bb.png' }] } },
  { service: 'musicbrainz', q: QUERIES[7], answer: { releases: [
    { id: 'r-wrong', title: 'Abbey Road', 'artist-credit': [{ name: 'Tribute Band' }] },
    { id: 'r-1', title: 'Abbey Road', 'artist-credit': [{ name: 'The Beatles' }] },
  ] } },
  { service: 'musicbrainz', q: QUERIES[1], answer: { recordings: [{ title: 'Get Lucky', 'artist-credit': [{ name: 'Daft Punk' }, { name: 'Pharrell Williams' }], releases: [{ id: 'rel-9' }] }] } },
  { service: 'musicbrainz', q: QUERIES[1], answer: { recordings: [{ title: 'Get Lucky', 'artist-credit': [{ name: 'Daft Punk' }] }] } },
  { service: 'deezer', q: QUERIES[0], answer: null },
  { service: 'itunes', q: QUERIES[0], answer: { results: 'not a list' } },
];

async function record() {
  return {
    names: NAMES.map(n => ({ in: n, bare: bare(n), norm: norm(n) })),
    queries: await Promise.all(QUERIES.map(async q => {
      const key = lookupKey(q);
      return { q, key, file: key ? 'f/' + (await sha256(key)).slice(0, 32) + '.txt' : null, urls: Object.fromEntries(SERVICES.map(s => [s, searchUrl(s, q)])) };
    })),
    same: PAIRS.map(([a, b]) => ({ a, b, same: same(a, b) })),
    picks: ANSWERS.map(x => ({ ...x, pick: pick(x.service, x.q, x.answer) })),
  };
}

describe('the cover look-up, as GLUE Home must do it (ADR 0156)', () => {
  it('matches what’s recorded', async () => {
    const got = JSON.stringify(await record(), null, 1) + '\n';
    if (process.env.GOLDEN) writeFileSync(OUT, got);
    expect(existsSync(OUT)).toBe(true);
    expect(got).toBe(readFileSync(OUT, 'utf8'));
  });
});
