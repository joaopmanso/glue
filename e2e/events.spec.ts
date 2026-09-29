/* Events (ADR 0074): the calendar, an event with its folder in Playlists, assigned playlists and
   versions made for it, the flyer, and the "needs music" reminder. */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-events-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1600, height: 960 } });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});
const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));

test('events: a gig in the calendar, its folder, an assigned playlist and a version made for it, the flyer, the reminder (ADR 0074)', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => void d.accept(d.type() === 'prompt' ? 'Warm-up' : undefined));
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
  });
  await page.goto('./#/analyze');
  const files = ['flac-96k-24.flac', 'mp3-128k.mp3', 'aiff-44k-24.aiff'].map(n => ({ n, b: readFileSync(fixture(n)).toString('base64') }));
  await page.evaluate(async files => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    for (const f of files) { const w = await (await dir.getFileHandle(f.n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(f.b), c => c.charCodeAt(0))); await w.close(); }
  }, files);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(3, { timeout: 30_000 });
  // A playlist of two songs.
  await page.locator('.tr').nth(0).locator('.c-title').click();
  await page.locator('.tr').nth(1).locator('.c-title').click({ modifiers: ['Control'] });
  await page.locator('.tr').nth(1).locator('.c-title').click({ button: 'right' });
  await page.locator('.cmenu [data-m="add"]').hover(); await page.locator('.cmenu [data-m="new-playlist"]').click();
  await expect(page.locator('.lside .tree .name', { hasText: 'Warm-up' })).toHaveCount(1);

  // A gig three days from now.
  const d = new Date(); d.setDate(d.getDate() + 3);
  const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  await page.click('#calendar-tab');
  await expect(page.locator('#calendar')).toBeVisible();
  await page.click('#new-event');
  await page.fill('#ev-name', 'Lux');
  await page.fill('#ev-date', day);
  await page.fill('#ev-set-start', '23:30');
  await page.fill('#ev-set-end', '01:00');
  await page.fill('#ev-venue', 'Lux Frágil');
  await page.fill('#ev-city', 'Lisbon');
  await page.fill('#ev-lineup', 'DJ Test\nSomeone else');
  await page.click('#ev-save');
  await expect(page).toHaveURL(/#\/events\/[\w-]+$/);
  await expect(page.locator('#event-name')).toHaveText('Lux');
  await expect(page.locator('.when')).toHaveText('In 3 days');
  await expect(page.locator('.lineup .me')).toHaveText('DJ Test');
  // No music yet: said on its page, on the Calendar tab, and above the library.
  await expect(page.locator('#event-needs')).toBeVisible();
  await expect(page.locator('#calendar-tab .badge')).toHaveText('1');
  await page.locator('.tabs a[href="#/"]').click();
  await expect(page.locator('.remind')).toContainText('Lux');
  // Its folder, in Playlists › Events.
  await expect(page.locator('.lside .tree .name', { hasText: 'Events' })).toHaveCount(1);
  await page.locator('.lside .tree .name', { hasText: 'Events' }).click();
  await expect(page.locator('.lside .tree .name', { hasText: day + ' · Lux' })).toHaveCount(1);
  await page.locator('.remind .go').click();

  // Assign a playlist: the reminder goes.
  await page.click('#event-assign');
  await page.locator('.cmenu .citem', { hasText: 'Warm-up' }).click();
  await expect(page.locator('#event-assigned .pl')).toHaveCount(1);
  await expect(page.locator('#event-assigned .n')).toContainText('2 songs');
  await expect(page.locator('#event-assigned .n')).toContainText('of 1:30:00');
  await expect(page.locator('#event-needs')).toHaveCount(0);
  await expect(page.locator('#calendar-tab .badge')).toHaveCount(0);

  // A version made for it, trimmed in the library.
  await page.click('#event-version');
  await page.locator('.cmenu .citem', { hasText: 'Warm-up' }).click();
  await expect(page.locator('#event-versions .pl')).toHaveCount(1);
  await page.locator('#event-versions .name').click();
  await expect(page.locator('.tr')).toHaveCount(2);
  await page.locator('.tr').first().locator('.c-title').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.tr')).toHaveCount(1);
  await page.locator('.lside .tree .name', { hasText: day + ' · Lux' }).click({ button: 'right' });
  await page.locator('.cmenu [data-m="open-event"]').click();
  await expect(page.locator('#event-versions .n')).toContainText('1 song');
  await expect(page.locator('#event-assigned .n')).toContainText('2 songs');   // the original stays

  // A flyer.
  await page.locator('#event-flyer-file').evaluate(async (input: HTMLInputElement) => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 2800;
    const g = c.getContext('2d')!; g.fillStyle = '#e0306a'; g.fillRect(0, 0, 2000, 2800); g.fillStyle = '#fff'; g.fillRect(200, 200, 1600, 400);
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'flyer.png', { type: 'image/png' }));
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#event-flyer')).toBeVisible({ timeout: 10_000 });
  expect(await page.locator('#event-flyer').evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])).toEqual([1000, 1400]);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/event.png' });

  // The calendar: on its day, and coming up; kept over a reload.
  await page.click('#calendar-tab');
  await expect(page.locator(`.day[data-day="${day}"] .echip`)).toHaveText(/Lux/);
  await expect(page.locator('#calendar .evc', { hasText: 'Lux' })).toContainText('in 3 days');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/calendar.png' });
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('#calendar .evc', { hasText: 'Lux' })).toBeVisible({ timeout: 20_000 });
  await page.locator('#calendar .evc', { hasText: 'Lux' }).click();
  await expect(page.locator('#event-flyer')).toBeVisible();

  // Deleted, with its folder (the assigned playlist stays).
  await page.click('#event-delete');
  await expect(page).toHaveURL(/#\/events$/);
  await expect(page.locator('#calendar .evc')).toHaveCount(0);
  await page.locator('.tabs a[href="#/"]').click();
  await expect(page.locator('.lside .tree .name', { hasText: 'Lux' })).toHaveCount(0);
  await expect(page.locator('.lside .tree .name', { hasText: 'Warm-up' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('events: the reminder hides until tomorrow', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
  });
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#calendar-tab');
  await page.click('#new-event');   // today
  await page.fill('#ev-name', 'Tonight');
  await page.click('#ev-save');
  await page.click('#calendar-tab');
  await expect(page.locator('.remind')).toContainText('Tonight');
  await page.locator('.remind .x').click();
  await expect(page.locator('.remind')).toHaveCount(0);
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('#calendar')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.remind')).toHaveCount(0);
  await expect(page.locator('#calendar-tab .badge')).toHaveText('1');   // still counted
});
