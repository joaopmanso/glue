import { describe, expect, it } from 'vitest';
import { discogsAuto, NO_RULES, parseRef, ruleValues, vinylRef, vinylTrack, type DiscogsRules } from '../src/core/library/discogsLists';
import type { DiscogsRecord, RecordMatch } from '../src/core/library/discogsMatch';

const tr = (p: string, title: string, artists: string[] = []) => ({ p, title, artists, d: null });
const rec = (o: Partial<DiscogsRecord>): DiscogsRecord => ({ id: 1, title: '', artists: [], labels: [], year: null, formats: ['Vinyl'], genres: ['Electronic'], styles: [], added: '', rating: 0, cover: '', art: '', ...o });
const records = [
  rec({ id: 1, title: 'Techno EP', artists: ['Ploy (2)'], labels: [{ name: 'Hessle Audio', catno: 'H1' }], year: 2019, styles: ['Techno'], formats: ['Vinyl', '12"'], added: '2026-10-02', tracks: [tr('A', 'Midnight'), tr('B', 'Dayglo')] }),
  rec({ id: 2, title: 'Dub LP', artists: ['Pinch'], labels: [{ name: 'Tectonic', catno: 'T2' }], year: 2010, styles: ['Dubstep'], formats: ['Vinyl', 'LP'], added: '2026-10-03', tracks: [tr('A1', 'Qawwali')] }),
  rec({ id: 3, title: 'Comp', artists: ['Various'], labels: [{ name: 'Fabric', catno: 'F3' }], year: 2015, styles: ['Techno', 'House'], formats: ['CD'], added: '2026-10-01', tracks: [tr('1', 'Guest Track', ['Guest']), tr('2', 'Other', ['Ploy'])] }),
  rec({ id: 4, title: 'No List', artists: ['Ploy'], styles: ['Techno'], added: '2026-10-04' }),
];
// Record 1's "Midnight" and record 3's "Other" are songs here.
const matchOf = (r: DiscogsRecord): RecordMatch => ({ songs: [], found: 0, tracks: r.tracks?.length ?? 0, chosen: [], byTrack: (r.tracks ?? []).map(t => (t.title === 'Midnight' ? 's1' : t.title === 'Other' ? 's3' : null)) });
const auto = (o: Partial<DiscogsRules>) => discogsAuto(records, matchOf, { ...NO_RULES, ...o });

describe('Discogs playlists (ADR 0189)', () => {
  it('a vinyl track’s item, made and read back', () => {
    expect(vinylRef(12, 'A1')).toBe('dg:12:A1');
    expect(parseRef('dg:12:A1')).toEqual({ release: 12, position: 'A1' });
    expect(parseRef('dg:12:1:2')).toEqual({ release: 12, position: '1:2' });
    expect(parseRef('s1')).toBeNull();
    expect(parseRef('dg:x:A')).toBeNull();
    const byId = new Map(records.map(r => [r.id, r]));
    expect(vinylTrack('dg:2:A1', byId)?.track.title).toBe('Qawwali');
    expect(vinylTrack('dg:2:Z9', byId)).toBeNull();
  });
  it('every track, songs as themselves, the rest as vinyl, newest record first; one without a tracklist as the whole record', () => {
    expect(auto({})).toEqual(['dg:4:', 'dg:2:A1', 's1', 'dg:1:B', 'dg:3:1', 's3']);
    const byId = new Map(records.map(r => [r.id, r]));
    expect(vinylTrack('dg:4:', byId)).toMatchObject({ whole: true, track: { title: 'No List' } });
  });
  it('by style, label, format and years', () => {
    expect(auto({ styles: ['techno'] })).toEqual(['dg:4:', 's1', 'dg:1:B', 'dg:3:1', 's3']);
    expect(auto({ labels: ['Tectonic'] })).toEqual(['dg:2:A1']);
    expect(auto({ formats: ['12"'] })).toEqual(['s1', 'dg:1:B']);
    expect(auto({ formats: ['Vinyl'], styles: ['Dubstep'] })).toEqual(['dg:2:A1']);
    expect(auto({ years: [2012, null] })).toEqual(['s1', 'dg:1:B', 'dg:3:1', 's3']);
    expect(auto({ years: [null, 2012] })).toEqual(['dg:2:A1']);
  });
  it('by artist: a compilation’s tracks by their own artists; "(2)" is the name', () => {
    expect(auto({ artists: ['Ploy'] })).toEqual(['dg:4:', 's1', 'dg:1:B', 's3']);
  });
  it('vinyl only, digital only', () => {
    expect(auto({ have: 'vinyl' })).toEqual(['dg:4:', 'dg:2:A1', 'dg:1:B', 'dg:3:1']);
    expect(auto({ have: 'digital' })).toEqual(['s1', 's3']);
  });
  it('in another order', () => {
    expect(auto({ order: 'year' })[0]).toBe('s1');
    expect(auto({ order: 'label' })[0]).toBe('dg:3:1');
  });
  it('the collection’s values for the chips, most used first, Various left out', () => {
    const v = ruleValues(records);
    expect(v.styles[0]).toBe('Techno');
    expect(v.artists).toContain('Ploy');
    expect(v.artists).not.toContain('Various');
    expect(v.formats).toContain('12"');
  });
});
