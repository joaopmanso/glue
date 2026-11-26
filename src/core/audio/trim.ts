/* Which decoded samples to keep (ADR 0060), so that decoding in a worker (mediabunny + WebCodecs)
   gives exactly what the browser's own decoder (decodeAudioData, FFmpeg) gives: the same samples,
   trimmed the same way. */

export interface KeepInput {
  /** Frames decoded. */
  total: number;
  sr: number;
  /** The first decoded sample's time (s): negative for priming samples an MP4 edit list skips. */
  firstTs: number;
  /** The track's duration as the demuxer reports it (s), after its edit list. */
  duration: number | null;
  /** An MP3's LAME-tag trim (mp3Gapless). */
  mp3?: { start: number; until: number | null } | null;
  /** A sample-exact length known from the container (Ogg's last granule): the rest is end padding. */
  exact?: number | null;
}

/** An MP4's sound track edit: the first sample's time (s, negative for the priming an edit skips) and the length it
 *  plays (s): the edit's segment duration, as the browser's decoder trims (Edge 158+ honours it; mediabunny reads only
 *  the start, so a file with more end padding than its priming came out longer: ffmpeg 9.1's AAC, 2026-11-26). Null
 *  without a sound track. The same as glue-audio's `mp4_edit`. */
export function mp4Edit(b: Uint8Array): { first: number; duration: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u32 = (o: number) => (o + 4 <= b.length ? dv.getUint32(o) : null);
  const u64 = (o: number) => (o + 8 <= b.length ? dv.getUint32(o) * 4294967296 + dv.getUint32(o + 4) : null);
  // The boxes under [start, end): [type, body start, end].
  const boxes = (start: number, end: number) => {
    const out: [string, number, number][] = [];
    let o = start;
    while (o + 8 <= end) {
      let size = u32(o), hdr = 8;
      if (size == null) break;
      const ty = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
      if (size === 1) { const s = u64(o + 8); if (s == null) break; size = s; hdr = 16; } else if (size === 0) size = end - o;
      if (size < hdr) break;
      out.push([ty, o + hdr, Math.min(end, o + size)]);
      o += size;
    }
    return out;
  };
  const moov = boxes(0, b.length).find(x => x[0] === 'moov');
  if (!moov) return null;
  const kids = boxes(moov[1], moov[2]), mvhd = kids.find(x => x[0] === 'mvhd');
  if (!mvhd) return null;
  const movieTs = (b[mvhd[1]] === 1 ? u32(mvhd[1] + 20) : u32(mvhd[1] + 12)) ?? 0;
  for (const trak of kids.filter(x => x[0] === 'trak')) {
    const tk = boxes(trak[1], trak[2]), mdia = tk.find(x => x[0] === 'mdia');
    if (!mdia) continue;
    const md = boxes(mdia[1], mdia[2]), hdlr = md.find(x => x[0] === 'hdlr');
    if (!hdlr || String.fromCharCode(...b.subarray(hdlr[1] + 8, hdlr[1] + 12)) !== 'soun') continue;
    const mdhd = md.find(x => x[0] === 'mdhd');
    if (!mdhd) return null;
    const v1 = b[mdhd[1]] === 1, ts = (v1 ? u32(mdhd[1] + 20) : u32(mdhd[1] + 12)) ?? 0, dur = (v1 ? u64(mdhd[1] + 24) : u32(mdhd[1] + 16)) ?? 0;
    if (!ts) return null;
    const edts = tk.find(x => x[0] === 'edts'), elst = edts && boxes(edts[1], edts[2]).find(x => x[0] === 'elst');
    if (!elst) return { first: 0, duration: dur / ts };
    const ev1 = b[elst[1]] === 1, n = u32(elst[1] + 4) ?? 0;
    let o = elst[1] + 8;
    for (let i = 0; i < n; i++) {
      const seg = ev1 ? u64(o) : u32(o);
      const media = ev1 ? (o + 16 <= b.length ? Number(dv.getBigInt64(o + 8)) : null) : (o + 8 <= b.length ? dv.getInt32(o + 4) : null);
      if (seg == null || media == null) return null;
      o += ev1 ? 20 : 12;
      if (media < 0) continue;   // an empty edit
      return { first: -media / ts, duration: seg > 0 && movieTs > 0 ? seg / movieTs : (dur - media) / ts };
    }
    return { first: 0, duration: dur / ts };
  }
  return null;
}

/** [first, end) frames to keep. */
export function keepRange(o: KeepInput): [number, number] {
  const { total, sr } = o;
  if (o.mp3) {
    const a = Math.min(total, o.mp3.start), b = o.mp3.until == null ? total : Math.min(total, Math.max(a, o.mp3.until));
    return [a, b];
  }
  const a = Math.min(total, o.firstTs < 0 ? Math.round(-o.firstTs * sr) : 0);
  let b = o.duration != null && o.duration > 0 ? Math.min(total, a + Math.round(o.duration * sr)) : total;
  if (o.exact != null && o.exact > 0) b = Math.min(b, a + Math.round(o.exact * sr));
  return [a, Math.max(a, b)];
}
