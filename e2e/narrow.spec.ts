/* A narrow window (the user's report, 2026-09-27): narrowing the window below ~850 px froze the page,
   because the table lost its height and drew every row. It must keep drawing only what's on screen; so
   must the phone layout that takes over below 760 px (ADR 0078). */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synthetic } from '../tests/synthetic';
import { seedFolder } from './seed';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-narrow-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1920, height: 960 } });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});

test('a narrow window keeps the table drawing only the rows on screen, and the page answers', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
    };
  });
  await seedFolder(page, JSON.stringify([...synthetic(3000, 1).files]));
  await page.goto('./#/');
  await page.click('#choose-home');
  await expect(page.locator('.tr').first()).toBeVisible({ timeout: 60_000 });
  const drawn = () => page.locator('.tr').count();
  expect(await drawn()).toBeLessThan(150);

  // 780 px: still the desktop layout, the sidebar on top.
  await page.setViewportSize({ width: 780, height: 900 });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));   // after the re-render
  // Still only what fits (plus a little overscan), and the page answers a click at once.
  await expect.poll(drawn).toBeGreaterThan(0);
  expect(await drawn(), '780 px wide').toBeLessThan(150);
  const row = page.locator('.tr').nth(2), t0 = Date.now();
  await row.locator('.c-title').click({ timeout: 5_000 });
  await expect(row).toHaveClass(/sel/, { timeout: 1_000 });
  expect(Date.now() - t0, 'a click answered at 780 px').toBeLessThan(1_500);
  // The sidebar is on top, and still reachable.
  await expect(page.locator('.lside .name', { hasText: 'All tracks' })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/narrow-780.png' });
  // The rows scroll.
  await page.locator('.table .body').evaluate(el => { el.scrollTop = 30 * 1500; el.dispatchEvent(new Event('scroll')); });
  await expect.poll(async () => Number(await page.locator('.tr').first().getAttribute('data-index'))).toBeGreaterThan(1000);

  // Narrower: the phone layout (ADR 0078). It too draws only the songs on screen, and answers at once.
  const songs = page.locator('#phone-songs .row');
  for (const width of [600, 420]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('#phone')).toBeVisible();
    if (!await page.locator('#phone-songs').count()) await page.locator('#phone-library [data-view="all"]').click();
    await expect(songs.first()).toBeVisible();
    expect(await songs.count(), width + ' px wide').toBeLessThan(60);
    const t1 = Date.now();
    await songs.nth(2).locator('.dots').click({ timeout: 5_000 });
    await expect(page.locator('#phone-sheet')).toBeVisible({ timeout: 1_000 });
    expect(Date.now() - t1, 'a tap answered at ' + width + ' px').toBeLessThan(1_500);
    await page.locator('#phone-sheet .x').click();
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/narrow-' + width + '.png' });
  }
  // Its list scrolls, still drawing only what's on screen.
  const firstY = () => songs.first().evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42);
  await page.locator('#phone-songs .list').evaluate(el => { el.scrollTop = 62 * 1500; el.dispatchEvent(new Event('scroll')); });
  await expect.poll(firstY).toBeGreaterThan(62 * 1000);
  expect(await songs.count()).toBeLessThan(60);
  expect(errors).toEqual([]);
});
