import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanGuide, guideAdds, mergeGuide } from '../src/core/guide/state';
import { TOURS, guideTargets } from '../src/core/guide/tours';

describe('what Gluey has shown, once per person (ADR 0126)', () => {
  it('the union of the browser’s, the GLUE folder’s and the account’s; the newer quiet choice', () => {
    const g = mergeGuide({ seen: ['welcome'] }, { tips: ['dupes'], quiet: true, quietAt: 2 }, null, { seen: ['welcome', 'dupes'], quiet: false, quietAt: 1 });
    expect(g).toEqual({ seen: ['welcome', 'dupes'], tips: ['dupes'], quiet: true, quietAt: 2 });
    expect(guideAdds(mergeGuide({ seen: ['welcome'] }), g)).toBe(true);
    expect(guideAdds(g, mergeGuide({ seen: ['welcome'] }))).toBe(false);
  });
  it('anything else is dropped', () => {
    expect(cleanGuide({ seen: ['ok', 'Not OK', 5], tips: 'x', quiet: true, extra: 1 })).toEqual({ seen: ['ok'], tips: [] });
    expect(cleanGuide('nonsense')).toEqual({ seen: [], tips: [] });
  });
});

describe('the tours point at parts of GLUE that are there', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.svelte') ? [p] : []; });
  const ui = files('src').map(f => readFileSync(f, 'utf8')).join('\n');
  it('every stop’s target is a data-guide in the UI', () => {
    for (const t of guideTargets()) expect(ui, 'data-guide="' + t + '"').toContain('data-guide="' + t + '"');
  });
  it('tours have ids, stops and words', () => {
    const ids = TOURS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOURS) { expect(t.steps.length).toBeGreaterThan(0); for (const s of t.steps) { expect(s.title.length).toBeGreaterThan(0); expect(s.body.length).toBeGreaterThan(10); } }
  });
});
