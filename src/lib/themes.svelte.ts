/* Themes (ADR 0028): colour tokens, fonts and shape per theme, each with a dark and a light mode.
   Applied as data-theme / data-mode on <html>; the CSS for every theme is generated from this one
   table, so the tokens live in one place. Chosen on the profile screen, remembered per browser and
   in the GLUE folder. */
import { readPref, writePref } from './prefs';
import { setCanvasFonts } from '../ui/render/canvas';

type Tokens = { ground: string; surface: string; raised: string; line: string; line2: string; ink: string; ink2: string; muted: string; accent: string; accentInk: string; ok: string; warn: string; bad: string };
export interface ThemeDef {
  id: string; name: string; blurb: string;
  fonts: { display: string; sans: string; mono: string; css: string | null };   // css: Google Fonts query, loaded on demand
  radius: string; displayWeight: number; displayTracking: string;
  dark: Tokens; light: Tokens;
}
export type Mode = 'dark' | 'light' | 'system';

const G = 'https://fonts.googleapis.com/css2?';
export const THEMES: ThemeDef[] = [
  {
    id: 'classic', name: 'Classic', blurb: 'The original: cool blue on slate, a wide grotesque.',
    fonts: { display: '"Archivo", system-ui, sans-serif', sans: '"Archivo", system-ui, -apple-system, "Segoe UI", sans-serif', mono: '"JetBrains Mono", ui-monospace, Consolas, monospace', css: null },
    radius: '6px', displayWeight: 750, displayTracking: '0',
    dark: { ground: '#0b0e12', surface: '#11161c', raised: '#171d25', line: '#232b36', line2: '#2f3a47', ink: '#e6e9ee', ink2: '#b3bcc8', muted: '#7d8898', accent: '#7cc7ff', accentInk: '#06121d', ok: '#3ecf8e', warn: '#f2c14e', bad: '#ff6b6b' },
    light: { ground: '#f3f5f8', surface: '#ffffff', raised: '#eaeef3', line: '#dbe1e8', line2: '#c5cdd8', ink: '#111821', ink2: '#3a4655', muted: '#687586', accent: '#1d74c4', accentInk: '#ffffff', ok: '#12875a', warn: '#a8790a', bad: '#cc3b3b' },
  },
  {
    // GLUE Stick yellow on black, like the classic glue stick; a darker gold on cream in light mode so
    // text in the accent colour stays readable. The logo follows the accent, so it turns yellow too.
    id: 'stick', name: 'GLUE Stick', blurb: 'GLUE Stick yellow on black, a heavy grotesque, rounded corners.',
    fonts: { display: '"Archivo", system-ui, sans-serif', sans: '"Archivo", system-ui, -apple-system, "Segoe UI", sans-serif', mono: '"JetBrains Mono", ui-monospace, Consolas, monospace', css: null },
    radius: '10px', displayWeight: 850, displayTracking: '-0.015em',
    dark: { ground: '#0c0c0b', surface: '#141412', raised: '#1c1c19', line: '#2a2a25', line2: '#3a3a33', ink: '#f6f3e8', ink2: '#c9c4b3', muted: '#8f8a7a', accent: '#ffd100', accentInk: '#141200', ok: '#4fd18b', warn: '#ff9f1c', bad: '#ff4d3d' },
    light: { ground: '#fff9e6', surface: '#ffffff', raised: '#fbf1cc', line: '#ece0b6', line2: '#dccb90', ink: '#15140f', ink2: '#433f30', muted: '#7a735d', accent: '#b58500', accentInk: '#ffffff', ok: '#16834f', warn: '#b35c00', bad: '#d32a1d' },
  },
  {
    id: 'studio', name: 'Studio', blurb: 'Warm analog desk: walnut and paper, brass accents, a serif for titles.',
    fonts: { display: '"Fraunces", Georgia, serif', sans: '"Hanken Grotesk", system-ui, sans-serif', mono: '"IBM Plex Mono", ui-monospace, Consolas, monospace', css: 'family=Fraunces:opsz,wght@9..144,400..700&family=Hanken+Grotesk:wght@400..800&family=IBM+Plex+Mono:wght@400;600' },
    radius: '8px', displayWeight: 600, displayTracking: '-0.01em',
    dark: { ground: '#15110d', surface: '#1d1813', raised: '#262019', line: '#372d23', line2: '#4a3d30', ink: '#f1e7d6', ink2: '#cdbca3', muted: '#978671', accent: '#e3a449', accentInk: '#1b1206', ok: '#9cc46e', warn: '#e9c75a', bad: '#e46a4f' },
    light: { ground: '#f3ede2', surface: '#fbf7f0', raised: '#eee5d6', line: '#ddd0bb', line2: '#cbb99d', ink: '#241b12', ink2: '#4d3f31', muted: '#84735f', accent: '#a5541a', accentInk: '#fff7ec', ok: '#4a7a2a', warn: '#946506', bad: '#b53e28' },
  },
  {
    id: 'riso', name: 'Riso', blurb: 'Risograph print: fluorescent pink on navy or paper, a characterful grotesque.',
    fonts: { display: '"Bricolage Grotesque", system-ui, sans-serif', sans: '"Bricolage Grotesque", system-ui, sans-serif', mono: '"DM Mono", ui-monospace, Consolas, monospace', css: 'family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=DM+Mono:wght@400;500' },
    radius: '3px', displayWeight: 750, displayTracking: '-0.02em',
    dark: { ground: '#12132a', surface: '#1a1c38', raised: '#232547', line: '#2f325a', line2: '#3f4372', ink: '#f4efe4', ink2: '#c8c3d9', muted: '#8c89a8', accent: '#ff5c8a', accentInk: '#1a0710', ok: '#3fd4b0', warn: '#ffcf4a', bad: '#ff6b57' },
    light: { ground: '#f4efe3', surface: '#fbf8f1', raised: '#ece5d6', line: '#d9d0bf', line2: '#c3b8a3', ink: '#1b1d3a', ink2: '#3d4068', muted: '#716d8a', accent: '#d92e64', accentInk: '#fff6f8', ok: '#0e8a70', warn: '#9c6f00', bad: '#c93d29' },
  },
  {
    id: 'moss', name: 'Moss', blurb: 'Quiet and natural: forest and stone greens, an elegant serif with Geist.',
    fonts: { display: '"Instrument Serif", Georgia, serif', sans: '"Geist", system-ui, sans-serif', mono: '"Geist Mono", ui-monospace, Consolas, monospace', css: 'family=Instrument+Serif:ital@0;1&family=Geist:wght@400..800&family=Geist+Mono:wght@400;600' },
    radius: '10px', displayWeight: 400, displayTracking: '0',
    dark: { ground: '#0f1412', surface: '#151c19', raised: '#1c2521', line: '#26312c', line2: '#34423b', ink: '#e6ece6', ink2: '#b5c2b8', muted: '#7f8e84', accent: '#9fd3a8', accentInk: '#0c1a10', ok: '#7ed49a', warn: '#e4c46a', bad: '#e5806e' },
    light: { ground: '#eef1ec', surface: '#f8faf6', raised: '#e6ebe4', line: '#d3dbd2', line2: '#bcc8bd', ink: '#17211b', ink2: '#3a4a40', muted: '#6a796f', accent: '#2c6a4d', accentInk: '#f3faf5', ok: '#2b7a4c', warn: '#8e680c', bad: '#b04633' },
  },
];
export const themeById = (id: string) => THEMES.find(t => t.id === id) ?? THEMES.find(t => t.id === 'stick')!;

