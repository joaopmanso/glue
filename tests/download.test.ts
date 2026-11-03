import { describe, expect, it } from 'vitest';
import { crc32 } from '../src/core/zip';
import { ZipWriter, type ZipSink } from '../src/core/zipStream';
import { planLists, planSongs, safeName } from '../src/core/library/downloadPlan';

/** A sink over one growing buffer. */
function memory() {
  let b = new Uint8Array(1 << 16), len = 0;
  const fit = (n: number) => { if (n > b.length) { const c = new Uint8Array(n * 2); c.set(b); b = c; } };
  const sink: ZipSink = {
    write: async (p, d) => { fit(p + d.length); b.set(d, p); len = Math.max(len, p + d.length); },
    patch: async (p, d) => { b.set(d, p); },
    truncate: async n => { len = n; },
  };
  return { sink, bytes: () => b.slice(0, len) };
}

/** Reads a zip by its central directory, as an unzipper does, ZIP64 included. */
function read(z: Uint8Array) {
  const v = new DataView(z.buffer), dec = new TextDecoder();
  let e = z.length - 22;
  while (v.getUint32(e, true) !== 0x06054b50) e--;
  let count = v.getUint16(e + 10, true), at = v.getUint32(e + 16, true);
  const zip64 = v.getUint32(e + 16, true) === 0xffffffff;
  if (zip64) {
    expect(v.getUint32(e - 20, true)).toBe(0x07064b50);
    const r = Number(v.getBigUint64(e - 12, true));
    expect(v.getUint32(r, true)).toBe(0x06064b50);
    count = Number(v.getBigUint64(r + 32, true)); at = Number(v.getBigUint64(r + 48, true));
  }
  const out: { path: string; data: Uint8Array; crcOk: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const crc = v.getUint32(at + 16, true), nameLen = v.getUint16(at + 28, true), extraLen = v.getUint16(at + 30, true);
    let size = v.getUint32(at + 24, true), off = v.getUint32(at + 42, true);
    const path = dec.decode(z.subarray(at + 46, at + 46 + nameLen));
    if (extraLen) {
      let x = at + 46 + nameLen + 4;
      expect(v.getUint16(x - 4, true)).toBe(1);
      if (size === 0xffffffff) { size = Number(v.getBigUint64(x, true)); x += 16; }
      if (off === 0xffffffff) off = Number(v.getBigUint64(x, true));
    }
    expect(v.getUint32(off, true)).toBe(0x04034b50);
    expect(v.getUint16(off + 8, true)).toBe(0);   // stored
    expect(v.getUint32(off + 14, true)).toBe(crc);
    const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), data = z.subarray(start, start + size);
    out.push({ path, data, crcOk: crc32(data) === crc });
    at += 46 + nameLen + extraLen + v.getUint16(at + 32, true);
  }
  return { entries: out, zip64 };
}
const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * seed + 7) & 255);

describe('the streaming zip', () => {
  it('holds what went in, in pieces, stored, with its CRC', async () => {
    const m = memory(), z = new ZipWriter(m.sink), a = bytes(5000), b = bytes(300, 3);
    await z.add('Set/01 Ünï.flac', a.length); await z.write(a.subarray(0, 1000)); await z.write(a.subarray(1000)); await z.end();
    await z.add('Set/02 b.mp3', b.length); await z.write(b); await z.end();
    expect(await z.finish()).toBe(2);
    const { entries, zip64 } = read(m.bytes());
    expect(zip64).toBe(false);
    expect(entries.map(e => e.path)).toEqual(['Set/01 Ünï.flac', 'Set/02 b.mp3']);
    expect(entries.every(e => e.crcOk)).toBe(true);
    expect(entries[0].data).toEqual(a);
  });
  it('past 4 GB it goes to ZIP64 (the limit brought down, to read one back)', async () => {
    const m = memory(), z = new ZipWriter(m.sink, 1000), a = bytes(800), b = bytes(1500, 5), c = bytes(40, 9);
    for (const [p, d] of [['a', a], ['b', b], ['c', c]] as const) { await z.add(p, d.length); await z.write(d); await z.end(); }
    await z.finish();
    const { entries, zip64 } = read(m.bytes());
    expect(zip64).toBe(true);
    expect(entries.map(e => [e.path, e.data.length, e.crcOk])).toEqual([['a', 800, true], ['b', 1500, true], ['c', 40, true]]);
  });
  it('a song that fails half way leaves no trace', async () => {
    const m = memory(), z = new ZipWriter(m.sink), a = bytes(100);
    await z.add('a', 100); await z.write(a); await z.end();
    await z.add('broken', 9999); await z.write(bytes(500)); await z.drop();
    await z.add('c', 100); await z.write(a); await z.end();
    await z.finish();
    expect(read(m.bytes()).entries.map(e => e.path)).toEqual(['a', 'c']);
  });
  it('a file that isn’t the size it said is refused', async () => {
    const z = new ZipWriter(memory().sink);
    await z.add('a', 100); await z.write(bytes(50));
    await expect(z.end()).rejects.toThrow(/50 bytes/);
  });
});

describe('what a download calls its files', () => {
  it('names fit any disk', () => {
    expect(safeName('AC/DC: Back? "In" <Black>.mp3')).toBe('AC_DC_ Back_ _In_ _Black_.mp3');
    expect(safeName('con.mp3')).toBe('_con.mp3');
    expect(safeName('trailing... ')).toBe('trailing');
    expect(safeName('  ')).toBe('Untitled');
    const long = safeName('x'.repeat(300) + '.flac');
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('.flac')).toBe(true);
  });
  it('songs picked: their own names, each once whatever its case', () => {
    expect(planSongs([{ id: '1', fileName: 'A.mp3' }, { id: '2', fileName: 'a.mp3' }, { id: '3', fileName: 'b.mp3' }]).map(p => p.path)).toEqual(['A.mp3', 'a (2).mp3', 'b.mp3']);
  });
  it('a playlist: a folder, its songs numbered in the set’s order', () => {
    const p = planLists([{ path: [{ id: 'l', name: 'Friday: late' }], songs: [{ id: '1', fileName: 'z.mp3' }, { id: '2', fileName: 'a.flac' }] }]);
    expect(p).toEqual([{ id: '1', path: 'Friday_ late/01 z.mp3' }, { id: '2', path: 'Friday_ late/02 a.flac' }]);
  });
  it('a hundred songs number with three figures, so they sort', () => {
    const songs = Array.from({ length: 100 }, (_, i) => ({ id: String(i), fileName: 's.mp3' }));
    const p = planLists([{ path: [{ id: 'l', name: 'L' }], songs }]);
    expect(p[0].path).toBe('L/001 s.mp3');
    expect(p[99].path).toBe('L/100 s.mp3');
  });
  it('a folder keeps its playlists inside; two of one name stay two; a song can be in both', () => {
    const s = { id: '1', fileName: 's.mp3' }, gigs = { id: 'f', name: 'Gigs' };
    const p = planLists([
      { path: [gigs], songs: [] },
      { path: [gigs, { id: 'a', name: 'Set' }], songs: [s] },
      { path: [gigs, { id: 'b', name: 'set' }], songs: [s] },
    ]);
    expect(p.map(x => x.path)).toEqual(['Gigs/Set/01 s.mp3', 'Gigs/set (2)/01 s.mp3']);
  });
});
