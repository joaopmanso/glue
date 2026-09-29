import { describe, expect, it } from 'vitest';
import { MemDir, asDir } from './memfs';
import { listNames, readText, writeText } from '../src/store/fsx';
import { moveCaches } from '../src/store/shared/caches';

describe('the cache follows a collection into another (ADR 0102)', () => {
  it('moves details, waveforms, fingerprints and covers, renaming the songs that got another id', async () => {
    const c = asDir(new MemDir());
    await writeText(c, 'details/old/aa/aa1.json', '{"a":1}');
    await writeText(c, 'details/old/aa/aa1.bin', 'bin');
    await writeText(c, 'wthumbs/old/bb/bb2.bin', 'wave');
    await writeText(c, 'fp/old/aa/aa1.bin', 'fp');
    await writeText(c, 'fp/old/aa/pack.bin', 'pack');
    await writeText(c, 'art/old/h-64.jpg', 'jpg');
    await writeText(c, 'dupes/old.json', '{}');
    await writeText(c, 'details/other/cc/cc1.json', 'keep');
    const n = await moveCaches(c, 'old', 'new', new Map([['bb2', 'zz9']]));
    expect(n).toBe(5);
    expect(await readText(c, 'details/new/aa/aa1.json')).toBe('{"a":1}');
    expect(await readText(c, 'details/new/aa/aa1.bin')).toBe('bin');
    expect(await readText(c, 'wthumbs/new/zz/zz9.bin')).toBe('wave');   // renamed, in its new shard
    expect(await readText(c, 'fp/new/aa/aa1.bin')).toBe('fp');
    expect(await readText(c, 'fp/new/aa/pack.bin')).toBeNull();           // packs are made again
    expect(await readText(c, 'art/new/h-64.jpg')).toBe('jpg');
    expect(await listNames(c, 'details', 'directory')).toEqual(expect.arrayContaining(['new', 'other']));
    expect(await listNames(c, 'details', 'directory')).not.toContain('old');
    expect(await readText(c, 'dupes/old.json')).toBeNull();
    expect(await readText(c, 'details/other/cc/cc1.json')).toBe('keep');
  });
});