const vars = (t: ThemeDef, k: Tokens, mode: 'dark' | 'light') => [
  `color-scheme: ${mode}`,
  `--ground: ${k.ground}`, `--surface: ${k.surface}`, `--raised: ${k.raised}`, `--line: ${k.line}`, `--line-2: ${k.line2}`,
  `--ink: ${k.ink}`, `--ink-2: ${k.ink2}`, `--muted: ${k.muted}`, `--accent: ${k.accent}`, `--accent-ink: ${k.accentInk}`,
  `--ok: ${k.ok}`, `--warn: ${k.warn}`, `--bad: ${k.bad}`,
  `--font-sans: ${t.fonts.sans}`, `--font-mono: ${t.fonts.mono}`, `--font-display: ${t.fonts.display}`,
  `--radius: ${t.radius}`, `--display-weight: ${t.displayWeight}`, `--display-tracking: ${t.displayTracking}`,
].join('; ');

/** CSS for every theme and mode (also used by the previews, scoped to a class). */
export function themeCss(): string {
  return THEMES.flatMap(t => (['dark', 'light'] as const).map(m =>
    `:root[data-theme="${t.id}"][data-mode="${m}"], .theme-scope[data-theme="${t.id}"][data-mode="${m}"] { ${vars(t, t[m], m)} }`)).join('\n');
}

const loadedFonts = new Set<string>();
export function loadFonts(t: ThemeDef) {
  if (!t.fonts.css || loadedFonts.has(t.id) || typeof document === 'undefined') return;
  loadedFonts.add(t.id);
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = G + t.fonts.css + '&display=swap';
  document.head.appendChild(l);
}

class Themes {
  theme = $state(readPref('theme', 'stick'));   // GLUE Stick is the default (2026-09-25); Classic stays
  mode = $state<Mode>((readPref('mode', 'dark') as Mode) || 'dark');
  systemDark = $state(true);
  /** Bumps when the look changes, so canvases redraw with the new colours. */
  version = $state(0);
  get resolved(): 'dark' | 'light' { return this.mode === 'system' ? (this.systemDark ? 'dark' : 'light') : this.mode; }

  init() {
    if (typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.id = 'mco-themes'; style.textContent = themeCss();
    document.head.appendChild(style);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    this.systemDark = mq ? mq.matches : true;
    mq?.addEventListener('change', e => { this.systemDark = e.matches; this.apply(); });
    this.apply();
  }
  set(theme: string, mode: Mode = this.mode) {
    this.theme = themeById(theme).id; this.mode = mode;
    writePref('theme', this.theme); writePref('mode', mode);
    this.apply();
    this.onChange?.(this.theme, mode);
  }
  toggleMode() { this.set(this.theme, this.resolved === 'dark' ? 'light' : 'dark'); }
  /** The GLUE folder remembers the choice too (so another browser opens with it). */
  onChange: ((theme: string, mode: Mode) => void) | null = null;

  private apply() {
    const t = themeById(this.theme), el = document.documentElement;
    loadFonts(t);
    el.dataset.theme = t.id; el.dataset.mode = this.resolved;
    setCanvasFonts(t.fonts.mono);
    // Canvases read the tokens when they draw: redraw once the new fonts are in.
    this.version++;
    void document.fonts?.ready.then(() => { this.version++; });
  }
}
export const themes = new Themes();
