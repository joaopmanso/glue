/* Engine DJ's cues, loops and beat grid (`PerformanceData`, one row per song; vault/research/engine-dj-write-back.md,
   from libdjinterop's encoders and the user's songs). Positions are samples; seconds are samples / the sample rate.
   - quickCues (zlib, big-endian): 8 hot cues (label, offset, A R G B), then the main cue;
   - loops (not compressed, little-endian): 8 loops (label, start, end, start set, end set, A R G B);
   - beatData (zlib): sample rate, samples, grid set, then the default grid and the adjusted one, each a count (BE) of
     markers (offset, beat number, beats to the next, unknown; little-endian).
   Unknown bytes after these are left alone (GLUE Home keeps them when it writes, ADR 0168). */
import { gridAt, type CuePoint, type Grid } from './types';

/** qCompress: a 4-byte big-endian length, then a zlib stream. */
export async function unq(b: Uint8Array | null | undefined): Promise<Uint8Array | null> {
  if (!b || b.length <= 4) return null;
  try { return new Uint8Array(await new Response(new Blob([b.slice(4)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); }
  catch { return null; }
}

/** Reads a blob, front to back; null once past its end. */
class Reader {
  private p = 0;
  private dv: DataView;
  constructor(private b: Uint8Array) { this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  private take(n: number) { if (this.p + n > this.b.length) throw new RangeError('short'); const at = this.p; this.p += n; return at; }
  u8() { return this.b[this.take(1)]; }
  f64(le: boolean) { return this.dv.getFloat64(this.take(8), le); }
  i64(le: boolean) { return Number(this.dv.getBigInt64(this.take(8), le)); }
  i32(le: boolean) { return this.dv.getInt32(this.take(4), le); }
  text() { const n = this.u8(); return new TextDecoder().decode(this.b.subarray(this.take(n), this.p)); }
}
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
/** A colour, or none where all four channels are 0 (not set). */
const colour = (rd: Reader) => { const a = rd.u8(), r = rd.u8(), g = rd.u8(), b = rd.u8(); return a || r || g || b ? hex(r, g, b) : null; };

/** The hot cues (num 0–7) and the main cue where it was moved (a 'load' cue: where the song loads). */
export function quickCues(raw: Uint8Array, sr: number): CuePoint[] {
  const out: CuePoint[] = [];
  try {
    const rd = new Reader(raw), n = rd.i64(false);
    for (let i = 0; i < n; i++) {
      const name = rd.text(), at = rd.f64(false), color = colour(rd);
      if (at >= 0) out.push({ t: at / sr, kind: 'cue', num: i, name, color, end: null });
    }
    const main = rd.f64(false), moved = rd.u8();
    if (moved && main >= 0) out.push({ t: main / sr, kind: 'load', num: null, name: '', color: null, end: null });
  } catch { /* cut short: what was read */ }
  return out;
}
/** The loops that have a start and an end (num 0–7). */
export function loops(raw: Uint8Array, sr: number): CuePoint[] {
  const out: CuePoint[] = [];
  try {
    const rd = new Reader(raw), n = rd.i64(true);
    for (let i = 0; i < n; i++) {
      const name = rd.text(), a = rd.f64(true), b = rd.f64(true), aSet = rd.u8(), bSet = rd.u8(), color = colour(rd);
      if (aSet && bSet && a >= 0 && b > a) out.push({ t: a / sr, kind: 'loop', num: i, name, color, end: b / sr });
    }
  } catch { /* cut short */ }
  return out;
}
/** The sample rate, and the grid (the adjusted one where it has two markers, else the analysed one): its first tempo,
    beat number 0 a bar's first beat. */
export function beatData(raw: Uint8Array): { sr: number; grid: Grid | null } | null {
  try {
    const rd = new Reader(raw), sr = rd.f64(false);
    rd.f64(false); rd.u8();
    const markers = () => { const n = rd.i64(false), m: { at: number; beat: number }[] = []; for (let i = 0; i < n; i++) { const at = rd.f64(true), beat = rd.i64(true); rd.i32(true); rd.i32(true); m.push({ at, beat }); } return m; };
    const def = markers(), adj = markers(), m = adj.length >= 2 ? adj : def;
    let grid: Grid | null = null;
    if (m.length >= 2 && m[1].beat !== m[0].beat && sr > 0) {
      const spb = (m[1].at - m[0].at) / (m[1].beat - m[0].beat);
      grid = gridAt(60 * sr / spb, (m[0].at - m[0].beat * spb) / sr);
    }
    return { sr, grid };
  } catch { return null; }
}
/** The sample rate from trackData (its first number), where beatData has none. */
export function trackRate(raw: Uint8Array): number { try { return new Reader(raw).f64(false); } catch { return 0; } }

/** A song's cues and loops (in time order) and grid, from its PerformanceData row. */
export async function performance(row: { quickCues: Uint8Array | null; loops: Uint8Array | null; beatData: Uint8Array | null; trackData: Uint8Array | null }): Promise<{ cueList: CuePoint[]; grid: Grid | null }> {
  const beats = await unq(row.beatData), bd = beats ? beatData(beats) : null;
  let sr = bd?.sr ?? 0;
  if (!(sr > 0)) { const td = await unq(row.trackData); sr = td ? trackRate(td) : 0; }
  if (!(sr > 0)) return { cueList: [], grid: null };
  const q = await unq(row.quickCues);
  const cueList = [...(q ? quickCues(q, sr) : []), ...(row.loops ? loops(row.loops, sr) : [])].sort((a, b) => a.t - b.t);
  return { cueList, grid: bd?.grid ?? null };
}
