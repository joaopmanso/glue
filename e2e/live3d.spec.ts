import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));

test('live view switches between scrolling and 3D while playing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./#/analyze');
  await page.setInputFiles('#file-input', fixture('flac-96k-24.flac'));
  await expect(page.locator('#v-pill')).not.toHaveText('', { timeout: 30_000 });
  await page.check('#live-toggle');
  await page.click('#live-3d');
  await expect(page.locator('#live-3d')).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => { const loop = () => document.querySelectorAll('audio').forEach(a => { a.loop = true; }); loop(); setInterval(loop, 200); });
  await page.click('#play-btn');
  await page.waitForTimeout(2500);
  // Something was drawn: the canvas isn't just the empty background.
  const lit = await page.locator('#live').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
    return n;
  });
  expect(lit).toBeGreaterThan(2000);
  if (process.env.SHOTS) await page.locator('#live-wrap').screenshot({ path: process.env.SHOTS + '/live3d.png' });
  await page.click('#live-scroll');
  await expect(page.locator('#live-scroll')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await page.setInputFiles('#file-input', fixture('flac-96k-24.flac'));
  await expect(page.locator('#live-scroll')).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  expect(errors).toEqual([]);
});
