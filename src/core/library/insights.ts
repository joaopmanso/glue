/* A playlist at a glance (ADR 0032): length, tempo flow, keys and harmonic transitions, quality mix,
   and how its tags overlap. Pure: works on plain per-track facts, in playlist order. */
import { keyFit } from './autoplaylist';
import { tagCounts, venn } from './tagging';
import type { Key } from '../types';

export interface InsightTrack { duration: number | null; bpm: number | null; key: Key | null; tags: string[]; grade: 'ok' | 'warn' | 'bad' | 'info' | null }
export interface Insights {
  count: number;
  total: number;                          // seconds, known lengths only
  shortest: number | null; longest: number | null; unknownLength: number;
  bpm: { min: number; max: number; avg: number } | null;
  flow: (number | null)[];                // BPM per position
  keys: [string, number][];               // key id ('8A') → count, most used first
  mixes: { good: number; ok: number; clash: number; unknown: number };
  grades: Record<'ok' | 'warn' | 'bad' | 'info' | 'none', number>;
  tags: [string, number][];               // most used first
  untagged: number;
}

export function insights(ts: InsightTrack[], keyId: (k: Key) => string): Insights {
  const lens = ts.map(t => t.duration).filter((d): d is number => d != null && d > 0);
  const bpms = ts.map(t => t.bpm).filter((b): b is number => b != null && b > 0);
  const keys = new Map<string, number>();
  for (const t of ts) if (t.key) { const k = keyId(t.key); keys.set(k, (keys.get(k) ?? 0) + 1); }
  const mixes = { good: 0, ok: 0, clash: 0, unknown: 0 };
  for (let i = 1; i < ts.length; i++) {
    const f = keyFit(ts[i - 1].key, ts[i].key);
    if (f == null) mixes.unknown++; else if (f >= 0.85) mixes.good++; else if (f >= 0.5) mixes.ok++; else mixes.clash++;
  }
  const grades = { ok: 0, warn: 0, bad: 0, info: 0, none: 0 };
  for (const t of ts) grades[t.grade ?? 'none']++;
  return {
    count: ts.length,
    total: lens.reduce((a, b) => a + b, 0),
    shortest: lens.length ? Math.min(...lens) : null, longest: lens.length ? Math.max(...lens) : null, unknownLength: ts.length - lens.length,
    bpm: bpms.length ? { min: Math.min(...bpms), max: Math.max(...bpms), avg: bpms.reduce((a, b) => a + b, 0) / bpms.length } : null,
    flow: ts.map(t => t.bpm && t.bpm > 0 ? t.bpm : null),
    keys: [...keys].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    mixes, grades,
    tags: tagCounts(ts.map(t => t.tags)),
    untagged: ts.filter(t => !t.tags.length).length,
  };
}

/** The Venn regions for up to three tags (see tagging.venn), plus each tag's total. */
export function tagOverlap(ts: InsightTrack[], sets: string[]) {
  const regions = venn(ts.map(t => t.tags), sets);
  const totals = sets.slice(0, 3).map((_, i) => regions.reduce((a, n, m) => a + (m & (1 << i) ? n : 0), 0));
  return { regions, totals };
}
