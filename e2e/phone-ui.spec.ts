/* The library on a phone (the user's list, 2026-09-28; ADR 0078): tabs at the bottom, two-line rows, a tap
   plays, menus as sheets, the mini and full player, browsing, search, playlists, and a song's page inside
   the same frame. Nothing may be wider than the screen. */
import { test as base, expect, chromium, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-phoneui-'));
    const ctx = await chromium.launchPersistentContext(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});
const fixture = (n: string) => fileURLToPath(new URL('../tests/fixtures/' + n, import.meta.url));
const shots = process.env.SHOTS;

test('the library on a phone: tabs, songs, the player, sheets, playlists, browsing, search, a song’s page', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
  });
  await page.goto('./#/analyze');
  const files = ['flac-96k-24.flac', 'mp3-128k.mp3', 'mp3-cover.mp3', 'aiff-44k-24.aiff'].map(n => ({ n, b: readFileSync(fixture(n)).toString('base64') }));
  await page.evaluate(async files => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    for (const f of files) { const w = await (await dir.getFileHandle(f.n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(f.b), c => c.charCodeAt(0))); await w.close(); }
  }, files);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');

  // The phone layout, even before there's music: the Library tab offers to add some.
  await expect(page.locator('#phone')).toBeVisible();
  await expect(page.locator('.top')).toHaveCount(0);   // no desktop header
  await page.click('#phone-add-folder');
  const all = page.locator('#phone-library [data-view="all"]');
  await expect(all).toContainText('4', { timeout: 30_000 });

  // All tracks: two-line rows; a tap plays, and the mini player shows it.
  await all.click();
  await expect(page.locator('#phone-title')).toHaveText('All tracks');
  const rows = page.locator('#phone-songs .row');
  await expect(rows).toHaveCount(4);
  await rows.filter({ hasText: 'Fixture FLAC' }).click();
  await expect(page.locator('#phone-now')).toHaveText('Fixture FLAC', { timeout: 20_000 });
  await expect(page.locator('#phone-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });
  await page.click('#phone-play');
  await expect(page.locator('#phone-play')).toHaveAttribute('aria-label', 'Play');

  // The full player: the song, its controls, what comes next; it closes again.
  await page.click('#phone-mini');
  await expect(page.locator('#phone-player')).toBeVisible();
  await expect(page.locator('#phone-player .who')).toContainText('Fixture FLAC');
  await expect(page.locator('#phone-queue')).toContainText('Next from All tracks');
  if (shots) await page.screenshot({ path: shots + '/phone-player.png' });
  await page.getByRole('button', { name: 'Close the player' }).click();
  await expect(page.locator('#phone-player')).toHaveCount(0);

  // A song's ⋯: its menu as a sheet (no repeated title, no keyboard shortcuts); a rating from there.
  const mp3 = rows.filter({ hasText: 'Fixture MP3' });
  await mp3.locator('.dots').click();
  const sheet = page.locator('#phone-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('header b')).toHaveText('Fixture MP3');
  await expect(sheet.locator('.head')).toHaveCount(0);
  await expect(sheet.locator('.hint', { hasText: 'Space' })).toHaveCount(0);
  if (shots) await page.screenshot({ path: shots + '/phone-sheet.png' });
  await sheet.getByRole('button', { name: 'Rate 4' }).click({ position: { x: 20, y: 13 } });
  await expect(sheet).toHaveCount(0);

  // A new playlist, a song added to it from the sheet's submenu, and the playlist opened.
  page.once('dialog', d => void d.accept('Friday'));
  await page.locator('.tabs [data-tab="playlists"]').click();
  await page.click('#phone-new-playlist');
  const friday = page.locator('#phone-playlists [data-list]', { hasText: 'Friday' });
  await expect(friday).toBeVisible();
  await page.locator('.tabs [data-tab="library"]').click();
  await expect(page.locator('#phone-title')).toHaveText('All tracks');   // the tab kept its place
  await mp3.locator('.dots').click();
  await sheet.locator('[data-m="add"]').click();
  await sheet.locator('.item', { hasText: 'Friday' }).click();
  await expect(sheet).toHaveCount(0);
  await page.locator('.tabs [data-tab="playlists"]').click();
  await friday.click();
  await expect(page.locator('#phone-title')).toHaveText('Friday');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Fixture MP3');
  // The rating given above shows as 4 in the song's page (inside the phone frame, with a way back).
  await rows.first().locator('.dots').click();
  await sheet.locator('.item', { hasText: 'Open details' }).click();
  await expect(page.locator('#phone')).toHaveAttribute('data-page', 'track');
  await expect(page.locator('#phone-title')).toHaveText('Song');
  await expect(page.locator('.th .rate')).toContainText('4 / 5');
  await expect(page.locator('#phone-mini')).toBeVisible();   // the player stays
  const wide = () => page.evaluate(() => { const s = document.querySelector('#phone .screen')!; return { page: document.documentElement.scrollWidth - innerWidth, screen: s.scrollWidth - s.clientWidth }; });
  expect(await wide()).toEqual({ page: 0, screen: 0 });
  await page.click('#tab-prepare');
  await expect(page.locator('.prep')).toBeVisible({ timeout: 20_000 });
  expect(await wide()).toEqual({ page: 0, screen: 0 });
  if (shots) await page.screenshot({ path: shots + '/phone-prepare.png' });
  await page.click('#phone-back');
  await expect(page.locator('#phone-title')).toHaveText('Friday');

  // Browse: Artists, then one artist's songs.
  await page.locator('.tabs [data-tab="browse"]').click();
  await page.locator('#phone-browse [data-browse="artist"]').click();
  await expect(page.locator('#phone-title')).toHaveText('Artists');
  await page.locator('#browse .it', { hasText: 'GLUE Tests' }).click();
  await expect(page.locator('#phone-title')).toHaveText('GLUE Tests');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Covered');
  await page.click('#phone-back');
  await expect(page.locator('#phone-title')).toHaveText('Artists');

  // Search.
  await page.locator('.tabs [data-tab="search"]').click();
  await page.fill('#phone-search', 'fixture');
  await expect(rows).toHaveCount(2);

  // A tag, from the sheet: the tag picker opens as a sheet too; a tap outside closes it.
  await rows.first().locator('.dots').click();
  await sheet.locator('.item', { hasText: 'Tags' }).click();
  const tagger = page.locator('#tag-editor');
  await expect(tagger).toHaveClass(/sheet/);
  await tagger.locator('#tag-input').fill('warmup');
  await tagger.locator('#tag-input').press('Enter');
  await expect(tagger.locator('.tag', { hasText: 'warmup' })).toBeVisible();
  await page.mouse.click(200, 120);
  await expect(tagger).toHaveCount(0);
  await page.locator('.tabs [data-tab="library"]').click();
  await page.locator('.tabs [data-tab="library"]').click();   // a second tap: back to the tab's first screen
  await expect(page.locator('#phone-library')).toContainText('warmup');

  // More: the calendar opens inside the frame; a tab brings the library back.
  await page.locator('.tabs [data-tab="more"]').click();
  await page.locator('#phone-more .ent', { hasText: 'Calendar' }).click();
  await expect(page.locator('#phone')).toHaveAttribute('data-page', 'events');
  await expect(page.locator('#calendar')).toBeVisible();
  await page.locator('.tabs [data-tab="library"]').click();
  await expect(page.locator('#phone-library')).toBeVisible();
  expect(errors).toEqual([]);
});
