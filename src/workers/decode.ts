/* Decoding inside a worker (ADR 0060): mediabunny reads the container, the browser's WebCodecs
   decodes, and the samples are trimmed the way the browser's own decoder trims them (keepRange), so
   the analysis is the same as before, without blocking the page. Null when this can't be done here
   (no WebCodecs, a codec it doesn't decode, a rate the page decoder would resample): the page then
   decodes it the old way. Imported by workers only. */
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { mp3Gapless } from '../core/formats/parse';
import { keepRange } from '../core/audio/trim';
import type { FileInfo } from '../core/types';

export async function decodeHere(file: Blob, info: FileInfo, head: Uint8Array): Promise<{ channels: Float32Array[]; sr: number } | null> {
  if (typeof AudioDecoder === 'undefined') return null;
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return null;
    const nch = track.numberOfChannels, duration = await track.computeDuration();
    let sr = 0, total = 0, firstTs: number | null = null;
    // Room for the whole track at once (plus a second), grown if the estimate was short.
    let cap = Math.ceil((duration + 1) * (track.sampleRate || 48000));
    let chans = Array.from({ length: nch }, () => new Float32Array(cap));
    for await (const s of new AudioSampleSink(track).samples()) {
      try {
        if (!sr) sr = s.sampleRate;
        if (s.sampleRate !== sr || s.numberOfChannels !== nch) return null;
        firstTs ??= s.timestamp;
        if (total + s.numberOfFrames > cap) {
          cap = Math.ceil((total + s.numberOfFrames) * 1.25);
          chans = chans.map(c => { const n = new Float32Array(cap); n.set(c.subarray(0, total)); return n; });
        }
        for (let c = 0; c < nch; c++) s.copyTo(chans[c].subarray(total, total + s.numberOfFrames), { planeIndex: c, format: 'f32-planar' });
        total += s.numberOfFrames;
      } finally { s.close(); }
    }
    if (!total) return null;
    // The page decoder decodes at the file's own rate (or the HE-AAC rate): anything else would differ.
    const want = info.decodeRate || info.sampleRate;
    if (want && want !== sr) return null;
    const [a, b] = keepRange({ total, sr, firstTs: firstTs ?? 0, duration, mp3: mp3Gapless(head), exact: info.container === 'Ogg' ? info.duration : null });
    return { channels: chans.map(c => c.subarray(a, b)), sr };
  } catch (e) {
    console.warn('Decoding in the worker failed; the page decodes it', e);
    return null;
  } finally { input.dispose(); }
}
