/* GLUE Home has no audio code of its own (ADR 0147, batch 4): its pages (home/ui) never reach the website's analysis,
   decoders, workers or audio packages; GLUE Home's Rust engine does that work. Walks every import GLUE Home's pages
   can reach (type-only imports aside: they're gone once built). */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const FORBIDDEN = [/^src\/core\/audio\//, /^src\/core\/formats\//, /^src\/core\/stems\//, /^src\/workers\//, /^src\/lib\/pool\.ts$/, /^src\/lib\/stems/];
const FORBIDDEN_PACKAGES = ['mediabunny', 'three', 'threejs-visualisers', 'sql.js'];

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const p of [base, base + '.ts', base + '.svelte.ts', base + '.js', join(base, 'index.ts')]) if (existsSync(p) && statSync(p).isFile()) return p;
  return null;
}

/** Every module reachable from home/ui, and the packages they import, with who imports each. */
function reach() {
  const seen = new Map<string, string>(), packages = new Map<string, string>(), workers: string[] = [];
  const todo = readdirSync(join(ROOT, 'home/ui')).filter(f => /\.(ts|svelte)$/.test(f)).map(f => join(ROOT, 'home/ui', f));
  for (const f of todo) seen.set(f, 'home/ui');
  while (todo.length) {
    const f = todo.pop()!, src = readFileSync(f, 'utf8');
    if (/new\s+(Shared)?Worker\s*\(/.test(src)) workers.push(relative(ROOT, f));
    for (const m of src.matchAll(/(?:^|[\s;])(?:import|export)\s+(type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
      if (m[1]) continue;   // `import type …`: nothing of it is bundled
      const spec = m[2] ?? m[3];
      if (spec.startsWith('.')) {
        const to = resolveImport(f, spec.replace(/\?.*$/, ''));
        if (to && !seen.has(to)) { seen.set(to, relative(ROOT, f)); todo.push(to); }
      } else packages.set(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0], relative(ROOT, f));
    }
  }
  return { files: [...seen].map(([f, by]) => [relative(ROOT, f).replace(/\\/g, '/'), by] as const), packages, workers };
}

describe('GLUE Home has no audio JavaScript (ADR 0147)', () => {
  const { files, packages, workers } = reach();
  it('reaches none of the website’s analysis, decoders or workers', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter(([f]) => FORBIDDEN.some(r => r.test(f))).map(([f, by]) => `${f} (from ${by})`)).toEqual([]);
  });
  it('makes no WebRTC connection of its own: GLUE Home\'s connections are Rust\'s (ADR 0150)', () => {
    const ui = files.filter(([f]) => f.startsWith('home/ui/')).map(([f]) => f);
    expect(ui.filter(f => /new\s+RTCPeerConnection|createDataChannel|ondatachannel/.test(readFileSync(join(ROOT, f), 'utf8')))).toEqual([]);
  });
  it('imports no audio package and starts no worker', () => {
    expect(FORBIDDEN_PACKAGES.filter(p => packages.has(p)).map(p => `${p} (from ${packages.get(p)})`)).toEqual([]);
    expect(workers).toEqual([]);
  });
});
