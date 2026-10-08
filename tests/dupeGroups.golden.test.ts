/* The duplicates' groups and the playlists' best copies, recorded for GLUE Home's (ADR 0164): a collection with every
   rule at work, `buildGroups` and `bestLists` on it. `crates/glue-engine/tests/dupes_golden.rs` replays them byte for
   byte. GOLDEN=1 npx vitest run tests/dupeGroups.golden.test.ts after changing them (or names.ts), then port it. */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bestLists, buildGroups, type GroupInput, type Match } from '../src/core/library/duplicates';
import type { AnalysisSummary, List, Track } from '../src/store/types';

const OUT = join(__dirname, 'golden', 'dupes');

// A null bitrate on purpose (a format read without one): the score's arithmetic takes it as 0, as JavaScript does.
const lossless = (sampleRate: number, bits: number) => ({ codec: 'FLAC', container: 'FLAC', lossless: true, sampleRate, bits, bitrate: null as unknown as number, channels: 2 });
const lossy = (bitrate: number | null) => ({ codec: 'MP3', container: 'MPEG', lossless: false, sampleRate: 44100, bits: 0, bitrate: bitrate as number, channels: 2 });
const song = (id: string, o: Partial<Track> & Record<string, unknown> = {}): Track => ({ id, status: 'linked', rootId: 'r1', relPath: id + '.mp3', importPath: null, fileName: id + '.mp3', size: 1000, mtime: 1, title: '', artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', sources: [], ...o } as Track);
const graded = (grade: string): AnalysisSummary => ({ v: 3, grade, label: grade, headline: '' } as unknown as AnalysisSummary);
const m = (a: string, b: string, ber: number): Match => ({ a, b, ber, offsetSec: 0.2, overlapSec: 120.5 });

function input(): GroupInput & { lists: List[] } {
  const ts: Track[] = [
    // By sound, three copies: lossless in another folder beats the MP3 in the main one; a 24-bit one beats them all.
    song('s1', { title: 'Night Drive', artist: 'Kalo', format: lossy(320), rootId: 'main' }),
    song('s2', { title: 'Night Drive', artist: 'Kalo', format: lossless(44100, 16), fileName: 'Night Drive.flac' }),
    song('s3', { title: 'Night Drive (Album Version)', artist: 'Kalo', format: lossless(96000, 24), duration: 302.4, fileName: 'night_drive [LBL001].flac' }),
    // By sound but a remix: never a duplicate.
    song('r1', { title: 'Radix', artist: 'Linguistics', duration: 241 }),
    song('r2', { title: 'Radix (Bebida Remix)', artist: 'Linguistics', duration: 243 }),
    // By sound, the user kept them apart.
    song('k1', { title: 'Caution', artist: 'Bebida', duration: 200 }), song('k2', { title: 'Caution', artist: 'Bebida', duration: 200 }),
    // Marked by the user (no sound match), and another group the user ignored.
    song('h1', { title: 'Untitled 1', artist: '', duration: 180 }), song('h2', { title: 'Track 01', artist: '', duration: null }),
    song('i1', { title: 'Loop', artist: 'Ago', duration: 100 }), song('i2', { title: 'Loop', artist: 'Ago', duration: 100 }),
    // Probable by name: a featuring credit, a label, "&" against "and", accents; lengths within 3 s.
    song('p1', { title: 'Frankie & Johnny', artist: 'Sentient feat. Holsten', duration: 210.2 }),
    song('p2', { title: 'Frankie and Johnny [OVR004]', artist: 'Sentient', duration: 211, format: lossy(192) }),
    song('p3', { title: 'Frankie And Johnny (Live at Hyde Park)', artist: 'Sentient', duration: 212 }),   // another recording
    song('p4', { title: 'Café Noir', artist: 'Égoless', duration: 330 }), song('p5', { title: 'Cafe Noir', artist: 'Egoless', duration: 360 }),   // too far apart
    song('p6', { title: 'Cafe Noir (Remastered 2009)', artist: 'Egoless', duration: 331.5 }),
    // Confirmed by the user (a probable group), with a best chosen by the user.
    song('c1', { title: 'Overlook', artist: 'Holsten', duration: 400 }), song('c2', { title: 'Overlook', artist: 'Holsten', duration: 401, format: lossless(48000, 24) }),
    // Another computer's match (a shared collection) joins two songs here; one copy has no length.
    song('o1', { title: 'Saule', artist: 'Vortex', duration: null }), song('o2', { title: 'Saule - Extended Mix', artist: 'Vortex', duration: 420 }),
    // Names in another script; and a song whose title is all brackets.
    song('j1', { title: '夜のドライブ', artist: 'カロ', duration: 250 }), song('j2', { title: '夜のドライブ', artist: 'カロ', duration: 251 }),
    song('b1', { title: '(Intro)', artist: 'TMSV', duration: 60 }), song('b2', { title: '(intro)', artist: 'tmsv', duration: 61 }),
    // A match with a song no longer in the collection.
    song('g1', { title: 'Ghost', artist: 'Amit', duration: 300 }),
    // By sound, with concerns: a version word in one file's name, lengths 4 s apart, another artist.
    song('v1', { title: 'Benton', artist: 'Holsten', duration: 300 }),
    song('v2', { title: 'Benton', artist: 'Holsten & Amit', duration: 304, fileName: 'Benton (Instrumental).wav' }),
    // A length of 0 is known for the name groups (never within 3 s of 200), unknown for the version check.
    song('z1', { title: 'Zero', artist: 'Quartz', duration: 0 }), song('z2', { title: 'Zero', artist: 'Quartz', duration: 200 }),
  ];
  const analysis = new Map<string, AnalysisSummary>([['s1', graded('ok')], ['s2', graded('ok')], ['s3', graded('warn')], ['p2', graded('bad')], ['c2', graded('ok')]]);
  return {
    tracks: new Map(ts.map(t => [t.id, t])), analysis,
    meta: { ignoredDupes: ['i1+i2'], dupConfirmed: ['c1+c2'], dupApart: ['k1+k2'], dupManual: [['h1', 'h2']], dupBest: { 'c1+c2': 'c1' }, mainRoot: 'main' },
    matches: [m('s1', 's2', 0.05), m('s2', 's3', 0.12), m('r1', 'r2', 0.08), m('k1', 'k2', 0.02), m('i1', 'i2', 0.01), m('g1', 'gone', 0.03), m('v1', 'v2', 0.15)],
    others: [m('o1', 'o2', 0.21)],
    lists: [
      { id: 'l1', kind: 'playlist', name: 'Set', parentId: null, position: 0, notes: '', items: ['s1', 'r1', 's3', 's2', 'p1'], origin: null } as List,
      { id: 'l2', kind: 'playlist', name: 'Other', parentId: null, position: 1, notes: '', items: ['k1', 'k2'], origin: null } as List,
      { id: 'l3', kind: 'playlist', name: 'Hand', parentId: null, position: 2, notes: '', items: ['h2', 'o1', 'c2'], origin: null } as List,
    ],
  };
}

describe('the duplicates’ groups, recorded for GLUE Home’s', () => {
  it('records the groups and the playlists’ best copies (or matches the recording)', () => {
    const i = input(), groups = buildGroups(i), lists = bestLists(i.lists, groups);
    const g = { tracks: [...i.tracks.values()], analysis: Object.fromEntries(i.analysis), meta: i.meta, matches: i.matches, others: i.others, lists: i.lists, groups, bestLists: lists };
    // What the rules say.
    const key = (k: string) => groups.find(x => x.key === k);
    expect(key('s1+s2+s3')).toMatchObject({ kind: 'same', best: 's2', how: 'sound' });   // genuine before suspect: the 24-bit one is suspect
    expect(groups.some(x => x.ids.includes('r2') || x.ids.includes('k1') || x.ids.includes('i1') || x.ids.includes('p3') || x.ids.includes('p5'))).toBe(false);
    expect(key('h1+h2')).toMatchObject({ kind: 'same', how: 'hand', sure: 100 });
    expect(key('p1+p2')).toMatchObject({ kind: 'probable' });
    expect(key('c1+c2')).toMatchObject({ kind: 'same', how: 'confirmed', best: 'c1' });
    expect(key('o1+o2')).toBeUndefined();   // "Extended Mix" is another version
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, 'groups.json'), text = JSON.stringify(g, null, 1) + '\n';
    if (process.env.GOLDEN || !existsSync(file)) writeFileSync(file, text);
    else expect(text, 'GOLDEN=1 npx vitest run tests/dupeGroups.golden.test.ts, then port the change to Rust').toBe(readFileSync(file, 'utf8'));
  });
});
