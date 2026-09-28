/* An AIFF streamed as WAV, a piece at a time (ADR 0088): Chrome, Edge and Firefox can't play AIFF, and
   rewrapping the whole file first means downloading all of it before a note plays. The WAV's bytes are
   worked out from the AIFF's: a 44-byte header, then the same samples in little-endian order. Only the
   AIFF's first bytes are needed to begin (its COMM and SSND chunk headers). Pure: no DOM. */
import { blankInfo, parseContainer } from './parse';
import type { PcmLayout } from '../types';

export interface WavView { total: number; header: Uint8Array; pcm: PcmLayout; len: number }

/** The WAV this AIFF becomes: `head` is the file's start (enough for its chunk headers), `size` its
    whole size. Null when it isn't PCM that can be rewrapped. */
export function wavView(head: Uint8Array, size: number): WavView | null {
  let info = blankInfo();
  try { info = parseContainer(head); } catch { return null; }
  const pcm = info.pcm;
  if (!pcm || !/^AIFF/.test(info.container ?? '') || !info.sampleRate || !info.duration) return null;
  // The chunk's real length: its frames (the head only holds the start of it).
  const frames = Math.round(info.duration * info.sampleRate);
  let len = Math.min(frames * pcm.blockAlign, size - pcm.off);
  len -= len % pcm.blockAlign;
  if (len <= 0) return null;
  const B = pcm.blockAlign / pcm.ch, header = new Uint8Array(44), dv = new DataView(header.buffer);
  const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) header[o + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); dv.setUint32(4, 36 + len, true); put(8, 'WAVE');
  put(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, pcm.fmt === 'float' ? 3 : 1, true); dv.setUint16(22, pcm.ch, true);
  dv.setUint32(24, info.sampleRate, true); dv.setUint32(28, info.sampleRate * pcm.blockAlign, true);
  dv.setUint16(32, pcm.blockAlign, true); dv.setUint16(34, B * 8, true);
  put(36, 'data'); dv.setUint32(40, len, true);
  return { total: 44 + len, header, pcm: { ...pcm, len }, len };
}

/** The WAV's bytes `start`…`end` (inclusive), reading the AIFF's with `read(from, to)` (to exclusive). */
export async function wavBytes(v: WavView, start: number, end: number, read: (from: number, to: number) => Promise<Uint8Array>): Promise<Uint8Array> {
  end = Math.min(end, v.total - 1);
  if (end < start) return new Uint8Array(0);
  const out = new Uint8Array(end - start + 1);
  let at = 0;
  if (start < 44) { const h = v.header.subarray(start, Math.min(44, end + 1)); out.set(h); at = h.length; }
  if (end < 44) return out;
  // The samples: whole ones read, converted, then cut to the bytes asked for.
  const o0 = Math.max(start, 44) - 44, o1 = end - 44, B = v.pcm.blockAlign / v.pcm.ch;
  const a0 = o0 - (o0 % B), a1 = Math.min(v.len, o1 + 1 + ((B - ((o1 + 1) % B)) % B));
  const src = await read(v.pcm.off + a0, v.pcm.off + a1);
  const conv = new Uint8Array(src.length);
  if (B === 1) for (let i = 0; i < src.length; i++) conv[i] = v.pcm.unsigned8 ? src[i] : (src[i] + 128) & 255;
  else if (v.pcm.le) conv.set(src);
  else for (let i = 0; i + B <= src.length; i += B) for (let k = 0; k < B; k++) conv[i + k] = src[i + B - 1 - k];
  out.set(conv.subarray(o0 - a0, o0 - a0 + (o1 - o0 + 1)), at);
  return out;
}
