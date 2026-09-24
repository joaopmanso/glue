import type { PcmLayout } from '../types';

/** Rewrap raw PCM (e.g. big-endian AIFF, which Chrome and Firefox won't play) as a playable WAV. */
export function pcmToWav(u8: Uint8Array, pcm: PcmLayout, sr: number): Blob {
  const B = pcm.blockAlign / pcm.ch, n = pcm.len - (pcm.len % pcm.blockAlign);
  const out = new Uint8Array(44 + n), dv = new DataView(out.buffer);
  const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); dv.setUint32(4, 36 + n, true); put(8, 'WAVE');
  put(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, pcm.fmt === 'float' ? 3 : 1, true); dv.setUint16(22, pcm.ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * pcm.blockAlign, true);
  dv.setUint16(32, pcm.blockAlign, true); dv.setUint16(34, B * 8, true);
  put(36, 'data'); dv.setUint32(40, n, true);
  const src = u8.subarray(pcm.off, pcm.off + n);
  if (B === 1) { for (let i = 0; i < n; i++) out[44 + i] = pcm.unsigned8 ? src[i] : (src[i] + 128) & 255; }
  else if (pcm.le) out.set(src, 44);
  else for (let i = 0; i < n; i += B) for (let k = 0; k < B; k++) out[44 + i + k] = src[i + B - 1 - k];
  return new Blob([out], { type: 'audio/wav' });
}

/** Encode float channels as a 16- or 24-bit PCM WAV. */
export function encodeWav(chs: Float32Array[], sr: number, bits: 16 | 24): Blob {
  const n = chs[0].length, nc = chs.length, B = bits / 8, size = n * nc * B;
  const buf = new ArrayBuffer(44 + size), dv = new DataView(buf), u8 = new Uint8Array(buf);
  const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) u8[o + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); dv.setUint32(4, 36 + size, true); put(8, 'WAVE'); put(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * nc * B, true); dv.setUint16(32, nc * B, true); dv.setUint16(34, bits, true);
  put(36, 'data'); dv.setUint32(40, size, true);
  const scale = bits === 24 ? 8388607 : 32767;
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const v = Math.round(Math.max(-1, Math.min(1, chs[c][i])) * scale);
    if (bits === 24) { u8[o] = v & 255; u8[o + 1] = (v >> 8) & 255; u8[o + 2] = (v >> 16) & 255; o += 3; }
    else { dv.setInt16(o, v, true); o += 2; }
  }
  return new Blob([buf], { type: 'audio/wav' });
}
