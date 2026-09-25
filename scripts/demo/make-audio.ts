/* The demo library for GLUE's homepage media (not shipped): ~24 short synthetic tracks with real
   tempos, keys and structure (kick, clap, hats, bass, chords, a pluck line), made as masters here
   and turned into a realistic mix of formats with ffmpeg:
   genuine FLAC / AIFF, MP3 320 and 128, AAC, WAVs transcoded from MP3 (the lossy wall),
   96 kHz FLACs upsampled from 44.1, and one song saved twice under different names (a duplicate).
   Plus a rekordbox XML with ratings, cue points, tags (My Tag comments) and playlists.
   Artists, titles and labels are made up.  Run:  node scripts/demo/make-audio.ts  */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, 'out'), MASTERS = join(OUT, 'masters'), FILES = join(OUT, 'Sets');
const SR = 44100, SECS = 42;

// Minor / major scale degrees and chord progressions (as scale degrees).
const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface Spec { artist: string; title: string; album: string; genre: string; label: string; year: number; bpm: number; tonic: number; minor: boolean; format: string; rating: number; tags: string[]; energy: number }
const S = (artist: string, title: string, genre: string, bpm: number, key: string, format: string, rating: number, tags: string[], energy = 0.7, label = 'Tidal Works'): Spec => {
  const minor = key.endsWith('m'), tonic = NOTES.indexOf(key.replace(/m$/, ''));
  return { artist, title, album: title + ' EP', genre, label, year: 2019 + (title.length % 7), bpm, tonic, minor, format, rating, tags, energy };
};
export const TRACKS: Spec[] = [
  S('Mara Sol', 'Tidewater', 'Deep House', 120, 'Am', 'flac', 5, ['Warm up', 'Vocal']),
  S('Kinetic Parlour', 'Night Bus', 'House', 124, 'Fm', 'flac', 4, ['Peak']),
  S('Ostin', 'Red Meridian', 'Techno', 130, 'Dm', 'aiff', 5, ['Peak', 'Dark'], 0.9),
  S('Lumen Drift', 'Coastline', 'Deep House', 118, 'C', 'mp3-320', 4, ['Warm up'], 0.5),
  S('Harbour Signals', 'Low Light', 'Minimal', 126, 'Gm', 'flac', 3, ['Dark']),
  S('Velvet Array', 'Undertow', 'House', 123, 'Em', 'wav-transcode', 3, ['Vocal']),
  S('Noa Varela', 'Salt & Glass', 'Deep House', 121, 'Bbm', 'flac', 4, ['Warm up', 'Vocal']),
  S('Parallel Rooms', 'Afterhours', 'Techno', 132, 'Cm', 'mp3-128', 2, ['Peak'], 0.95),
  S('The Quiet Engine', 'Satellite Kiss', 'Disco', 117, 'F', 'aac-256', 4, ['Warm up', 'Disco']),
  S('Iris Kalm', 'Second Sun', 'House', 125, 'A', 'flac', 5, ['Peak', 'Vocal']),
  S('Hollow Coast', 'Paper Planes', 'Breaks', 128, 'Ebm', 'flac-upsampled', 3, ['Breaks']),
  S('Mara Sol', 'Pale Blue', 'Deep House', 119, 'Dm', 'flac', 4, ['Warm up']),
  S('Ostin', 'Ferrous', 'Techno', 131, 'Am', 'aiff', 4, ['Dark', 'Peak'], 0.9),
  S('Solenne', 'Carousel', 'Disco', 116, 'G', 'mp3-320', 3, ['Disco']),
  S('Kinetic Parlour', 'Stairwell', 'House', 124, 'Cm', 'wav-transcode', 2, []),
  S('Delta Nova', 'Glass Houses', 'Minimal', 127, 'F#m', 'flac', 4, ['Dark']),
  S('Juno Reyes', 'Open Water', 'Deep House', 122, 'E', 'flac', 5, ['Vocal', 'Warm up']),
  S('Arcadia Bloc', 'Ultraviolet', 'Techno', 134, 'Gm', 'mp3-128', 3, ['Peak'], 1),
  S('Lumen Drift', 'Amber Hour', 'House', 123, 'D', 'flac-upsampled', 4, ['Peak']),
  S('Theo Marlowe', 'Slow Motion', 'Disco', 118, 'Bm', 'flac', 4, ['Disco', 'Vocal']),
  S('Harbour Signals', 'Tunnel Vision', 'Techno', 129, 'Em', 'flac', 5, ['Dark', 'Peak'], 0.9),
  S('Noa Varela', 'Magnolia', 'House', 125, 'Ab', 'aac-256', 4, ['Vocal']),
  S('Velvet Array', 'Night Garden', 'Deep House', 120, 'Fm', 'flac', 3, ['Warm up']),
  S('Iris Kalm', 'Heatwave', 'House', 126, 'Bb', 'mp3-320', 5, ['Peak', 'Vocal']),
];
// The same recording twice: a FLAC and a lower-quality MP3 under another name.
export const DUPLICATE = { of: 9, artist: 'Iris Kalm', title: 'Second Sun (promo)', format: 'mp3-128' };

