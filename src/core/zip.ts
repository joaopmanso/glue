/* A small ZIP writer/reader (no dependencies): "deflate" entries via the browser's CompressionStream,
   "stored" for data that doesn't shrink. Reads what it writes and ordinary zips (stored / deflate,
   no ZIP64, no encryption). Used for profile backups (ADR 0026). */

export interface ZipEntry { path: string; data: Uint8Array; mtime?: Date }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data.slice().buffer]).stream().pipeThrough(t)).arrayBuffer());
}
const enc = new TextEncoder(), dec = new TextDecoder();
function dosTime(d: Date) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.path), crc = crc32(e.data);
    let body = e.data, method = 0;
    if (e.data.length > 64) { const z = await pipe(e.data, new CompressionStream('deflate-raw')); if (z.length < e.data.length) { body = z; method = 8; } }
    const { time, date } = dosTime(e.mtime ?? new Date());
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);   // UTF-8 names
    lv.setUint16(8, method, true); lv.setUint16(10, time, true); lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, body.length, true); lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true); local.set(name, 30);
    const cen = new Uint8Array(46 + name.length), cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true); cv.setUint16(12, time, true); cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); cen.set(name, 46);
    parts.push(local, body); central.push(cen);
    offset += local.length + body.length;
    if (offset > 0xffffffff) throw new Error('The backup is larger than 4 GB, which this zip format can’t hold.');
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cenSize, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end].map(p => p.slice().buffer), { type: 'application/zip' });
}

export async function readZip(zip: Uint8Array): Promise<ZipEntry[]> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This isn’t a zip file.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('The zip file is damaged.');
    const method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), lho = v.getUint32(p + 42, true);
    const path = dec.decode(zip.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (path.endsWith('/')) continue;
    const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
    const body = zip.subarray(start, start + csize);
    let data: Uint8Array;
    if (method === 0) data = body.slice();
    else if (method === 8) data = await pipe(body, new DecompressionStream('deflate-raw'));
    else throw new Error('The zip uses a compression GLUE can’t read (' + path + ').');
    if (crc32(data) !== crc) throw new Error('The zip file is damaged (' + path + ').');
    out.push({ path, data });
  }
  return out;
}
