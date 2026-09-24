export type PaletteName = 'spek' | 'inferno' | 'ice' | 'gray';

const PALETTES: Record<PaletteName, [number, string][]> = {
  spek: [[0, '#000000'], [0.16, '#0b0a3c'], [0.33, '#3a0f7a'], [0.5, '#9a1a6e'], [0.66, '#e0402c'], [0.82, '#fca02a'], [0.93, '#fde56b'], [1, '#fffbe6']],
  inferno: [[0, '#000004'], [0.11, '#1b0c41'], [0.22, '#4a0c6b'], [0.33, '#781c6d'], [0.44, '#a52c60'], [0.55, '#cf4446'], [0.66, '#ed6925'], [0.77, '#fb9b06'], [0.88, '#f7d13d'], [1, '#fcffa4']],
  ice: [[0, '#000000'], [0.25, '#07203d'], [0.5, '#155a9c'], [0.72, '#3fa1e0'], [0.88, '#a5dcff'], [1, '#ffffff']],
  gray: [[0, '#000000'], [1, '#ffffff']],
};

/** Colour-stop palette → 256 × RGB lookup table. */
export function buildLut(name: PaletteName): Uint8ClampedArray {
  const stops = PALETTES[name] || PALETTES.spek, lut = new Uint8ClampedArray(256 * 3);
  const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0; while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
    const [p0, c0] = stops[j], [p1, c1] = stops[j + 1], u = Math.min(1, Math.max(0, (t - p0) / (p1 - p0)));
    const a = rgb(c0), b = rgb(c1);
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = a[k] + (b[k] - a[k]) * u;
  }
  return lut;
}

/** Spectrogram (column-major dB) → offscreen canvas coloured with the LUT over [floor, 0] dB. */
export function buildSpecImage(spec: Float32Array, cols: number, rows: number, floor: number, lut: Uint8ClampedArray, into?: HTMLCanvasElement): HTMLCanvasElement {
  const span = -floor;
  const cv = into || document.createElement('canvas');
  cv.width = cols; cv.height = rows;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(cols, rows), d = img.data;
  for (let c = 0; c < cols; c++) {
    const base = c * rows;
    for (let y = 0; y < rows; y++) {
      const v = spec[base + (rows - 1 - y)];
      let t = (v - floor) / span; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const li = Math.round(t * 255) * 3, p = (y * cols + c) * 4;
      d[p] = lut[li]; d[p + 1] = lut[li + 1]; d[p + 2] = lut[li + 2]; d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
