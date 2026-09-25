/* Schema migrations: every JSON file carries schemaVersion; older files are upgraded on load.
   Add a step here whenever SCHEMA in types.ts is bumped. */
import { SCHEMA } from './types';

type Kind = 'home' | 'profile' | 'collection' | 'tracks' | 'analysis' | 'list' | 'source';
type Step = (data: Record<string, unknown>) => Record<string, unknown>;

// steps[kind][n] upgrades a file from version n to n + 1.
const steps: Partial<Record<Kind, Record<number, Step>>> = {};

export function migrate<T>(kind: Kind, data: T): T {
  const d = data as unknown as Record<string, unknown>;
  let v = typeof d.schemaVersion === 'number' ? d.schemaVersion : 0;
  if (v > SCHEMA) throw new Error('This GLUE folder was written by a newer version of GLUE. Update the page (reload) and try again.');
  let out = d;
  while (v < SCHEMA) {
    const step = steps[kind]?.[v];
    out = step ? step(out) : out;
    v++;
    out.schemaVersion = v;
  }
  return out as unknown as T;
}
