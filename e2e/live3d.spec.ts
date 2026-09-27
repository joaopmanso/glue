import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));

test('live view: scrolling, and a 3D view that turns, zooms and resets (ADR 0073)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./#/analyze');
  await page.setInputFiles('#file-input', fixture('flac-96k-24.flac'));
  await expect(page.locator('#v-pill')).not.toHaveText('', { timeout: 30_000 });
  await page.check('#live-toggle');
  await page.click('#live-3d');
  await expect(page.locator('#live-3d')).toHaveAttribute('aria-checked', 'true');
  const box = page.locator('#live3d');
  await expect(box).toBeVisible();
  await page.evaluate(() => { const loop = () => document.querySelectorAll('audio').forEach(a => { a.loop = true; }); loop(); setInterval(loop, 200); });
  await page.click('#play-btn');
  await page.waitForTimeout(2500);
  // Something was drawn: the canvas isn't just the empty background.
  const lit = await box.locator('canvas').evaluate((c: HTMLCanvasElement) => {
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const x = t.getContext('2d')!; x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, t.width, t.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
    return n;
  });
  expect(lit).toBeGreaterThan(2000);
  if (process.env.SHOTS) await page.locator('#live-wrap').screenshot({ path: process.env.SHOTS + '/live3d.png' });

  // On the GPU (this browser has WebGL): a drag turns it, the wheel zooms, Reset puts it back.
  expect(await box.getAttribute('data-flat')).toBeNull();
  await expect(box).toHaveAttribute('data-view', /\d/);
  const start = await box.getAttribute('data-view');
  expect(await box.locator('.tick').count()).toBeGreaterThan(3);
  const b = (await box.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 180, b.y + b.height / 2 + 40, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => box.getAttribute('data-view')).not.toBe(start);
  const [az0, , d0] = start!.split(',').map(Number), [az1] = (await box.getAttribute('data-view'))!.split(',').map(Number);
  expect(Math.abs(az1 - az0)).toBeGreaterThan(0.2);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => Number((await box.getAttribute('data-view'))!.split(',')[2])).toBeLessThan(d0);
  if (process.env.SHOTS) await page.locator('#live-wrap').screenshot({ path: process.env.SHOTS + '/live3d-turned.png' });
  await page.waitForTimeout(800);   // the turn has settled
  await page.click('#reset-3d');
  await expect.poll(() => box.getAttribute('data-view')).toBe(start);

  await page.click('#live-scroll');
  await expect(page.locator('#live-scroll')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#live')).toBeVisible();
  await page.reload();
  await page.setInputFiles('#file-input', fixture('flac-96k-24.flac'));
  await expect(page.locator('#live-scroll')).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  expect(errors).toEqual([]);
});
