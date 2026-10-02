/* FLAC decoded here (ADR 0144), for the analysis: the samples exactly, at the file's own rate. The browser's decoders
   failed on the user's 24-bit/192 kHz FLACs (2026-10-02): its page decoder refused them ("Unable to decode audio
   data"), and WebCodecs stalled in Edge's GPU process (553 s of its processor and still going for a 7-minute song).
   FLAC is lossless and fully specified (RFC 9639): any decoder gives the same samples.
   The file is read a part at a time (`read`), so a 500 MB file isn't held whole beside its samples. Pure: no DOM. */

export interface FlacInfo { sampleRate: number; channels: number; bits: number; total: number; maxFrame: number }
export interface FlacPcm { sampleRate: number; bits: number; channels: Float32Array[] }

/** Reads a FLAC stream's bits, MSB first, from a window of the file that's refilled as it's used up. */
class Bits {
  b: Uint8Array = new Uint8Array(0);
  /** The bit position in `b`; `base`: where `b` starts in the file. */
  pos = 0;
  base = 0;
  /** The last frame's sample size (a frame may say its own). */
  bits = 16;
  /** 32 bits from the position (zeros past the end). */
  peek32(): number {
    const b = this.b, i = this.pos >>> 3, s = this.pos & 7;
    const w = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    return s ? ((w << s) | (b[i + 4] >>> (8 - s))) >>> 0 : w;
  }
  /** An unsigned number of n bits (0–32). */
  read(n: number): number {
    if (n === 0) return 0;
    const v = this.peek32() >>> (32 - n);
    this.pos += n;
    return v;
  }
  /** A signed number of n bits (1–32), two's complement. */
  signed(n: number): number {
    const v = this.read(n);
    return n === 32 ? v | 0 : (v << (32 - n)) >> (32 - n);
  }
  /** Zeros before the next 1. */
  unary(): number {
    let n = 0;
    for (;;) {
      const w = this.peek32();
      if (w) { const z = Math.clz32(w); this.pos += z + 1; return n + z; }
      n += 32; this.pos += 32;
      if ((this.pos >>> 3) > this.b.length) throw new Error('FLAC: a residual runs past the end');
    }
  }
  align() { this.pos = (this.pos + 7) & ~7; }
  /** Bytes left in the window. */
  left() { return this.b.length - (this.pos >>> 3); }
}

