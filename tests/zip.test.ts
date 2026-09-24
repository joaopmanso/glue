import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { crc32, createZip, readZip } from '../src/core/zip';

describe('zip (ADR 0026)', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('round-trips stored and deflated entries, with UTF-8 names', async () => {
    const text = new TextEncoder().encode(JSON.stringify({ hello: 'world', list: Array.from({ length: 500 }, (_, i) => i) }));
    const random = Uint8Array.from({ length: 3000 }, (_, i) => (i * 2654435761) >>> 24);
    const blob = await createZip([{ path: 'a/über.json', data: text }, { path: 'b.bin', data: random }, { path: 'tiny.txt', data: new Uint8Array([1, 2, 3]) }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (process.env.ZIP_OUT) writeFileSync(process.env.ZIP_OUT, bytes);
    expect(bytes.length).toBeLessThan(text.length + random.length);   // the JSON shrank
    const back = await readZip(bytes);
    expect(back.map(e => e.path)).toEqual(['a/über.json', 'b.bin', 'tiny.txt']);
    expect(back[0].data).toEqual(text); expect(back[1].data).toEqual(random); expect(Array.from(back[2].data)).toEqual([1, 2, 3]);
  });
  it('refuses a damaged zip', async () => {
    const bytes = new Uint8Array(await (await createZip([{ path: 'x.txt', data: new TextEncoder().encode('x'.repeat(500)) }])).arrayBuffer());
    bytes[40] ^= 0xff;
    await expect(readZip(bytes)).rejects.toThrow();
    await expect(readZip(new Uint8Array(10))).rejects.toThrow('isn’t a zip');
  });
});