// ---- a small synth ------------------------------------------------------------------------------------
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function render(s: Spec, seed: number): Float32Array[] {
  const n = SR * SECS, L = new Float32Array(n), R = new Float32Array(n), rnd = rng(seed);
  const beat = 60 / s.bpm, bar = beat * 4, scale = s.minor ? MINOR : MAJOR;
  const prog = s.minor ? [0, 5, 2, 6] : [0, 4, 5, 3];            // i-VI-III-VII  /  I-V-vi-IV
  const root = 45 + s.tonic;                                      // around A2
  const chordOf = (b: number) => { const d = prog[Math.floor(b) % 4]; return [0, 2, 4].map(k => root + 12 + scale[(d + k) % 7] + (d + k >= 7 ? 12 : 0)); };
  const add = (i: number, l: number, r: number) => { if (i >= 0 && i < n) { L[i] += l; R[i] += r; } };
  const intro = 4 * bar, e = s.energy;
  // Kick: pitch sweep + click, every beat (after a short intro of hats and pads).
  for (let t = 0; t < SECS; t += beat) {
    if (t < intro * 0.5) continue;
    const i0 = Math.round(t * SR);
    for (let k = 0; k < SR * 0.28; k++) { const x = k / SR, f = 48 + 110 * Math.exp(-x * 40), v = Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 9) * 0.9; add(i0 + k, v, v); }
  }
  // Clap on 2 and 4; hats on off-beats (and 16ths when the energy is up).
  for (let t = beat; t < SECS; t += beat * 2) {
    if (t < intro) continue;
    const i0 = Math.round(t * SR);
    for (let k = 0; k < SR * 0.18; k++) { const x = k / SR, v = (rnd() * 2 - 1) * Math.exp(-x * 28) * 0.35; add(i0 + k, v, v * 0.9); }
  }
  let hp = 0, hq = 0;
  for (let t = 0; t < SECS; t += beat / (e > 0.8 ? 4 : 2)) {
    const off = Math.abs((t / beat) % 1 - 0.5) < 1e-6, i0 = Math.round(t * SR), g = off ? 0.3 : 0.12 * e;
    for (let k = 0; k < SR * 0.12; k++) {
      const w = rnd() * 2 - 1; hp = w - hq; hq = w;   // a crude high-pass: bright noise up to the top
      const v = hp * Math.exp(-k / SR * 38) * g; add(i0 + k, v * (0.8 + 0.2 * rnd()), v);
    }
  }
  // A ride on every beat (long, bright tail) and a noise riser into each 8-bar section: real highs.
  let rp = 0, rq = 0;
  for (let t = intro; t < SECS; t += beat) {
    const i0 = Math.round(t * SR);
    for (let k = 0; k < SR * 0.45; k++) { const w = rnd() * 2 - 1; rp = w - rq; rq = w; const x = k / SR, v = rp * (Math.exp(-x * 7) * 0.09 + Math.sin(2 * Math.PI * 7400 * x) * Math.exp(-x * 10) * 0.02); add(i0 + k, v, v * 0.95); }
  }
  let np = 0, nq = 0;
  for (let s8 = 8 * bar; s8 < SECS; s8 += 8 * bar) {
    const i0 = Math.round((s8 - 2 * bar) * SR), len = Math.round(2 * bar * SR);
    for (let k = 0; k < len; k++) { const w = rnd() * 2 - 1; np = w - nq; nq = w; const v = np * (k / len) ** 2 * 0.12; add(i0 + k, v * 0.9, v); }
  }
  // Bass: the chord root on the off-beat eighths, a saw through a one-pole low-pass.
  let bl = 0;
  for (let t = intro * 0.5; t < SECS; t += beat) {
    const f = hz(chordOf(t / bar)[0] - 12), i0 = Math.round((t + beat / 2) * SR);
    for (let k = 0; k < SR * beat * 0.45; k++) {
      const x = k / SR, saw = 2 * ((f * x) % 1) - 1, env = Math.min(1, x * 200) * Math.exp(-x * 4);
      bl += (saw - bl) * 0.08; const v = bl * env * 0.45; add(i0 + k, v, v);
    }
  }
  // Pads: detuned saws per chord, one bar each, soft attack; wider on the right.
  for (let b = 0; b * bar < SECS; b++) {
    const notes = chordOf(b), i0 = Math.round(b * bar * SR), len = Math.round(bar * SR);
    const ph = notes.map(() => [rnd(), rnd()]);
    let pl = 0, pr = 0;
    for (let k = 0; k < len; k++) {
      const x = k / SR, env = Math.min(1, x * 3) * Math.min(1, (bar - x) * 6);
      let l = 0, r = 0;
      notes.forEach((m, j) => { const f = hz(m); l += 2 * ((f * 1.003 * x + ph[j][0]) % 1) - 1; r += 2 * ((f * 0.997 * x + ph[j][1]) % 1) - 1; });
      pl += (l - pl) * 0.05; pr += (r - pr) * 0.05;
      add(i0 + k, pl * env * 0.07, pr * env * 0.07);
    }
  }
  // A pluck arpeggio in the second half (the "hook").
  for (let t = SECS * 0.45; t < SECS; t += beat / 2) {
    const ch = chordOf(t / bar), m = ch[Math.floor(t / (beat / 2)) % 3] + 12, f = hz(m), i0 = Math.round(t * SR);
    for (let k = 0; k < SR * 0.3; k++) { const x = k / SR, v = Math.sin(2 * Math.PI * f * x + 0.6 * Math.sin(2 * Math.PI * f * 2 * x)) * Math.exp(-x * 9) * 0.12; add(i0 + k, v * 0.7, v); }
  }
  // Master: gentle saturation, normalise to −1 dBFS.
  let peak = 0;
  for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const g = 0.89 / peak;
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}

