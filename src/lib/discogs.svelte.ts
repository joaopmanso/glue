/* The user's Discogs collection and wantlist (ADR 0187), as GLUE Home reads and keeps them: loaded when the Discogs view
   opens, watched every 2 s while GLUE Home reads (the list, then the covers), and matched to the open collection's songs
   (`discogsMatch.ts`). Records' covers come from GLUE Home's cache by their hash. */
import { engineClient, type DiscogsState } from './engine.svelte';
import { lib } from './library.svelte';
import { discogsMatcher, type DiscogsRecord, type RecordMatch } from '../core/library/discogsMatch';

const NONE: RecordMatch = { songs: [], found: 0, tracks: 0, chosen: [], byTrack: [] };

class Discogs {
  state = $state.raw<DiscogsState | null>(null);
  /** Asked of GLUE Home and not answered yet. */
  loading = $state(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watching = 0;

  /** GLUE Home is the engine here: the collection can be read. */
  get here() { return lib.homeRuns(); }
  /** What GLUE Home has (`refresh`: read from Discogs again now). Then watched while it reads. */
  async load(refresh = false) {
    if (!this.here) { this.state = null; return; }
    this.loading = true;
    try { this.state = await engineClient.discogs(refresh); } catch { /* not answering: as it was */ } finally { this.loading = false; }
    this.again();
  }
  private tried = false;
  /** Loaded once (the sidebar's count), not again however it went. */
  ensure() { if (!this.tried && this.here) { this.tried = true; void this.load(); } }
  /** The view shown (a count of viewers): watched while GLUE Home reads. */
  watch() { this.watching++; void this.load(); return () => { this.watching--; if (!this.watching && this.timer) { clearTimeout(this.timer); this.timer = null; } }; }
  private again() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = this.watching && this.state?.now?.reading ? setTimeout(() => void this.load(), 2000) : null;
  }

  /** Records' covers: an object URL by hash (null: none there). */
  private urls = new Map<string, string | null>();
  private asked = new Set<string>();
  version = $state(0);
  art(hash: string): string | null | undefined {
    if (!hash) return null;
    if (this.urls.has(hash)) return this.urls.get(hash);
    if (!this.asked.has(hash)) {
      this.asked.add(hash);
      void engineClient.coverBytes(hash).then(b => { this.urls.set(hash, b ? URL.createObjectURL(new Blob([b.slice()], { type: 'image/jpeg' })) : null); this.version++; });
    }
    return undefined;
  }

  /** Each record's songs in the open collection (by release id), worked out again when the library changes. */
  private matchKey = '';
  /** The record being matched by hand (its release id). */
  choosing = $state<number | null>(null);
  private matched = new Map<number, RecordMatch>();
  songsOf(r: DiscogsRecord): string[] { return this.matchOf(r).songs; }
  matchOf(r: DiscogsRecord): RecordMatch {
    const s = lib.store;
    if (!s) return NONE;
    const k = this.state?.kept, key = lib.version + ':' + (k?.readAt ?? 0) + ':' + (k?.records.length ?? 0) + ':' + (k?.wants.length ?? 0);
    if (this.matchKey !== key) {
      this.matchKey = key;
      this.matched = new Map();
      const match = discogsMatcher([...s.tracks.values()].filter(t => !t.remote).map(t => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, label: t.label, duration: t.duration, discogs: t.discogs, discogsNo: t.discogsNo })));
      for (const x of [...k?.records ?? [], ...k?.wants ?? []]) this.matched.set(x.id, match(x));
    }
    return this.matched.get(r.id) ?? NONE;
  }
}

export const discogs = new Discogs();