const BLOCK = [0, 192, 576, 1152, 2304, 4608, 0, 0, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
const SIZE = [0, 8, 12, 0, 16, 20, 24, 32];

/** The stream's header (STREAMINFO), and where the first frame starts. An ID3v2 tag before it (some taggers put one
    there) is skipped: it sent such files to another decoder, which lost their last frame when a tag also followed
    (the desktop's native engine check, 2026-10-02). */
export function flacHeader(head: Uint8Array): { info: FlacInfo; start: number } | null {
  const id3 = head.length >= 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33 ? 10 + ((head[6] & 0x7f) << 21 | (head[7] & 0x7f) << 14 | (head[8] & 0x7f) << 7 | (head[9] & 0x7f)) + (head[5] & 0x10 ? 10 : 0) : 0;
  if (head.length < id3 + 42 || head[id3] !== 0x66 || head[id3 + 1] !== 0x4c || head[id3 + 2] !== 0x61 || head[id3 + 3] !== 0x43) return null;
  let at = id3 + 4, info: FlacInfo | null = null;
  for (;;) {
    if (at + 4 > head.length) return null;
    const last = head[at] & 0x80, type = head[at] & 0x7f, len = (head[at + 1] << 16) | (head[at + 2] << 8) | head[at + 3];
    if (type === 0) {
      const r = new Bits(); r.b = head.subarray(at + 4, at + 4 + len);
      r.read(16); r.read(16); r.read(24);
      const maxFrame = r.read(24), sampleRate = r.read(20), channels = r.read(3) + 1, bits = r.read(5) + 1;
      const total = r.read(4) * 2 ** 32 + r.read(32);
      info = { sampleRate, channels, bits, total, maxFrame };
    }
    at += 4 + len;
    if (last) return info ? { info, start: at } : null;
  }
}

/** The samples of a FLAC file of `size` bytes, read with `read(start, end)` (end exclusive). Throws on a broken stream. */
export async function decodeFlac(size: number, read: (start: number, end: number) => Promise<Uint8Array>): Promise<FlacPcm> {
  // The metadata can be large (pictures): read until STREAMINFO and its end are in.
  let head = await read(0, Math.min(size, 1 << 16)), h = flacHeader(head);
  for (let want = 1 << 20; !h && want < size * 2 && head.length < size; want *= 4) { head = await read(0, Math.min(size, want)); h = flacHeader(head); }
  if (!h) throw new Error('FLAC: no stream header');
  const { info } = h;
  const nch = info.channels, chunk = 8 << 20, margin = Math.max(1 << 20, info.maxFrame * 2 || 0);
  let cap = info.total || 0, total = 0;
  let out = Array.from({ length: nch }, () => new Float32Array(cap));
  const r = new Bits();
  r.base = h.start; r.b = await read(h.start, Math.min(size, h.start + chunk));
  const block: Int32Array[] = Array.from({ length: nch }, () => new Int32Array(65536));
  const more = async () => {
    const keep = r.pos >>> 3, rest = r.b.subarray(keep), next = await read(r.base + r.b.length, Math.min(size, r.base + r.b.length + chunk));
    const b = new Uint8Array(rest.length + next.length); b.set(rest); b.set(next, rest.length);
    r.base += keep; r.pos &= 7; r.b = b;
    return next.length > 0;
  };
  for (;;) {
    // The next frame's sync code, then a whole frame's worth ahead of it in the window. Anything before it is skipped:
    // a tag at the end, a damaged part, or the 17 MB of zeros after the metadata of the user's Blue Train FLACs.
    for (;;) {
      r.align();
      const b = r.b;
      let i = r.pos >>> 3;
      while (i + 1 < b.length && !(b[i] === 0xff && (b[i + 1] & 0xfe) === 0xf8)) i++;
      r.pos = i * 8;
      if ((r.left() >= margin && i + 1 < b.length) || r.base + b.length >= size || !(await more())) break;
    }
    if (r.left() < 4) break;
    const n = frame(r, info, block);
    if (n === 0) break;
    if (total + n > cap) {
      cap = Math.ceil((total + n) * 1.25) + 65536;
      out = out.map(c => { const x = new Float32Array(cap); x.set(c.subarray(0, total)); return x; });
    }
    const scale = 1 / 2 ** (r.bits - 1);
    for (let c = 0; c < nch; c++) { const src = block[c], dst = out[c]; for (let i = 0; i < n; i++) dst[total + i] = src[i] * scale; }
    total += n;
  }
  return { sampleRate: info.sampleRate, bits: info.bits, channels: out.map(c => c.length === total ? c : c.slice(0, total)) };
}

/** One frame into `block` (one Int32Array per channel): its number of samples, or 0 at the end of the stream. */
function frame(r: Bits, info: FlacInfo, block: Int32Array[]): number {
  // At the sync code (14 bits: 11111111111110), found by the caller.
  r.read(15); r.read(1);   // sync + reserved, blocking strategy
  const bsCode = r.read(4), srCode = r.read(4), chCode = r.read(4), ssCode = r.read(3);
  r.read(1);
  // The frame or sample number, UTF-8 coded (1–7 bytes).
  const first = r.read(8);
  let extra = 0;
  if (first >= 0xfe) extra = 6; else if (first >= 0xfc) extra = 5; else if (first >= 0xf8) extra = 4; else if (first >= 0xf0) extra = 3; else if (first >= 0xe0) extra = 2; else if (first >= 0xc0) extra = 1;
  for (let i = 0; i < extra; i++) r.read(8);
  let n = BLOCK[bsCode];
  if (bsCode === 6) n = r.read(8) + 1; else if (bsCode === 7) n = r.read(16) + 1;
  if (srCode === 12) r.read(8); else if (srCode === 13 || srCode === 14) r.read(16);
  r.read(8);   // CRC-8 (the rate is the stream's: a frame's own isn't used)
  const bits = ssCode === 0 ? info.bits : SIZE[ssCode];
  if (!n || !bits) throw new Error('FLAC: a frame header that can’t be read');
  r.bits = bits;
  const nch = chCode < 8 ? chCode + 1 : 2;
  if (nch !== info.channels) throw new Error('FLAC: the channels change mid-stream');
  for (let c = 0; c < nch; c++) {
    // The side channel has one more bit.
    const side = (chCode === 8 && c === 1) || (chCode === 9 && c === 0) || (chCode === 10 && c === 1);
    subframe(r, block[c], n, bits + (side ? 1 : 0));
  }
  const a = block[0], b = block[1];
  if (chCode === 8) for (let i = 0; i < n; i++) b[i] = a[i] - b[i];                 // left, side
  else if (chCode === 9) for (let i = 0; i < n; i++) a[i] = a[i] + b[i];            // side, right
  else if (chCode === 10) for (let i = 0; i < n; i++) {                              // mid, side
    const s = b[i], m = (a[i] * 2) | (s & 1);
    a[i] = (m + s) >> 1; b[i] = (m - s) >> 1;
  }
  r.align();
  r.read(16);   // CRC-16
  return n;
}

function subframe(r: Bits, s: Int32Array, n: number, bits: number) {
  if (r.read(1)) throw new Error('FLAC: a subframe that can’t be read');
  const type = r.read(6);
  let wasted = 0;
  if (r.read(1)) wasted = r.unary() + 1;
  const b = bits - wasted;
  if (type === 0) { const v = r.signed(b); for (let i = 0; i < n; i++) s[i] = v; }
  else if (type === 1) { for (let i = 0; i < n; i++) s[i] = r.signed(b); }
  else if (type >= 8 && type <= 12) {
    const order = type - 8;
    for (let i = 0; i < order; i++) s[i] = r.signed(b);
    residual(r, s, n, order);
    fixed(s, n, order);
  } else if (type >= 32) {
    const order = type - 31;
    for (let i = 0; i < order; i++) s[i] = r.signed(b);
    const precision = r.read(4) + 1;
    if (precision === 16) throw new Error('FLAC: a bad LPC precision');
    const shift = r.signed(5);
    const coef = new Float64Array(order);
    for (let i = 0; i < order; i++) coef[i] = r.signed(precision);
    residual(r, s, n, order);
    lpc(s, n, order, coef, shift);
  } else throw new Error('FLAC: a reserved subframe type');
  if (wasted) for (let i = 0; i < n; i++) s[i] *= 2 ** wasted;
}

/** The residual (partitioned Rice), into s[order…n). */
function residual(r: Bits, s: Int32Array, n: number, order: number) {
  const method = r.read(2);
  if (method > 1) throw new Error('FLAC: a reserved residual coding');
  const pbits = method ? 5 : 4, escape = method ? 31 : 15;
  const porder = r.read(4), parts = 1 << porder;
  let i = order;
  for (let p = 0; p < parts; p++) {
    const count = (n >> porder) - (p === 0 ? order : 0);
    const k = r.read(pbits);
    if (k === escape) {
      const raw = r.read(5);
      for (let j = 0; j < count; j++) s[i++] = raw ? r.signed(raw) : 0;
      continue;
    }
    for (let j = 0; j < count; j++) {
      const q = r.unary(), u = q * 2 ** k + r.read(k);
      // Zigzag: 0, -1, 1, -2, 2…
      s[i++] = u % 2 ? -(u + 1) / 2 : u / 2;
    }
  }
}

function fixed(s: Int32Array, n: number, order: number) {
  switch (order) {
    case 1: for (let i = 1; i < n; i++) s[i] += s[i - 1]; break;
    case 2: for (let i = 2; i < n; i++) s[i] += 2 * s[i - 1] - s[i - 2]; break;
    case 3: for (let i = 3; i < n; i++) s[i] += 3 * s[i - 1] - 3 * s[i - 2] + s[i - 3]; break;
    case 4: for (let i = 4; i < n; i++) s[i] += 4 * s[i - 1] - 6 * s[i - 2] + 4 * s[i - 3] - s[i - 4]; break;
  }
}

/** The prediction, in doubles: 32 coefficients of 15 bits on 24-bit samples stay exact (under 2^53). */
function lpc(s: Int32Array, n: number, order: number, coef: Float64Array, shift: number) {
  const inv = 2 ** -shift;   // exact: a power of two
  for (let i = order; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < order; j++) sum += coef[j] * s[i - 1 - j];
    s[i] += Math.floor(sum * inv);
  }
}