function wav24(chs: Float32Array[]): Buffer {
  const n = chs[0].length, b = Buffer.alloc(44 + n * 6);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 6, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 6, 28); b.writeUInt16LE(6, 32); b.writeUInt16LE(24, 34); b.write('data', 36); b.writeUInt32LE(n * 6, 40);
  for (let i = 0, o = 44; i < n; i++) for (const c of chs) { const v = Math.max(-8388608, Math.min(8388607, Math.round(c[i] * 8388607))); b.writeIntLE(v, o, 3); o += 3; }
  return b;
}

const ff = (...a: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
const tags = (s: { artist: string; title: string; album: string; genre: string; year: number; label: string }, comment: string) =>
  ['-metadata', 'artist=' + s.artist, '-metadata', 'title=' + s.title, '-metadata', 'album=' + s.album, '-metadata', 'genre=' + s.genre, '-metadata', 'date=' + s.year, '-metadata', 'publisher=' + s.label, '-metadata', 'comment=' + comment];
export const fileName = (s: { artist: string; title: string }, ext: string) => (s.artist + ' - ' + s.title).replace(/[\\/:*?"<>|&]/g, '').replace(/\s+/g, ' ') + '.' + ext;
const EXT: Record<string, string> = { flac: 'flac', aiff: 'aiff', 'mp3-320': 'mp3', 'mp3-128': 'mp3', 'aac-256': 'm4a', 'wav-transcode': 'wav', 'flac-upsampled': 'flac' };

function encode(master: string, s: Spec & { title: string }, format: string, out: string) {
  const c = s.tags.length ? '/* ' + s.tags.join(' / ') + ' */' : '';
  const meta = tags(s, c);
  switch (format) {
    case 'flac': return ff('-i', master, '-sample_fmt', 's16', ...meta, out);
    case 'aiff': return ff('-i', master, '-c:a', 'pcm_s24be', '-write_id3v2', '1', ...meta, out);
    case 'mp3-320': return ff('-i', master, '-c:a', 'libmp3lame', '-b:a', '320k', ...meta, out);
    case 'mp3-128': return ff('-i', master, '-c:a', 'libmp3lame', '-b:a', '128k', ...meta, out);
    case 'aac-256': return ff('-i', master, '-c:a', 'aac', '-b:a', '256k', ...meta, out);
    case 'wav-transcode': {   // an MP3 128 decoded back to WAV: lossless label, lossy content
      const tmp = out + '.tmp.mp3'; ff('-i', master, '-c:a', 'libmp3lame', '-b:a', '128k', tmp);
      ff('-i', tmp, '-c:a', 'pcm_s16le', ...meta, out); rmSync(tmp); return;
    }
    case 'flac-upsampled': return ff('-i', master, '-af', 'aresample=96000:resampler=soxr', '-sample_fmt', 's32', '-ar', '96000', ...meta, out);
  }
}

// ---- rekordbox XML: ratings, cue points, tags in comments, playlists -------------------------------
function rekordboxXml(entries: { s: Spec; file: string; ms: number }[]): string {
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const tracks = entries.map((e, i) => {
    const beat = 60 / e.s.bpm, bar = beat * 4, cues = [0, 4, 8, 16].map((b, k) => `<POSITION_MARK Name="${['Intro', 'Drop', 'Break', 'Hook'][k]}" Type="0" Start="${(b * bar).toFixed(3)}" Num="${k}" Red="${[40, 230, 250, 60][k]}" Green="${[200, 60, 200, 120][k]}" Blue="${[80, 60, 40, 240][k]}"/>`).join('');
    const loop = `<POSITION_MARK Name="" Type="4" Start="${(8 * bar).toFixed(3)}" End="${(12 * bar).toFixed(3)}" Num="-1"/>`;
    const key = NOTES[e.s.tonic] + (e.s.minor ? 'm' : '');
    return `<TRACK TrackID="${i + 1}" Name="${esc(e.s.title)}" Artist="${esc(e.s.artist)}" Album="${esc(e.s.album)}" Genre="${esc(e.s.genre)}" Label="${esc(e.s.label)}" Year="${e.s.year}" AverageBpm="${e.s.bpm.toFixed(2)}" Tonality="${key}" Rating="${[0, 51, 102, 153, 204, 255][e.s.rating]}" TotalTime="${Math.round(e.ms / 1000)}" Comments="${esc(e.s.tags.length ? '/* ' + e.s.tags.join(' / ') + ' */' : '')}" Location="file://localhost/C:/Users/dj/Music/Sets/${encodeURIComponent(e.file)}">${cues}${loop}</TRACK>`;
  });
  const idx = (pred: (s: Spec) => boolean) => entries.map((e, i) => pred(e.s) ? `<TRACK Key="${i + 1}"/>` : '').join('');
  const pl = (name: string, pred: (s: Spec) => boolean) => `<NODE Name="${name}" Type="1" KeyType="0" Entries="${entries.filter(e => pred(e.s)).length}">${idx(pred)}</NODE>`;
  return `<?xml version="1.0" encoding="UTF-8"?><DJ_PLAYLISTS Version="1.0.0"><PRODUCT Name="rekordbox" Version="7.1.0"/><COLLECTION Entries="${entries.length}">${tracks.join('')}</COLLECTION>
<PLAYLISTS><NODE Type="0" Name="ROOT" Count="3">${pl('Warm-up', s => s.tags.includes('Warm up'))}${pl('Peak time', s => s.tags.includes('Peak'))}
<NODE Name="Gigs 2026" Type="0" Count="2">${pl('Lisbon rooftop', s => s.bpm < 124)}${pl('Berlin basement', s => s.genre === 'Techno' || s.tags.includes('Dark'))}</NODE></NODE></PLAYLISTS></DJ_PLAYLISTS>`;
}

// ---- run ---------------------------------------------------------------------------------------------
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(MASTERS, { recursive: true }); mkdirSync(FILES, { recursive: true });
const entries: { s: Spec; file: string; ms: number }[] = [];
TRACKS.forEach((s, i) => {
  const master = join(MASTERS, i + '.wav');
  writeFileSync(master, wav24(render(s, 1000 + i)));
  const file = fileName(s, EXT[s.format]);
  encode(master, s, s.format, join(FILES, file));
  entries.push({ s, file, ms: SECS * 1000 });
  process.stdout.write('.');
});
{ // the duplicate: same master as its original, another name, another format
  const o = TRACKS[DUPLICATE.of], s = { ...o, artist: DUPLICATE.artist, title: DUPLICATE.title };
  encode(join(MASTERS, DUPLICATE.of + '.wav'), s, DUPLICATE.format, join(FILES, fileName(s, 'mp3')));
}
writeFileSync(join(OUT, 'rekordbox.xml'), rekordboxXml(entries));
rmSync(MASTERS, { recursive: true });
console.log('\n' + entries.length + ' tracks + 1 duplicate in ' + FILES);
