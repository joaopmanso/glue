/* A synthetic GLUE folder for the performance budgets (ADR 0058): one profile and one collection of
   `tracks` songs, the same for the same seed. It has what a real collection has: 256 shards of
   tracks and analyses, nested folders and playlists (some imported), three DJ-app imports with their
   BPM, key and rating, tags, every quality grade, songs without a file or not analysed yet. The songs'
   music folder isn't connected, so nothing gets analysed or played: this is for the library itself.
   Used by e2e/perf.spec.ts (served to the page) and scripts/synth-glue.ts (written to a folder). */
import { ANALYSIS_VERSION, SCHEMA, VERDICT_VERSION, type AnalysisSummary, type Collection, type HomeIndex, type List, type Profile, type Source, type SourceApp, type SourceTrack, type Track, shardOf } from '../src/store/types';

export interface Synthetic {
  /** Path inside the GLUE folder → the file's text. */
  files: Map<string, string>;
  profileId: string; collectionId: string;
  tracks: number; lists: number;
}

/** mulberry32: small, fast, and the same everywhere. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SYL = ['ka', 'lo', 'mi', 'ra', 'ven', 'dor', 'sa', 'ti', 'mon', 'el', 'ze', 'no', 'bri', 'ta', 'lux', 'ar', 'ko', 'fe', 'nu', 'ril', 'os', 'jam', 'dee', 'va'];
const WORDS = ['Night', 'Drive', 'Echo', 'Deep', 'Signal', 'Rise', 'Motion', 'Lights', 'Pulse', 'Horizon', 'Dust', 'Gold', 'Blue', 'Heat', 'Rain', 'Glass', 'Shadow', 'Fire', 'Tide', 'Orbit', 'Velvet', 'Storm', 'Neon', 'Mirror', 'Paradise', 'Static', 'Wave', 'Silence', 'Riot', 'Bloom'];
const MIXES = ['', '', '', ' (Original Mix)', ' (Extended Mix)', ' (Dub)', ' (Remix)', ' (VIP)', ' (Edit)'];
const GENRES = ['House', 'Tech House', 'Deep House', 'Techno', 'Melodic Techno', 'Drum & Bass', 'Dubstep', 'Garage', 'Breaks', 'Disco', 'Nu Disco', 'Afro House', 'Minimal', 'Trance', 'Progressive House', 'Electro', 'Hip Hop', 'Funk', 'Jungle', 'Ambient'];
const TAGS = ['warm-up', 'peak', 'closing', 'vocal', 'dark', 'uplifting', 'groovy', 'classic', 'banger', 'chill', 'latin', 'percussive'];
const FORMATS: { ext: string; container: string; codec: string; lossless: boolean; sr: number; bits: number; kbps: number }[] = [
  { ext: 'mp3', container: 'MP3', codec: 'MPEG-1 Layer III', lossless: false, sr: 44100, bits: 0, kbps: 320 },
  { ext: 'mp3', container: 'MP3', codec: 'MPEG-1 Layer III', lossless: false, sr: 44100, bits: 0, kbps: 192 },
  { ext: 'flac', container: 'FLAC', codec: 'FLAC', lossless: true, sr: 44100, bits: 16, kbps: 900 },
  { ext: 'flac', container: 'FLAC', codec: 'FLAC', lossless: true, sr: 96000, bits: 24, kbps: 2800 },
  { ext: 'aiff', container: 'AIFF', codec: 'PCM', lossless: true, sr: 44100, bits: 16, kbps: 1411 },
  { ext: 'wav', container: 'WAVE', codec: 'PCM', lossless: true, sr: 48000, bits: 24, kbps: 2304 },
  { ext: 'm4a', container: 'MP4', codec: 'AAC', lossless: false, sr: 44100, bits: 0, kbps: 256 },
];
const GRADES: { grade: AnalysisSummary['grade']; label: string; headline: string; w: number }[] = [
  { grade: 'ok', label: 'Genuine', headline: 'Full bandwidth, as the format promises.', w: 70 },
  { grade: 'warn', label: 'Probably upscaled', headline: 'Cut at 19.5 kHz: likely from a lossy source.', w: 15 },
  { grade: 'bad', label: 'Fake lossless', headline: 'Cut at 16 kHz: a lossy file saved as lossless.', w: 10 },
  { grade: 'info', label: 'Lossy', headline: 'A lossy file, as expected.', w: 5 },
];
const KEYS_CAMELOT = ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A', '1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '10B', '11B', '12B'];

export function synthetic(tracks: number, seed = 1): Synthetic {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const hex = (n: number) => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16); return s; };
  const name = (parts: number) => Array.from({ length: parts }, () => pick(SYL)).join('').replace(/^./, c => c.toUpperCase());
  const iso = (daysAgo: number) => new Date(Date.UTC(2026, 8, 26) - daysAgo * 864e5).toISOString();

  const files = new Map<string, string>();
  const put = (path: string, v: unknown) => files.set(path, JSON.stringify(v));
  const pid = hex(16), cid = hex(16), rootId = 'synthroot';

  // Artists and labels, reused across songs as in a real collection.
  const artists = Array.from({ length: Math.max(20, Math.round(tracks / 7)) }, () => name(2 + Math.floor(r() * 2)) + (r() < 0.2 ? ' & ' + name(2) : ''));
  const labels = Array.from({ length: Math.max(10, Math.round(tracks / 60)) }, () => name(2) + pick([' Records', ' Music', ' Recordings', '']));

  const trackMap = new Map<string, Track>(), analysisMap = new Map<string, AnalysisSummary>();
  const ids: string[] = [];
  for (let i = 0; i < tracks; i++) {
    const id = hex(16), f = pick(FORMATS), artist = pick(artists);
    const title = pick(WORDS) + (r() < 0.6 ? ' ' + pick(WORDS) : '') + pick(MIXES);
    const duration = 150 + r() * 330, size = Math.round(duration * f.kbps * 125);
    const unlinked = r() < 0.05;
    const fileName = `${artist} - ${title}.${f.ext}`;
    const t: Track = {
      id, status: unlinked ? 'unlinked' : 'linked', rootId: unlinked ? null : rootId, relPath: unlinked ? null : `${pick(GENRES)}/${fileName}`,
      importPath: r() < 0.6 ? `C:/Users/dj/Music/${fileName}` : null, fileName, size, mtime: 1.7e12 + Math.floor(r() * 5e10),
      title, artist, album: r() < 0.7 ? pick(WORDS) + ' ' + pick(['EP', 'LP', 'Remixes', 'Vol. 1']) : '', genre: pick(GENRES), label: r() < 0.8 ? pick(labels) : '',
      comment: '', year: String(1995 + Math.floor(r() * 31)), duration,
      format: { container: f.container, codec: f.codec, lossless: f.lossless, sampleRate: f.sr, bits: f.bits, bitrate: f.kbps, channels: 2 },
      addedAt: iso(r() < 0.05 ? r() * 29 : 30 + r() * 1100), sources: [],
      ...(r() < 0.3 ? { rating: Math.round(r() * 10) / 2 || 0.5 } : {}),
      ...(r() < 0.2 ? { tags: [...new Set([pick(TAGS), ...(r() < 0.4 ? [pick(TAGS)] : [])])] } : {}),
      ...(r() < 0.05 ? { notes: 'Good for ' + pick(TAGS) } : {}),
    };
    trackMap.set(id, t); ids.push(id);
    if (!unlinked && r() < 0.92) {
      let w = r() * 100, g = GRADES[0];
      for (const x of GRADES) { if (w < x.w) { g = x; break; } w -= x.w; }
      const bpm = Math.round((70 + r() * 105) * 100) / 100;
      analysisMap.set(id, {
        v: ANALYSIS_VERSION, vv: VERDICT_VERSION, at: iso(r() * 30), grade: g.grade, label: g.label, headline: g.headline,
        fc: g.grade === 'ok' ? f.sr / 2 : g.grade === 'bad' ? 16000 : 19500, wall: g.grade !== 'ok', full: g.grade === 'ok',
        effBits: f.lossless ? f.bits : null, declaredBits: f.bits, origin: g.grade === 'bad' ? 'MP3 128 kbps' : '',
        bpm, key: r() < 0.95 ? { tonic: Math.floor(r() * 12), mode: r() < 0.6 ? 'minor' : 'major', margin: r(), tuning: 0 } : null,
        findings: g.grade === 'ok' ? [] : [{ sev: g.grade === 'bad' ? 'bad' : 'warn', title: g.headline }],
        fileSize: size, fileMtime: t.mtime!, fp: r() < 0.8,
      } as AnalysisSummary);
    }
  }

  // Three DJ apps' imports: what each said about its songs.
  const sources: Source[] = [];
  for (const [app, share, label] of [['rekordbox', 0.6, 'rekordbox.xml'], ['engine', 0.4, 'Engine Library'], ['traktor', 0.2, 'collection.nml']] as [SourceApp, number, string][]) {
    const sid = hex(16), sts: SourceTrack[] = [];
    for (const id of ids) {
      if (r() >= share) continue;
      const t = trackMap.get(id)!;
      sts.push({ externalId: String(sts.length + 1), trackId: id, bpm: r() < 0.9 ? Math.round((70 + r() * 105) * 100) / 100 : null, key: r() < 0.85 ? pick(KEYS_CAMELOT) : null,
        rating: r() < 0.3 ? Math.ceil(r() * 5) : null, playCount: Math.floor(r() * 40), cues: Math.floor(r() * 8), dateAdded: t.addedAt.slice(0, 10), path: t.importPath ?? `C:/Music/${t.fileName}` });
      t.sources.push(sid);
    }
    sources.push({ schemaVersion: SCHEMA, id: sid, app, name: app[0].toUpperCase() + app.slice(1), fileName: label, importedAt: iso(40), tracks: sts, lists: 0 });
  }

  // Folders and playlists: a few top-level folders (one per import and some of the user's own),
  // playlists up to three levels deep, 20–300 songs each.
  const lists: List[] = [];
  const mkList = (kind: List['kind'], nm: string, parentId: string | null, origin: List['origin'], n: number): List => {
    const items: string[] = [];
    const seen = new Set<string>();
    for (let k = 0; k < n; k++) { const id = pick(ids); if (!seen.has(id)) { seen.add(id); items.push(id); } }
    const l: List = { schemaVersion: SCHEMA, id: hex(16), kind, name: nm, parentId, position: lists.filter(x => x.parentId === parentId).length, notes: '', items, origin, createdAt: iso(r() * 400),
      ...(r() < 0.15 ? { color: pick(['#ff6b6b', '#3ecf8e', '#7cc7ff', '#a78bfa']) } : {}) };
    lists.push(l);
    return l;
  };
  const target = Math.max(12, Math.round(tracks / 170));
  const tops = [...sources.map(s => mkList('folder', s.name, null, { sourceId: s.id, externalId: 'root' }, 0)), mkList('folder', 'Gigs', null, null, 0), mkList('folder', 'Crates', null, null, 0)];
  const folders = [...tops];
  while (lists.length < target) {
    const parent = pick(folders), depth = (() => { let d = 0, p: string | null = parent.id; while (p) { d++; p = lists.find(x => x.id === p)?.parentId ?? null; } return d; })();
    if (depth < 3 && r() < 0.15) folders.push(mkList('folder', pick(WORDS) + ' ' + pick(['sets', 'crate', 'mood', 'era']), parent.id, parent.origin ? { sourceId: parent.origin.sourceId, externalId: hex(6) } : null, 0));
    else mkList('playlist', pick(WORDS) + ' ' + pick(WORDS) + (r() < 0.3 ? ' ' + (2020 + Math.floor(r() * 7)) : ''), parent.id, parent.origin ? { sourceId: parent.origin.sourceId, externalId: hex(6) } : null, 20 + Math.floor(r() * 280));
  }
  for (const s of sources) s.lists = lists.filter(l => l.origin?.sourceId === s.id).length;

  // The files, as the store writes them.
  const home: HomeIndex = { schemaVersion: SCHEMA, profiles: [{ id: pid, name: 'Synthetic', color: '#7cc7ff' }], lastProfile: pid };
  const profile: Profile = { schemaVersion: SCHEMA, id: pid, name: 'Synthetic', color: '#7cc7ff', createdAt: iso(1200), collections: [{ id: cid, name: `Synthetic ${tracks}` }], lastCollection: cid };
  const coll: Collection = { schemaVersion: SCHEMA, id: cid, name: `Synthetic ${tracks}`, createdAt: iso(1200),
    roots: [{ id: rootId, name: 'Music', absPath: 'D:/Music', handleKey: 'root:' + rootId, addedAt: iso(1200) }], tags: [...TAGS], autoAnalyse: false };
  const base = `profiles/${pid}/collections/${cid}`;
  put('mco.json', home);
  put(`profiles/${pid}/profile.json`, profile);
  put(`${base}/collection.json`, coll);
  const shard = <T>(dir: string, m: Map<string, T>) => {
    const by = new Map<string, Record<string, T>>();
    for (const [id, v] of m) { const k = shardOf(id); let o = by.get(k); if (!o) by.set(k, o = {}); o[id] = v; }
    for (const [k, items] of by) put(`${base}/${dir}/${k}.json`, { schemaVersion: SCHEMA, items });
  };
  shard('tracks', trackMap);
  shard('analysis', analysisMap);
  for (const l of lists) put(`${base}/lists/${l.id}.json`, l);
  for (const s of sources) put(`${base}/sources/${s.id}.json`, s);
  return { files, profileId: pid, collectionId: cid, tracks, lists: lists.length };
}
