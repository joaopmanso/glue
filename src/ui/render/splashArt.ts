import { buildLut } from './palettes';
import { fitCanvas, theme } from './canvas';

/** Start-page backdrop: a stylised transcode, content up to a lossy wall and nothing above. */
export function drawSplashArt(cv: HTMLCanvasElement) {
  const { ctx, w, h } = fitCanvas(cv);
  const C = theme(), lut = buildLut('spek');
  const cols = 260, rows = 130, wall = 0.72, img = ctx.createImageData(cols, rows), d = img.data;
  let seed = 7;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let c = 0; c < cols; c++) {
    const beat = Math.pow(Math.abs(Math.sin(c * 0.19)), 6), swell = 0.55 + 0.45 * Math.sin(c * 0.023 + 1);
    const hush = c > 150 && c < 168 ? 0.25 : 1;
    for (let r = 0; r < rows; r++) {
      const f = 1 - r / (rows - 1);
      let db;
      if (f < wall) db = (-30 - 58 * Math.pow(f / wall, 0.7) + 18 * beat + 8 * swell - 16 * rnd()) * (hush < 1 ? 1.25 : 1) - (hush < 1 ? 18 : 0);
      else db = -112 - 10 * rnd();
      const t = Math.max(0, Math.min(1, (db + 120) / 120)), li = Math.round(t * 255) * 3, p = (r * cols + c) * 4;
      d[p] = lut[li]; d[p + 1] = lut[li + 1]; d[p + 2] = lut[li + 2]; d[p + 3] = 255;
    }
  }
  const off = document.createElement('canvas');
  off.width = cols; off.height = rows;
  off.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, w, h);
  const y = Math.round(h * (1 - wall)) + 0.5;
  ctx.save();
  ctx.setLineDash([5, 5]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  ctx.restore();
}
