/* A zip written as it goes, for songs (ADR 0193): nothing is held in memory but the piece being written. Entries are
   stored (audio doesn't shrink). A song's size is known before its bytes, so only its CRC is patched in afterwards, and
   no data descriptors are needed: that's what every unzipper reads, on Windows, macOS and players' own tools alike.
   ZIP64 only where something passes 4 GB (a set often does). */
import { crc32, dosTime } from './zip';

/** Where the zip goes. Writes come in order, except `patch`, which goes back over what was written. */
export interface ZipSink {
  write(pos: number, b: Uint8Array): Promise<void>;
  patch(pos: number, b: Uint8Array): Promise<void>;
  /** Everything from `pos` on is gone (an entry that failed). */
  truncate(pos: number): Promise<void>;
}

interface Written { name: Uint8Array; size: number; crc: number; offset: number; time: number; date: number }
const enc = new TextEncoder();
const u64 = (v: DataView, at: number, n: number) => v.setBigUint64(at, BigInt(n), true);

export class ZipWriter {
  private pos = 0;
  private done: Written[] = [];
  private cur: (Written & { start: number; got: number; crcAt: number }) | null = null;
  /** `limit`: past this a field goes to ZIP64 (only tests set it). */
  constructor(private sink: ZipSink, private limit = 0xffffffff) {}

  get bytes() { return this.pos; }

  private async put(b: Uint8Array) { await this.sink.write(this.pos, b); this.pos += b.length; }

  /** A new entry of exactly `size` bytes. */
  async add(path: string, size: number, mtime?: Date) {
    if (this.cur) throw new Error('The last entry isn’t finished.');
    const name = enc.encode(path), { time, date } = dosTime(mtime ?? new Date());
    const big = size >= this.limit, extra = big ? 20 : 0;
    const h = new Uint8Array(30 + name.length + extra), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, big ? 45 : 20, true); v.setUint16(6, 0x0800, true);   // UTF-8 names
    v.setUint16(8, 0, true); v.setUint16(10, time, true); v.setUint16(12, date, true);
    v.setUint32(18, big ? 0xffffffff : size, true); v.setUint32(22, big ? 0xffffffff : size, true);
    v.setUint16(26, name.length, true); v.setUint16(28, extra, true);
    h.set(name, 30);
    if (big) { v.setUint16(30 + name.length, 1, true); v.setUint16(32 + name.length, 16, true); u64(v, 34 + name.length, size); u64(v, 42 + name.length, size); }
    const start = this.pos;
    await this.put(h);
    this.cur = { name, size, crc: 0, offset: start, time, date, start, got: 0, crcAt: start + 14 };
  }
  /** The entry's next bytes. */
  async write(b: Uint8Array) {
    const c = this.cur;
    if (!c) throw new Error('No entry is open.');
    c.crc = crc32(b, c.crc); c.got += b.length;
    await this.put(b);
  }
  /** The entry is complete: its CRC goes into its header. */
  async end() {
    const c = this.cur;
    if (!c) throw new Error('No entry is open.');
    if (c.got !== c.size) throw new Error('The file was ' + c.got + ' bytes, not the ' + c.size + ' expected.');
    const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, c.crc, true);
    await this.sink.patch(c.crcAt, b);
    this.done.push(c); this.cur = null;
  }
  /** The entry failed: it's taken back out, the zip as it was before it. */
  async drop() {
    const c = this.cur;
    if (!c) return;
    this.cur = null; this.pos = c.start;
    await this.sink.truncate(c.start);
  }
  /** The zip's directory. How many entries it has. */
  async finish(): Promise<number> {
    if (this.cur) throw new Error('The last entry isn’t finished.');
    const start = this.pos;
    for (const e of this.done) {
      const bigS = e.size >= this.limit, bigO = e.offset >= this.limit, extra = (bigS ? 16 : 0) + (bigO ? 8 : 0), head = extra ? 4 : 0;
      const h = new Uint8Array(46 + e.name.length + head + extra), v = new DataView(h.buffer);
      v.setUint32(0, 0x02014b50, true); v.setUint16(4, 45, true); v.setUint16(6, extra ? 45 : 20, true); v.setUint16(8, 0x0800, true);
      v.setUint16(12, e.time, true); v.setUint16(14, e.date, true); v.setUint32(16, e.crc, true);
      v.setUint32(20, bigS ? 0xffffffff : e.size, true); v.setUint32(24, bigS ? 0xffffffff : e.size, true);
      v.setUint16(28, e.name.length, true); v.setUint16(30, head + extra, true);
      v.setUint32(42, bigO ? 0xffffffff : e.offset, true);
      h.set(e.name, 46);
      if (extra) {
        let at = 46 + e.name.length;
        v.setUint16(at, 1, true); v.setUint16(at + 2, extra, true); at += 4;
        if (bigS) { u64(v, at, e.size); u64(v, at + 8, e.size); at += 16; }
        if (bigO) u64(v, at, e.offset);
      }
      await this.put(h);
    }
    const size = this.pos - start, n = this.done.length;
    const big = n >= Math.min(this.limit, 0xffff) || size >= this.limit || start >= this.limit;
    if (big) {
      const z = new Uint8Array(76), v = new DataView(z.buffer);
      v.setUint32(0, 0x06064b50, true); u64(v, 4, 44); v.setUint16(12, 45, true); v.setUint16(14, 45, true);
      u64(v, 24, n); u64(v, 32, n); u64(v, 40, size); u64(v, 48, start);
      v.setUint32(56, 0x07064b50, true); u64(v, 64, this.pos); v.setUint32(72, 1, true);
      await this.put(z);
    }
    const e = new Uint8Array(22), v = new DataView(e.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, big ? 0xffff : n, true); v.setUint16(10, big ? 0xffff : n, true);
    v.setUint32(12, big ? 0xffffffff : size, true); v.setUint32(16, big ? 0xffffffff : start, true);
    await this.put(e);
    return n;
  }
}
