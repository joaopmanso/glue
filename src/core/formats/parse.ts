/* Container parsing: what the file claims to be. Pure (no DOM); works in workers. */
import type { FileInfo, PcmLayout } from '../types';
import { fmtRate } from '../format';

const latin1Dec = new TextDecoder('latin1'), utf8Dec = new TextDecoder('utf-8');
export const readStr = (u8: Uint8Array, o: number, n: number): string => {
  let s = ''; for (let i = 0; i < n && o + i < u8.length; i++) s += String.fromCharCode(u8[o + i]); return s;
};
const utf8 = (u8: Uint8Array, a: number, b: number) => utf8Dec.decode(u8.subarray(a, Math.min(b, u8.length))).replace(/\u0000+$/g, '');
export const latin1 = (u8: Uint8Array): string => latin1Dec.decode(u8);
const syncsafe = (u8: Uint8Array, o: number) => ((u8[o] & 127) << 21) | ((u8[o + 1] & 127) << 14) | ((u8[o + 2] & 127) << 7) | (u8[o + 3] & 127);
const addTag = (tags: Record<string, string>, k: string, v: unknown) => {
  const s = String(v).trim(); if (!s) return; tags[k] = tags[k] ? tags[k] + ' · ' + s : s;
};

export function blankInfo(): FileInfo {
  return { container: 'Unknown', codec: 'Unknown', lossless: null, sampleRate: 0, bits: 0, channels: 0, duration: 0, bitrate: 0, bitrateMode: '', encoder: '', vendor: '', tags: {}, notes: [] };
}

export function parseContainer(u8: Uint8Array): FileInfo {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const info = blankInfo();
  const s4 = readStr(u8, 0, 4);
  if ((s4 === 'RIFF' || s4 === 'RF64') && readStr(u8, 8, 4) === 'WAVE') parseWav(u8, dv, info);
  else if (s4 === 'FORM' && /^AIF[FC]$/.test(readStr(u8, 8, 4))) parseAiff(u8, dv, info);
  else if (readStr(u8, 4, 4) === 'ftyp') parseMp4(u8, dv, info);
  else if (s4 === 'OggS') parseOgg(u8, dv, info);
  else if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) parseWebm(u8, dv, info);
  else if (s4 === 'DSD ' || s4 === 'FRM8') {
    Object.assign(info, { container: s4 === 'DSD ' ? 'DSF' : 'DSDIFF', codec: 'DSD', lossless: true });
    info.unsupported = 'DSD files can’t be decoded in a browser. Convert to 24-bit / 88.2 kHz FLAC or WAV first (foobar2000 or ffmpeg can do this).';
  }
  else if (s4 === 'wvpk') { Object.assign(info, { container: 'WavPack', codec: 'WavPack' }); info.unsupported = 'WavPack can’t be decoded in a browser. Convert to FLAC or WAV first.'; }
  else if (s4 === 'MAC ') { Object.assign(info, { container: 'Monkey’s Audio', codec: 'APE' }); info.unsupported = 'Monkey’s Audio (APE) can’t be decoded in a browser. Convert to FLAC or WAV first.'; }
  else {
    let off = 0;
    if (readStr(u8, 0, 3) === 'ID3') off = parseId3v2(u8, dv, info.tags);
    if (readStr(u8, off, 4) === 'fLaC') parseFlac(u8, dv, info, off);
    else if (u8[off] === 0xFF && (u8[off + 1] & 0xF6) === 0xF0) parseAdts(u8, info, off);
    else parseMp3(u8, dv, info, off);
  }
  return info;
}

