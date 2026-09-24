export const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';

export interface Theme { ink: string; ink2: string; muted: string; line: string; line2: string; accent: string; accentInk: string; surface: string; raised: string }

/** Theme colours from the CSS tokens, so canvases follow app.css. */
export function theme(): Theme {
  const cs = getComputedStyle(document.documentElement), g = (n: string) => cs.getPropertyValue(n).trim();
  return { ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'), line: g('--line'), line2: g('--line-2'), accent: g('--accent'), accentInk: g('--accent-ink'), surface: g('--surface'), raised: g('--raised') };
}

/** Size a canvas to its CSS box at device pixel ratio (capped at 2) and return a CSS-pixel context. */
export function fitCanvas(cv: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const rect = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(rect.width * dpr)), H = Math.max(1, Math.round(rect.height * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

/** '#7cc7ff' + alpha → 'rgba(124,199,255,a)' (canvas gradients don't reliably take color-mix()). */
export function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export interface PlotRect { l: number; r: number; t: number; b: number; pw: number; ph: number }
