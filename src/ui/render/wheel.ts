import type { Key } from '../../core/types';
import { fifthsPos, keyAt, keyLabel, shortMusical, type KeyNotation } from '../../core/audio/keys';
import type { Theme } from './canvas';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Circle-of-fifths SVG body (for a 200×200 viewBox): the key highlighted, its mixable neighbours tinted. */
export function wheelSvg(key: Key | null, n: KeyNotation, C: Theme): string {
  const pos = key ? fifthsPos(key) : -1, ring = key ? key.mode : null;
  const compatible = (p: number, mode: Key['mode']) => !!key && ((mode === ring && (p === (pos + 1) % 12 || p === (pos + 11) % 12)) || (mode !== ring && p === pos));
  const wedge = (r0: number, r1: number, a0: number, a1: number) => {
    const pt = (r: number, a: number) => [100 + r * Math.sin(a), 100 - r * Math.cos(a)].map(v => v.toFixed(2)).join(' ');
    return `M${pt(r1, a0)} A${r1} ${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 0 0 ${pt(r0, a0)} Z`;
  };
  const label = (k: Key) => n === 'musical' ? shortMusical(k) : keyLabel(k, n);
  let out = '';
  for (const [mode, r0, r1] of [['major', 64, 97], ['minor', 32, 63]] as const) {
    for (let p = 0; p < 12; p++) {
      const a0 = (p - 0.5) * Math.PI / 6 + 0.012, a1 = (p + 0.5) * Math.PI / 6 - 0.012, k = keyAt(p, mode);
      const hit = !!key && p === pos && mode === ring, near = compatible(p, mode);
      const fill = hit ? C.accent : near ? 'color-mix(in srgb, ' + C.accent + ' 30%, ' + C.raised + ')' : C.raised;
      const ink = hit ? C.accentInk : near ? C.ink : C.muted;
      const rm = (r0 + r1) / 2, am = p * Math.PI / 6;
      out += `<path d="${wedge(r0, r1, a0, a1)}" fill="${fill}" stroke="${C.surface}" stroke-width="1"><title>${esc(keyLabel(k, 'musical'))} · ${keyLabel(k, 'camelot')} · ${keyLabel(k, 'open')}</title></path>`;
      out += `<text x="${(100 + rm * Math.sin(am)).toFixed(1)}" y="${(100 - rm * Math.cos(am)).toFixed(1)}" fill="${ink}"${hit ? ' font-weight="700"' : ''}>${esc(label(k))}</text>`;
    }
  }
  out += `<text x="100" y="94" fill="${C.muted}" style="font-size:8px">${n === 'camelot' ? 'CAMELOT' : n === 'open' ? 'OPEN KEY' : 'FIFTHS'}</text>`;
  out += `<text x="100" y="106" fill="${C.ink}" style="font-size:11px;font-weight:700">${key ? esc(label(key)) : '—'}</text>`;
  return out;
}