function parseId3v2(u8: Uint8Array, dv: DataView, tags: Record<string, string>): number {
  if (readStr(u8, 0, 3) !== 'ID3') return 0;
  const ver = u8[3], flags = u8[5], size = syncsafe(u8, 6), end = Math.min(u8.length, 10 + size);
  let p = 10;
  if (flags & 0x40) p += ver === 4 ? syncsafe(u8, 10) : dv.getUint32(10) + 4;
  if (ver >= 3) {
    while (p + 10 <= end) {
      const id = readStr(u8, p, 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = ver === 4 ? syncsafe(u8, p + 4) : dv.getUint32(p + 4), b = p + 10;
      if (fs <= 0 || b + fs > end) break;
      if (id !== 'APIC' && (id[0] === 'T' || id[0] === 'W' || id === 'COMM')) {
        try { addTag(tags, id, decodeId3Text(u8, b, fs, id)); } catch { /* skip unreadable frame */ }
      }
      p = b + fs;
    }
  }
  return 10 + size + ((flags & 0x10) ? 10 : 0);
}

function decodeId3Text(u8: Uint8Array, b: number, len: number, id: string): string {
  if (id[0] === 'W' && id !== 'WXXX') return readStr(u8, b, len).replace(/\u0000/g, '');
  const enc = u8[b];
  let s = b + 1;
  if (id === 'COMM') s += 3;
  const bytes = u8.subarray(s, b + len);
  let text: string;
  if (enc === 1) {
    // UTF-16 with a BOM normally; without one, assume little-endian and keep every byte.
    const le = bytes[0] === 0xFF && bytes[1] === 0xFE, be = bytes[0] === 0xFE && bytes[1] === 0xFF;
    text = new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(le || be ? bytes.subarray(2) : bytes);
  } else if (enc === 2) text = new TextDecoder('utf-16be').decode(bytes);
  else if (enc === 3) text = utf8Dec.decode(bytes);
  else text = latin1Dec.decode(bytes);
  return text.replace(/﻿/g, '').split('\u0000').map(x => x.trim()).filter(Boolean).join(id === 'TXXX' || id === 'WXXX' ? ': ' : ' · ');
}

function parseWav(u8: Uint8Array, dv: DataView, info: FileInfo) {
  Object.assign(info, { container: readStr(u8, 0, 4) === 'RF64' ? 'WAV (RF64)' : 'WAV', codec: 'PCM', lossless: true });
  let off = 12, ds64: number | null = null;
  let fmt: { tag: number; ch: number; sr: number; blockAlign: number; bps: number; valid: number } | null = null;
  let data: { off: number; len: number } | null = null;
  while (off + 8 <= u8.length) {
    const id = readStr(u8, off, 4), size = dv.getUint32(off + 4, true), b = off + 8;
    if (id === 'ds64') ds64 = dv.getUint32(b + 8, true) + dv.getUint32(b + 12, true) * 4294967296;
    else if (id === 'fmt ') {
      let tag = dv.getUint16(b, true);
      const ch = dv.getUint16(b + 2, true), sr = dv.getUint32(b + 4, true), blockAlign = dv.getUint16(b + 12, true), bps = dv.getUint16(b + 14, true);
      let valid = bps;
      if (tag === 0xFFFE && size >= 40) { valid = dv.getUint16(b + 18, true) || bps; tag = dv.getUint16(b + 24, true); }
      fmt = { tag, ch, sr, blockAlign, bps, valid };
    } else if (id === 'data') {
      let len = size;
      if (size === 0xFFFFFFFF && ds64 != null) len = ds64;
      len = Math.min(len, u8.length - b);
      data = { off: b, len };
      off = b + len + (len & 1);
      continue;
    } else if (id === 'LIST' && readStr(u8, b, 4) === 'INFO') {
      let q = b + 4;
      const names: Record<string, string> = { ISFT: 'Software', INAM: 'Title', IART: 'Artist', IPRD: 'Album', ICMT: 'Comment', IENG: 'Engineer', ISRC: 'Source' };
      while (q + 8 <= b + size) {
        const sid = readStr(u8, q, 4), ss = dv.getUint32(q + 4, true);
        addTag(info.tags, names[sid] || sid, utf8(u8, q + 8, q + 8 + ss));
        q += 8 + ss + (ss & 1);
      }
    } else if (id === 'bext') {
      addTag(info.tags, 'BWF description', utf8(u8, b, b + 256));
      addTag(info.tags, 'BWF originator', utf8(u8, b + 256, b + 288));
    } else if (id === 'id3 ' || id === 'ID3 ') {
      parseId3v2(u8.subarray(b, b + size), new DataView(u8.buffer, u8.byteOffset + b, Math.min(size, u8.length - b)), info.tags);
    }
    if (size === 0 && id !== 'data') break;
    off = b + size + (size & 1);
  }
  if (!fmt) return;
  info.sampleRate = fmt.sr; info.channels = fmt.ch; info.bits = fmt.valid;
  const B = fmt.blockAlign / fmt.ch;
  const names: Record<number, string> = { 1: 'PCM', 3: 'PCM (float)', 6: 'A-law', 7: 'µ-law', 0x11: 'IMA ADPCM', 0x55: 'MP3 (inside WAV)', 0xFF: 'AAC (inside WAV)', 0x2000: 'AC-3 (inside WAV)' };
  info.codec = names[fmt.tag] || 'Format 0x' + fmt.tag.toString(16);
  if (fmt.tag === 3) info.bitsLabel = fmt.bps + '-bit float';
  if (fmt.tag === 0x55 || fmt.tag === 0xFF || fmt.tag === 0x2000 || fmt.tag === 0x11) info.lossless = false;
  if (data) {
    info.duration = data.len / fmt.blockAlign / fmt.sr;
    if (fmt.tag === 1 && B >= 1 && B <= 4 && Number.isInteger(B))
      info.pcm = { fmt: 'int', le: true, off: data.off, len: data.len, ch: fmt.ch, blockAlign: fmt.blockAlign, unsigned8: B === 1 };
    else if (fmt.tag === 3 && (B === 4 || B === 8))
      info.pcm = { fmt: 'float', le: true, off: data.off, len: data.len, ch: fmt.ch, blockAlign: fmt.blockAlign };
  }
  info.bitrate = fmt.sr * fmt.bps * fmt.ch / 1000;
}

function ext80(dv: DataView, o: number): number {
  const se = dv.getUint16(o), e = se & 0x7fff, hi = dv.getUint32(o + 2), lo = dv.getUint32(o + 6);
  if (!e && !hi && !lo) return 0;
  return (se >> 15 ? -1 : 1) * (hi * 4294967296 + lo) * Math.pow(2, e - 16383 - 63);
}

function parseAiff(u8: Uint8Array, dv: DataView, info: FileInfo) {
  const aifc = readStr(u8, 8, 4) === 'AIFC';
  Object.assign(info, { container: aifc ? 'AIFF-C' : 'AIFF', codec: 'PCM', lossless: true });
  let p = 12;
  let comm: { ch: number; frames: number; ss: number; sr: number; comp: string } | null = null;
  let ssnd: { off: number; len: number } | null = null;
  while (p + 8 <= u8.length) {
    const id = readStr(u8, p, 4), size = dv.getUint32(p + 4), b = p + 8;
    if (id === 'COMM') {
      comm = { ch: dv.getInt16(b), frames: dv.getUint32(b + 2), ss: dv.getInt16(b + 6), sr: ext80(dv, b + 8), comp: aifc && size >= 22 ? readStr(u8, b + 18, 4) : 'NONE' };
    } else if (id === 'SSND') {
      const o = dv.getUint32(b), start = b + 8 + o;
      ssnd = { off: start, len: Math.min(size - 8 - o, u8.length - start) };
    } else if (id === 'NAME' || id === 'AUTH' || id === 'ANNO' || id === '(c) ') {
      const label: Record<string, string> = { NAME: 'Title', AUTH: 'Author', ANNO: 'Annotation', '(c) ': 'Copyright' };
      addTag(info.tags, label[id], latin1(u8.subarray(b, b + size)));
    } else if (id === 'ID3 ' || id === 'id3 ') {
      parseId3v2(u8.subarray(b, b + size), new DataView(u8.buffer, u8.byteOffset + b, Math.min(size, u8.length - b)), info.tags);
    }
    if (size === 0 && id !== 'SSND') break;
    p = b + size + (size & 1);
  }
  if (!comm) return;
  info.sampleRate = Math.round(comm.sr); info.channels = comm.ch; info.bits = comm.ss;
  info.duration = comm.frames / comm.sr;
  info.bitrate = comm.sr * comm.ss * comm.ch / 1000;
  const c = comm.comp;
  let fmt: PcmLayout['fmt'] | null = null, le = false, bytes = Math.ceil(comm.ss / 8);
  if (c === 'NONE' || c === 'twos' || c === 'in24' || c === 'in32') fmt = 'int';
  else if (c === 'sowt') { fmt = 'int'; le = true; }
  else if (c === 'fl32' || c === 'FL32') { fmt = 'float'; bytes = 4; info.bitsLabel = '32-bit float'; }
  else if (c === 'fl64' || c === 'FL64') { fmt = 'float'; bytes = 8; info.bitsLabel = '64-bit float'; }
  else { info.codec = 'AIFF-C ' + c.trim(); if (/alaw|ulaw|ima4|MAC/i.test(c)) info.lossless = false; }
  if (c === 'in24') bytes = 3;
  if (c === 'in32') bytes = 4;
  if (fmt && ssnd && bytes >= 1 && bytes <= 8) info.pcm = { fmt, le, off: ssnd.off, len: ssnd.len, ch: comm.ch, blockAlign: comm.ch * bytes };
}

function parseStreamInfo(u8: Uint8Array, dv: DataView, b: number, info: Pick<FileInfo, 'sampleRate' | 'channels' | 'bits' | 'duration'>) {
  info.sampleRate = (u8[b + 10] << 12) | (u8[b + 11] << 4) | (u8[b + 12] >> 4);
  info.channels = ((u8[b + 12] >> 1) & 7) + 1;
  info.bits = (((u8[b + 12] & 1) << 4) | (u8[b + 13] >> 4)) + 1;
  const total = (u8[b + 13] & 15) * 4294967296 + dv.getUint32(b + 14);
  if (total && info.sampleRate) info.duration = total / info.sampleRate;
}

function parseVorbisComment(u8: Uint8Array, dv: DataView, p: number, info: FileInfo) {
  const vl = dv.getUint32(p, true);
  if (vl > 4096 || p + 4 + vl > u8.length) return;
  info.vendor = utf8(u8, p + 4, p + 4 + vl);
  p += 4 + vl;
  const n = dv.getUint32(p, true); p += 4;
  for (let i = 0; i < Math.min(n, 300); i++) {
    const L = dv.getUint32(p, true); p += 4;
    if (L > 200000 || p + L > u8.length) break;
    const s = utf8(u8, p, p + L); p += L;
    const eq = s.indexOf('=');
    if (eq > 0) {
      const k = s.slice(0, eq).toUpperCase();
      if (k !== 'METADATA_BLOCK_PICTURE' && k !== 'COVERART') addTag(info.tags, k, s.slice(eq + 1).slice(0, 400));
    }
  }
}

function parseFlac(u8: Uint8Array, dv: DataView, info: FileInfo, off: number) {
  Object.assign(info, { container: 'FLAC', codec: 'FLAC', lossless: true });
  let p = off + 4;
  while (p + 4 <= u8.length) {
    const h = u8[p], type = h & 0x7f, len = (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3], b = p + 4;
    try {
      if (type === 0) parseStreamInfo(u8, dv, b, info);
      else if (type === 4) parseVorbisComment(u8, dv, b, info);
    } catch { /* damaged block */ }
    p = b + len;
    if (h & 0x80) break;
  }
}

const MP3_BR: Record<string, number[]> = {
  V1L1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  V1L2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  V1L3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  V2L1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  V2L23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
interface Mp3Header { v1: boolean; layer: number; br: number; sr: number; spf: number; len: number; mode: number; ch: number }
function mp3Header(u8: Uint8Array, p: number): Mp3Header | null {
  if (p + 4 > u8.length || u8[p] !== 0xFF || (u8[p + 1] & 0xE0) !== 0xE0) return null;
  const vb = (u8[p + 1] >> 3) & 3, lb = (u8[p + 1] >> 1) & 3, bi = u8[p + 2] >> 4, si = (u8[p + 2] >> 2) & 3, pad = (u8[p + 2] >> 1) & 1, mode = u8[p + 3] >> 6;
  if (vb === 1 || lb === 0 || bi === 0 || bi === 15 || si === 3) return null;
  const v1 = vb === 3, layer = 4 - lb;
  const sr = [44100, 48000, 32000][si] / (vb === 3 ? 1 : vb === 2 ? 2 : 4);
  const br = (v1 ? MP3_BR['V1L' + layer] : layer === 1 ? MP3_BR.V2L1 : MP3_BR.V2L23)[bi];
  const spf = layer === 1 ? 384 : layer === 2 ? 1152 : (v1 ? 1152 : 576);
  const len = layer === 1 ? (Math.floor(12 * br * 1000 / sr) + pad) * 4 : Math.floor(spf / 8 * br * 1000 / sr) + pad;
  if (len < 16) return null;
  return { v1, layer, br, sr, spf, len, mode, ch: mode === 3 ? 1 : 2 };
}

function parseMp3(u8: Uint8Array, dv: DataView, info: FileInfo, start: number) {
  let p = start, h: Mp3Header | null = null;
  const lim = Math.min(u8.length - 4, start + (1 << 20));
  for (; p < lim; p++) {
    h = mp3Header(u8, p);
    if (h) { const n = mp3Header(u8, p + h.len); if (n && n.sr === h.sr && n.layer === h.layer) break; }
    h = null;
  }
  if (!h) return;
  Object.assign(info, { container: 'MPEG audio', codec: h.layer === 3 ? 'MP3' : 'MPEG Layer ' + h.layer, lossless: false, sampleRate: h.sr, channels: h.ch });
  info.channelMode = ['Stereo', 'Joint stereo', 'Dual channel', 'Mono'][h.mode];
  const side = h.v1 ? (h.ch === 1 ? 17 : 32) : (h.ch === 1 ? 9 : 17);
  const x = p + 4 + side, tag = readStr(u8, x, 4);
  let frames = 0, bytes = 0, firstIsTag = false;
  if (tag === 'Xing' || tag === 'Info') {
    firstIsTag = true;
    const fl = dv.getUint32(x + 4);
    let q = x + 8;
    if (fl & 1) { frames = dv.getUint32(q); q += 4; }
    if (fl & 2) { bytes = dv.getUint32(q); q += 4; }
    if (fl & 4) q += 100;
    if (fl & 8) q += 4;
    const enc = readStr(u8, q, 9).replace(/[^\x20-\x7e]/g, '').trim();
    if (/^(LAME|Lavc|Lavf|GOGO|L3\.9)/.test(enc)) {
      info.encoder = enc;
      const methods: Record<number, string> = { 1: 'CBR', 2: 'ABR', 3: 'VBR', 4: 'VBR', 5: 'VBR', 6: 'VBR', 8: 'CBR (2-pass)', 9: 'ABR (2-pass)' };
      info.lameMethod = methods[u8[q + 9] & 15] || '';
      const lp = u8[q + 10] * 100;
      if (lp) info.lameLowpass = lp;
    }
    info.bitrateMode = tag === 'Info' ? 'CBR' : 'VBR';
  } else if (readStr(u8, p + 36, 4) === 'VBRI') {
    firstIsTag = true;
    bytes = dv.getUint32(p + 46); frames = dv.getUint32(p + 50);
    info.bitrateMode = 'VBR'; info.encoder = 'Fraunhofer (VBRI header)';
  }
  let q = firstIsTag ? p + h.len : p, cnt = 0, sum = 0, minB = 1e9, maxB = 0;
  while (q + 4 <= u8.length) {
    const f = mp3Header(u8, q);
    if (!f) break;
    cnt++; sum += f.br; if (f.br < minB) minB = f.br; if (f.br > maxB) maxB = f.br;
    q += f.len;
  }
  if (!frames) frames = cnt;
  info.duration = frames * h.spf / h.sr;
  if (bytes && info.duration) info.bitrate = bytes * 8 / info.duration / 1000;
  else if (cnt) info.bitrate = sum / cnt;
  if (!info.bitrateMode) info.bitrateMode = minB === maxB ? 'CBR' : 'VBR';
  if (info.lameMethod) info.bitrateMode = info.lameMethod;
}

const AAC_SR = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
function parseAdts(u8: Uint8Array, info: FileInfo, off: number) {
  const b2 = u8[off + 2], profile = b2 >> 6, sr = AAC_SR[(b2 >> 2) & 15] || 0;
  Object.assign(info, { container: 'ADTS', codec: profile === 1 ? 'AAC-LC' : 'AAC', lossless: false, sampleRate: sr, channels: ((b2 & 1) << 2) | (u8[off + 3] >> 6) });
  let q = off, frames = 0, bytes = 0;
  while (q + 7 <= u8.length && u8[q] === 0xFF && (u8[q + 1] & 0xF6) === 0xF0) {
    const len = ((u8[q + 3] & 3) << 11) | (u8[q + 4] << 3) | (u8[q + 5] >> 5);
    if (len < 7) break;
    frames++; bytes += len; q += len;
  }
  if (sr) {
    info.duration = frames * 1024 / sr;
    if (info.duration) info.bitrate = bytes * 8 / info.duration / 1000;
    if (sr <= 24000) { info.decodeRate = sr * 2; info.notes.push('Low AAC core rate: probably HE-AAC (SBR), decoded at ' + fmtRate(sr * 2) + '.'); }
  }
}

interface Mp4Audio {
  fourcc?: string; ch?: number; ss?: number; sr?: number; bits?: number; ts?: number; dur?: number;
  oti?: number; maxBr?: number; avgBr?: number; aot?: number; opusInput?: number;
}
function parseMp4(u8: Uint8Array, dv: DataView, info: FileInfo) {
  info.container = 'MPEG-4';
  const tags = info.tags, audio: Mp4Audio = {};
  let lastMdhd: { ts: number; dur: number } | null = null, handler: string | null = null;
  const u64 = (o: number) => dv.getUint32(o) * 4294967296 + dv.getUint32(o + 4);
  function ilstItem(type: string, b: number, e: number) {
    // Atom names like "©too" arrive as latin1 strings, so "©" is already U+00A9.
    let q = b, name = type;
    while (q + 8 <= e) {
      const s = dv.getUint32(q), t = readStr(u8, q + 4, 4);
      if (s < 8) break;
      if (t === 'name') name = utf8(u8, q + 12, q + s);
      if (t === 'data' && (dv.getUint32(q + 8) & 0xffffff) === 1) addTag(tags, name, utf8(u8, q + 16, q + s).slice(0, 400));
      q += s;
    }
  }
  function esds(p: number, e: number) {
    const readLen = () => { let len = 0; for (let i = 0; i < 4; i++) { const c = u8[p++]; len = (len << 7) | (c & 0x7f); if (!(c & 0x80)) break; } return len; };
    while (p < e) {
      const tag = u8[p++], len = readLen();
      if (tag === 3) { p += 2; const fl = u8[p++]; if (fl & 0x80) p += 2; if (fl & 0x40) p += 1 + u8[p]; if (fl & 0x20) p += 2; continue; }
      if (tag === 4) { audio.oti = u8[p]; audio.maxBr = dv.getUint32(p + 5); audio.avgBr = dv.getUint32(p + 9); p += 13; continue; }
      if (tag === 5) { let aot = u8[p] >> 3; if (aot === 31) aot = 32 + (((u8[p] & 7) << 3) | (u8[p + 1] >> 5)); audio.aot = aot; p += len; continue; }
      p += len;
    }
  }
  function entryChild(type: string, b: number, e: number) {
    if (type === 'esds') esds(b + 4, e);
    else if (type === 'alac') { audio.bits = u8[b + 9]; audio.ch = u8[b + 13]; audio.avgBr = dv.getUint32(b + 20); audio.sr = dv.getUint32(b + 24); }
    else if (type === 'dOps') audio.opusInput = dv.getUint32(b + 4);
    else if (type === 'dfLa') { const tmp = { sampleRate: 0, channels: 0, bits: 0, duration: 0 }; parseStreamInfo(u8, dv, b + 8, tmp); audio.sr = tmp.sampleRate; audio.bits = tmp.bits; }
    else if (type === 'wave') walk(b, e, 'entry');
  }
  function sampleEntry(type: string, b: number, e: number) {
    audio.fourcc = type;
    const ver = dv.getUint16(b + 8);
    audio.ch = audio.ch || dv.getUint16(b + 16);
    audio.ss = dv.getUint16(b + 18);
    audio.sr = dv.getUint32(b + 24) >>> 16;
    let c = b + 28;
    if (ver === 1) c += 16;
    else if (ver === 2) { audio.sr = Math.round(dv.getFloat64(b + 32)); audio.ch = dv.getUint32(b + 40); audio.ss = dv.getUint32(b + 48); c += 36; }
    walk(c, e, 'entry');
  }
  function walk(start: number, end: number, parent: string) {
    let off = start;
    while (off + 8 <= end) {
      let size = dv.getUint32(off), hdr = 8;
      const type = readStr(u8, off + 4, 4);
      if (size === 1) { size = u64(off + 8); hdr = 16; } else if (size === 0) size = end - off;
      if (size < hdr) break;
      const b = off + hdr, e = Math.min(end, off + size);
      if (parent === 'ilst') ilstItem(type, b, e);
      else if (parent === 'stsd') sampleEntry(type, b, e);
      else if (parent === 'entry') entryChild(type, b, e);
      else switch (type) {
        case 'ftyp':
          info.brand = readStr(u8, b, 4).trim(); info.compatBrands = [];
          for (let q = b + 8; q + 4 <= e; q += 4) info.compatBrands.push(readStr(u8, q, 4).trim());
          break;
        case 'trak': handler = null; walk(b, e, type); break;
        case 'moov': case 'mdia': case 'minf': case 'stbl': case 'udta': case 'edts': walk(b, e, type); break;
        case 'ilst': walk(b, e, 'ilst'); break;
        case 'meta': walk(readStr(u8, b + 4, 4) === 'hdlr' ? b : b + 4, e, 'meta'); break;
        case 'mdhd': { const v = u8[b]; lastMdhd = v === 1 ? { ts: dv.getUint32(b + 20), dur: u64(b + 24) } : { ts: dv.getUint32(b + 12), dur: dv.getUint32(b + 16) }; break; }
        case 'hdlr':
          if (parent === 'mdia') {
            handler = readStr(u8, b + 8, 4);
            if (handler === 'soun' && lastMdhd && !audio.ts) { audio.ts = lastMdhd.ts; audio.dur = lastMdhd.dur; }
          }
          break;
        // Only the first sound track counts; video and subtitle tracks have their own stsd.
        case 'stsd': if (handler === 'soun' && !audio.fourcc) walk(b + 8, e, 'stsd'); break;
      }
      off += size;
    }
  }
  walk(0, u8.length, 'root');
  const fc = audio.fourcc || '';
  if (!fc && !audio.ts) { info.codec = 'No audio'; info.unsupported = 'This MP4 has no audio track, only video.'; return; }
  const aotNames: Record<number, string> = { 1: 'AAC Main', 2: 'AAC-LC', 5: 'HE-AAC', 29: 'HE-AACv2', 42: 'xHE-AAC' };
  if (fc === 'mp4a') {
    if (audio.oti === 0x69 || audio.oti === 0x6B) info.codec = 'MP3';
    else info.codec = (audio.aot != null && aotNames[audio.aot]) || 'AAC';
    info.lossless = false;
  } else if (fc === 'alac') { info.codec = 'ALAC'; info.lossless = true; }
  else if (fc === 'fLaC') { info.codec = 'FLAC'; info.lossless = true; }
  else if (fc === 'Opus') { info.codec = 'Opus'; info.lossless = false; }
  else if (fc === 'ac-3' || fc === 'ec-3') { info.codec = fc === 'ac-3' ? 'Dolby Digital' : 'Dolby Digital Plus'; info.lossless = false; }
  else if (/^(lpcm|sowt|twos|ipcm|fpcm|in24|in32|fl32)$/.test(fc)) { info.codec = 'PCM'; info.lossless = true; }
  else if (fc) info.codec = fc;
  let sr = Math.max(audio.sr || 0, audio.ts && audio.ts >= 8000 && audio.ts <= 768000 ? audio.ts : 0);
  if ((audio.aot === 5 || audio.aot === 29) && sr && sr < 32000) sr *= 2;
  if (info.codec === 'Opus') { sr = 48000; if (audio.opusInput) info.opusInputRate = audio.opusInput; }
  info.sampleRate = sr;
  info.channels = audio.ch || 0;
  if (info.lossless) info.bits = audio.bits || audio.ss || 0;
  if (audio.ts && audio.dur) info.duration = audio.dur / audio.ts;
  if (audio.avgBr) info.bitrate = audio.avgBr / 1000;
  info.encoder = tags['©too'] || tags['©enc'] || '';
  info.container = info.brand === 'M4A' ? 'MPEG-4 (M4A)' : 'MPEG-4 (' + (info.brand || '?') + ')';
}

function parseOgg(u8: Uint8Array, dv: DataView, info: FileInfo) {
  info.container = 'Ogg';
  const pk = 27 + u8[26];
  let preskip = 0;
  if (readStr(u8, pk, 7) === '\x01vorbis') {
    Object.assign(info, { codec: 'Vorbis', lossless: false, channels: u8[pk + 11], sampleRate: dv.getUint32(pk + 12, true) });
    const nom = dv.getInt32(pk + 20, true);
    if (nom > 0) info.nominalBitrate = nom / 1000;
  } else if (readStr(u8, pk, 8) === 'OpusHead') {
    Object.assign(info, { codec: 'Opus', lossless: false, channels: u8[pk + 9], sampleRate: 48000 });
    preskip = dv.getUint16(pk + 10, true);
    info.opusInputRate = dv.getUint32(pk + 12, true);
  } else if (readStr(u8, pk, 5) === '\x7fFLAC') {
    Object.assign(info, { codec: 'FLAC', lossless: true });
    parseStreamInfo(u8, dv, pk + 17, info);
  }
  const head = latin1(u8.subarray(0, Math.min(u8.length, 1 << 19)));
  let i = head.indexOf('OpusTags');
  try {
    if (i >= 0) parseVorbisComment(u8, dv, i + 8, info);
    else if ((i = head.indexOf('\x03vorbis')) >= 0) parseVorbisComment(u8, dv, i + 7, info);
  } catch { /* comment packet spans pages */ }
  for (let q = u8.length - 14; q >= Math.max(0, u8.length - 131072); q--) {
    if (u8[q] === 0x4F && u8[q + 1] === 0x67 && u8[q + 2] === 0x67 && u8[q + 3] === 0x53) {
      const g = dv.getUint32(q + 6, true) + dv.getUint32(q + 10, true) * 4294967296;
      if (info.codec === 'Opus') info.duration = (g - preskip) / 48000;
      else if (info.sampleRate) info.duration = g / info.sampleRate;
      break;
    }
  }
}

function parseWebm(u8: Uint8Array, dv: DataView, info: FileInfo) {
  info.webm = true;
  const head = latin1(u8.subarray(0, Math.min(u8.length, 1 << 18)));
  info.container = head.includes('webm') ? 'WebM' : 'Matroska';
  const codecs: [string, string, boolean][] = [['A_OPUS', 'Opus', false], ['A_VORBIS', 'Vorbis', false], ['A_AAC', 'AAC', false], ['A_FLAC', 'FLAC', true], ['A_MPEG/L3', 'MP3', false], ['A_PCM', 'PCM', true], ['A_ALAC', 'ALAC', true]];
  let at = -1;
  for (const [id, name, ll] of codecs) { at = head.indexOf(id); if (at >= 0) { info.codec = name; info.lossless = ll; break; } }
  if (at >= 0) {
    for (let i = at; i < Math.min(u8.length - 10, at + 600); i++) {
      if (u8[i] === 0xB5 && u8[i + 1] === 0x88) { const v = dv.getFloat64(i + 2); if (v >= 8000 && v <= 768000) { info.sampleRate = Math.round(v); break; } }
      if (u8[i] === 0xB5 && u8[i + 1] === 0x84) { const v = dv.getFloat32(i + 2); if (v >= 8000 && v <= 768000) { info.sampleRate = Math.round(v); break; } }
    }
    for (let i = at; i < Math.min(u8.length - 4, at + 600); i++) {
      if (u8[i] === 0x62 && u8[i + 1] === 0x64 && u8[i + 2] === 0x81) { info.bits = u8[i + 3]; break; }
    }
  }
  if (info.codec === 'Opus') info.sampleRate = 48000;
  if (!info.lossless) info.bits = 0;
}
