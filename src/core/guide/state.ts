/* What Gluey has shown a person (ADR 0126): the tours they've been through and the feature tips they've had, so each
   shows once per person, not once per device. Kept in the GLUE folder, the account and the browser; the union of
   them is the truth, so whatever was seen anywhere counts everywhere and two devices never undo each other.
   Pure: also used by GLUE Cloud. */

export interface GuideState {
  /** Tours finished or skipped ('welcome' is the first one). */
  seen: string[];
  /** Feature tips shown (one per feature, the first time its view opens). */
  tips: string[];
  /** Gluey's tips turned off (true) or on (false), and when (the newer choice wins). */
  quiet?: boolean;
  quietAt?: number;
  /** Gluey's button hidden (true) or shown (false), and when (the newer choice wins). */
  hide?: boolean;
  hideAt?: number;
}

export const emptyGuide = (): GuideState => ({ seen: [], tips: [] });

const ID = /^[a-z0-9-]{1,40}$/;
const ids = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, 200) : [];

/** A guide state from anything (a file, a request): unknown fields and bad ids dropped. */
export function cleanGuide(v: unknown): GuideState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const g: GuideState = { seen: ids(o.seen), tips: ids(o.tips) };
  if (typeof o.quiet === 'boolean' && typeof o.quietAt === 'number' && Number.isFinite(o.quietAt)) { g.quiet = o.quiet; g.quietAt = o.quietAt; }
  if (typeof o.hide === 'boolean' && typeof o.hideAt === 'number' && Number.isFinite(o.hideAt)) { g.hide = o.hide; g.hideAt = o.hideAt; }
  return g;
}

/** The union of several: every tour and tip seen in any; the newer quiet choice. */
export function mergeGuide(...all: (Partial<GuideState> | null | undefined)[]): GuideState {
  const out = emptyGuide();
  for (const raw of all) {
    if (!raw) continue;
    const g = cleanGuide(raw);
    out.seen = [...new Set([...out.seen, ...g.seen])];
    out.tips = [...new Set([...out.tips, ...g.tips])];
    if (g.quietAt != null && (out.quietAt == null || g.quietAt > out.quietAt)) { out.quiet = g.quiet; out.quietAt = g.quietAt; }
    if (g.hideAt != null && (out.hideAt == null || g.hideAt > out.hideAt)) { out.hide = g.hide; out.hideAt = g.hideAt; }
  }
  return out;
}

/** Whether `b` holds anything `a` doesn't (then `a`'s store is written). */
export function guideAdds(a: GuideState, b: GuideState): boolean {
  return b.seen.some(x => !a.seen.includes(x)) || b.tips.some(x => !a.tips.includes(x)) || (b.quietAt ?? 0) > (a.quietAt ?? 0) || (b.hideAt ?? 0) > (a.hideAt ?? 0);
}
