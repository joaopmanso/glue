/* The Discogs playlist builder's state (ADR 0190): what it starts from (items: songs or vinyl tracks), the options, the
   result, and saving it as a Discogs playlist to arrange by hand. The pool is the collection's records' tracks (each as
   its song here, else vinyl), and with "also songs from your library" the library's songs on no record. */
import { lib } from './library.svelte';
import { view } from './view.svelte';
import { discogs } from './discogs.svelte';
import { BUILD_DEFAULTS, buildDiscogs, replaceOne, type BuildOptions, type DgCandidate } from '../core/library/discogsBuild';
import { itemOf, plainName, vinylRef } from '../core/library/discogsLists';
import type { DiscogsRecord } from '../core/library/discogsMatch';

export type BuildForm = Omit<BuildOptions, 'seed' | 'avoid'> & { avoidMine: boolean; library: boolean };
const VARIOUS = /^various(\s+artists)?$/i;
const yearOf = (s: string) => { const m = /\b(19|20)\d\d\b/.exec(s); return m ? Number(m[0]) : null; };

class DiscogsBuild {
  open = $state(false);
  seeds = $state<string[]>([]);
  form = $state<BuildForm>({ ...BUILD_DEFAULTS, avoidMine: false, library: false });
  name = $state('');
  ids = $state.raw<string[]>([]);
  relaxed = $state.raw<string[]>([]);
  available = $state(0);
  private seedNum = 1;

  /** Open with these items to start from (none: from the rules alone). */
  show(seeds: string[], name?: string) {
    this.seeds = [...new Set(seeds)];
    this.form = { ...BUILD_DEFAULTS, avoidMine: false, library: false };
    this.name = name ?? (this.seeds.length ? 'Built from ' + this.label(this.seeds[0]) : 'Built playlist');
    this.ids = []; this.relaxed = []; this.available = 0;
    this.pool();   // (which record each song is on, for the chips)
    this.open = true;
  }
  close() { this.open = false; }

  /** An item's name for its chip and its row: "Artist – Title", and its record. */
  label(item: string): string { const d = this.describe(item); return d ? (d.artist ? d.artist + ' – ' : '') + d.title : item; }
  describe(item: string): { title: string; artist: string; record: DiscogsRecord | null; digital: boolean; duration: number | null } | null {
    if (!item.startsWith('dg:')) {
      const t = lib.store?.tracks.get(item);
      const r = this.recordOfSong.get(item) ?? null;
      return t ? { title: t.title || t.fileName, artist: t.artist, record: r, digital: true, duration: t.duration } : null;
    }
    const [, rel, pos] = /^dg:(\d+):?(.*)$/.exec(item) ?? [];
    const r = discogs.byId.get(Number(rel));
    if (!r) return null;
    const t = pos ? r.tracks?.find((x, i) => (x.p || String(i + 1)) === pos) : null;
    return { title: t ? t.title : r.title, artist: (t?.artists.length ? t.artists : r.artists).map(plainName).join(', '), record: r, digital: false, duration: t?.d ?? null };
  }
  private recordOfSong = new Map<string, DiscogsRecord>();

  /** Every track the builder can pick. */
  pool(): DgCandidate[] {
    const out: DgCandidate[] = [], onRecord = new Set<string>();
    this.recordOfSong = new Map();
    for (const r of discogs.state?.kept?.records ?? []) {
      const m = discogs.matchOf(r), base = { record: r.id, labels: r.labels.map(l => l.name), year: r.year, genres: r.genres, styles: r.styles, formats: r.formats, compilation: r.artists.some(a => VARIOUS.test(a)) };
      const add = (id: string, artists: string[], duration: number | null) => {
        const t = !id.startsWith('dg:') ? lib.store?.tracks.get(id) : undefined;
        if (t) { onRecord.add(id); this.recordOfSong.set(id, r); }
        out.push({ ...base, id, artists: (artists.length ? artists : r.artists).map(plainName), digital: !!t, bpm: null, duration: t?.duration ?? duration });
      };
      if (r.tracks?.length) r.tracks.forEach((t, i) => add(itemOf(r, i, m), t.artists, t.d));
      else if (m.songs.length) for (const id of m.songs) add(id, [], null);
      else add(vinylRef(r.id, ''), [], null);
    }
    if (this.form.library) {
      for (const t of lib.store?.tracks.values() ?? []) {
        if (t.remote || t.status !== 'linked' || onRecord.has(t.id)) continue;
        out.push({ id: t.id, record: null, artists: t.artist.split(/\s*(?:,|&|\bfeat\.?|\bx\b)\s*/i).filter(Boolean), labels: t.label ? [t.label] : [], year: yearOf(t.year),
          genres: t.genre ? [t.genre] : [], styles: t.tags ?? [], formats: [], compilation: false, digital: true, bpm: null, duration: t.duration });
      }
    }
    return out;
  }
  private options(): BuildOptions {
    const avoid = this.form.avoidMine ? lib.discogsLists().flatMap(l => discogs.itemsOf(l)) : [];
    const { avoidMine: _a, library: _l, ...o } = this.form;
    return { ...o, avoid, seed: this.seedNum };
  }
  run() {
    const r = buildDiscogs(this.pool(), this.seeds, this.options());
    this.ids = r.ids; this.relaxed = r.relaxed; this.available = r.available;
  }
  again() { this.seedNum++; this.run(); }
  reroll(i: number) {
    const x = replaceOne(this.pool(), this.ids, i, this.seeds, { ...this.options(), seed: this.seedNum + i + Date.now() % 997 });
    if (!x) { lib.notice = 'Nothing else fits these rules.'; return; }
    const next = [...this.ids]; next[i] = x; this.ids = next;
  }
  remove(i: number) { this.ids = this.ids.filter((_, k) => k !== i); }
  /** A Discogs playlist with the result, opened (to arrange by hand). */
  save() {
    if (!this.ids.length) return;
    const l = lib.createDiscogsList(this.name, undefined, this.ids);
    if (!l) return;
    const s = lib.store, cur = s?.lists.get(l.id);
    if (s && cur) s.putList({ ...cur, auto: { ...this.form, seeds: this.seeds, at: new Date().toISOString() } });
    view.select({ kind: 'discogsList', id: l.id });
    lib.notice = 'Made ' + l.name + ' with ' + this.ids.length + ' track' + (this.ids.length === 1 ? '' : 's') + '.';
    this.open = false;
  }
}

export const discogsBuild = new DiscogsBuild();
