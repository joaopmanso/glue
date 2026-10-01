/* The library mustn't move by itself (the user, 2026-10-01, ADR 0139): scrolling into a part not loaded yet, the songs
   on screen changed 5, 6, 7 times as covers, Overviews and results came in and songs above left the list. The song
   at the top stays put whatever changes around it; only the user moves the list. */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synthetic } from '../tests/synthetic';
import { seedFolder } from './seed';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-scroll-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1600, height: 900 } });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});

test('the songs on screen stay put while songs above them leave the list', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message, (e.stack ?? '').slice(0, 300)); });
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
    };
  });
  await seedFolder(page, JSON.stringify([...synthetic(3000, 1).files]));
  await page.goto('./?perf#/');
  await page.click('#choose-home');
  await expect(page.locator('.tr').first()).toBeVisible({ timeout: 60_000 });
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  // The scroll bar clicked 40 % down.
  await page.locator('.body[role="rowgroup"]').evaluate(b => { b.scrollTop = b.scrollHeight * 0.4; });
  await frames();
  /** The titles of the rows at the top of the table's window, in order. */
  const top = () => page.locator('.body[role="rowgroup"]').evaluate(b => {
    const r = b.getBoundingClientRect();
    return [...b.querySelectorAll<HTMLElement>('.tr')].filter(x => { const y = x.getBoundingClientRect().top; return y >= r.top - 1 && y < r.top + 120; })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(x => x.querySelector('.cell[data-c="title"]')?.textContent?.trim() ?? '');
  });
  const before = await top();
  expect(before.length).toBeGreaterThan(2);
  // Songs just above leave the list, three times, as loading did.
  for (let i = 0; i < 3; i++) {
    const n = await page.evaluate(t => (window as unknown as { __gluePerf: { dropBefore(t: string, k: number): Promise<number> } }).__gluePerf.dropBefore(t, 5), before[0]);
    expect(n).toBe(5);
    await frames();
    expect(await top()).toEqual(before);
  }
  expect(errors).toEqual([]);
});
