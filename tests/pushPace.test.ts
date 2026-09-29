import { describe, expect, it } from 'vitest';
import { PushPace } from '../src/core/shared/pace';
import { syncShared, type SharedCloud } from '../src/store/shared/engine';
import { MemDir, asDir } from './memfs';
import { writeJSON } from '../src/store/fsx';

describe('pushes to GLUE Cloud, paced (ADR 0105)', () => {
  it('nothing analysing: everything at once; analysing: the edits at once, the rest once an hour', () => {
    const pace = new PushPace(3600e3);
    expect(pace.plan(0, false)).toBe('all');
    pace.pushed(1000, 'all');
    expect(pace.plan(2000, true)).toBe('none');
    pace.edited(['lists/l1.json', 'tracks/ab.json']);
    const plan = pace.plan(3000, true);
    expect(plan instanceof Set && [...plan].sort()).toEqual(['lists/l1.json', 'tracks/ab.json']);
    pace.pushed(3000, plan);
    expect(pace.plan(4000, true)).toBe('none');
    expect(pace.plan(1000 + 3600e3, true)).toBe('all');
    expect(pace.plan(5000, false)).toBe('all');
  });

  it('a push of some files sends only those; none sends nothing, and the rest goes later', async () => {
    const sent: string[][] = [];
    let seq = 0;
    const cloud: SharedCloud = {
      async changes() { return { seq, more: false, files: [] }; },
      async bundle() { return ''; },
      async push(body) { const paths = body.split('\n').filter(Boolean).map(l => l.split('\t')[0]); sent.push(paths); return { rev: ++seq, stored: paths, stale: [] }; },
    };
    const root = asDir(new MemDir()), p = { root, pid: 'p1', cid: 'c1', me: 'desk', cloud };
    for (const f of ['tracks/aa.json', 'analysis/aa.json', 'lists/l1.json']) await writeJSON(root, 'profiles/p1/collections/c1/' + f, { f });
    expect((await syncShared(p, 'none')).pushed).toBe(0);
    expect(sent).toEqual([]);
    expect((await syncShared(p, new Set(['lists/l1.json']))).pushed).toBe(1);
    expect(sent).toEqual([['lists/l1.json']]);
    expect((await syncShared(p, 'all')).pushed).toBe(2);
    expect(sent[1].sort()).toEqual(['analysis/aa.json', 'tracks/aa.json']);
  });
});
