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
