/* The library on a phone or a tablet (the user's lists, 2026-09-28; ADR 0078, 0079): tabs at the bottom,
   two-line rows, a tap plays, menus and questions as sheets, the mini and full player, browsing, search,
   playlists made and edited by touch, and a song's page inside the same frame. Nothing may be wider than
   the screen. */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Device = { width: number; height: number; isMobile?: boolean };
const test = base.extend<{ page: Page; device: Device }>({
  device: [{ width: 390, height: 844 }, { option: true }],
  page: async ({ baseURL, device }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-phoneui-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: device.width, height: device.height }, isMobile: device.isMobile, hasTouch: true });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});
const fixture = (n: string) => fileURLToPath(new URL('../tests/fixtures/' + n, import.meta.url));
const shots = process.env.SHOTS;

/** A new profile whose music folder has the four fixtures, open in the touch layout. */
async function start(page: Page, errors: string[]) {
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
  await expect(page.locator('#phone-library [data-view="all"]')).toContainText('4', { timeout: 30_000 });
}

test('the library on a phone: tabs, songs, the player, sheets, playlists, browsing, search, a song’s page', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await start(page, errors);
  const all = page.locator('#phone-library [data-view="all"]');

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

  // A new playlist (named in a sheet, not the browser's prompt), a song added to it from the sheet's
  // submenu, and the playlist opened.
  await page.locator('.tabs [data-tab="playlists"]').click();
  await page.click('#phone-new-playlist');
  await page.fill('#phone-ask-input', 'Friday');
  await page.click('#phone-ask-ok');
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

test('playlists by touch: folders, several songs added at once, reordered by dragging, removed with Undo, renamed and deleted', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await start(page, errors);
  const sheet = page.locator('#phone-sheet'), rows = page.locator('#phone-songs .row');
  const titles = () => rows.evaluateAll(els => els.sort((a, b) => new DOMMatrix(getComputedStyle(a).transform).m42 - new DOMMatrix(getComputedStyle(b).transform).m42).map(e => e.querySelector('b')!.textContent));
  const name = async (n: string) => { await page.fill('#phone-ask-input', n); await page.click('#phone-ask-ok'); await expect(page.locator('#phone-ask')).toHaveCount(0); };

  // A folder and a playlist, each named in a sheet; the playlist moved into the folder.
  await page.locator('.tabs [data-tab="playlists"]').click();
  await page.click('#phone-new-folder'); await name('Gigs');
  await page.click('#phone-new-playlist'); await name('Warmup');
  const warmup = page.locator('#phone-playlists .lrow', { hasText: 'Warmup' });
  await warmup.locator('.dots').click();
  await sheet.locator('[data-m="move-to"]').click();
  await sheet.locator('.item', { hasText: 'Gigs' }).click();
  await expect(warmup).toHaveCount(0);
  await page.locator('#phone-playlists [data-list]', { hasText: 'Gigs' }).click();
  await expect(page.locator('#phone-title')).toHaveText('Gigs');
  await expect(page.locator('.menu [data-list]', { hasText: 'Warmup' })).toBeVisible();

  // Three songs picked in All tracks and added in one go.
  await page.locator('.tabs [data-tab="library"]').click();
  await page.locator('#phone-library [data-view="all"]').click();
  await page.click('#phone-select');
  await expect(page.locator('#phone-mini')).toHaveCount(0);   // the selection bar takes its place
  for (const t of ['Fixture FLAC', 'Fixture MP3', 'Covered']) await rows.filter({ hasText: t }).click();
  await expect(page.locator('#phone-picked')).toHaveText('3 selected');
  if (shots) await page.screenshot({ path: shots + '/phone-select.png' });
  await page.click('#phone-sel-add');
  await sheet.locator('.item', { hasText: 'Warmup' }).click();
  await expect(page.locator('#phone-selbar')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Added 3 songs to Warmup');

  // In the playlist: Edit, drag the first song to the end, remove one (and undo it), then done.
  await page.locator('.tabs [data-tab="playlists"]').click();
  await page.locator('.tabs [data-tab="playlists"]').click();
  await page.locator('#phone-playlists [data-list]', { hasText: 'Gigs' }).click();
  await page.locator('.menu [data-list]', { hasText: 'Warmup' }).click();
  await expect(rows).toHaveCount(3);
  const before = await titles();
  await page.click('#phone-edit');
  await expect(page.locator('#phone-songs .grip')).toHaveCount(3);
  if (shots) await page.screenshot({ path: shots + '/phone-edit.png' });
  const grip = (await rows.filter({ hasText: before[0]! }).locator('.grip').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + i * 13);
  await page.mouse.up();
  await expect.poll(titles).toEqual([before[1], before[2], before[0]]);
  await rows.filter({ hasText: before[1]! }).locator('.minus').click();
  await expect(rows).toHaveCount(2);
  await page.click('#phone-undo');
  await expect.poll(titles).toEqual([before[1], before[2], before[0]]);
  await page.click('#phone-edit');   // Done
  await expect(page.locator('#phone-songs .grip')).toHaveCount(0);

  // Renamed and deleted from its ⋯, with the questions in sheets; deleting goes back to the folder.
  await page.click('#phone-list-more');
  await sheet.locator('[data-m="rename"]').click();
  await expect(page.locator('#phone-ask-input')).toHaveValue('Warmup');
  if (shots) await page.screenshot({ path: shots + '/phone-ask.png' });
  await name('Opening set');
  await expect(page.locator('#phone-title')).toHaveText('Opening set');
  await page.click('#phone-list-more');
  await sheet.locator('[data-m="delete"]').click();
  await expect(page.locator('#phone-ask')).toContainText('The songs stay in your collection');
  await page.click('#phone-ask-ok');
  await expect(page.locator('#phone-title')).toHaveText('Gigs');
  await expect(page.locator('.menu [data-list]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe('on a tablet', () => {
  test.use({ device: { width: 1024, height: 768, isMobile: true } });
  test('a touch tablet gets the touch layout at any width, its sheets not stretched across the screen', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    await start(page, errors);
    await expect(page.locator('.tabs [data-tab="playlists"]')).toBeVisible();
    await page.locator('#phone-library [data-view="all"]').click();
    await page.locator('#phone-songs .row').first().locator('.dots').click();
    const box = (await page.locator('#phone-sheet').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(640);
    expect(Math.abs(box.x + box.width / 2 - 512)).toBeLessThan(2);   // centred
    if (shots) await page.screenshot({ path: shots + '/tablet-sheet.png' });
    expect(errors).toEqual([]);
  });
});

test('on a phone the account menu opens inside the screen (the button is on the left)', async ({ page }) => {
  const errors: string[] = [];
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null };
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
      renderButton(el) { const b = document.createElement('button'); b.id = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    const p = new URL(r.request().url()).pathname, json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/auth/google' || p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'b1', user });
    if (p === '/v1/me') return json({ user, thisDevice: 'b1', devices: [{ id: 'b1', kind: 'browser', name: 'Phone', platform: '', createdAt: 1, lastSeen: 1, role: 'browse' }], sessions: [] });
    if (p === '/v1/shared') return json({ collections: [] });
    if (p === '/v1/sync') return json({ thisDevice: 'b1', profiles: [] });
    if (p === '/v1/sync/links') return json({ groups: [] });
    if (p === '/v1/sync/manifest') return json({ need: [] });
    if (p === '/v1/turn') return json({ iceServers: [], ttl: 0 });
    return json({ ok: true });
  });
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, () => {});
  await start(page, errors);
  await page.locator('.tabs [data-tab="more"]').click();
  await page.click('#account-btn');
  await page.click('#fake-google');
  await expect(page.locator('#account-btn img, #account-btn.avatar')).toHaveCount(1, { timeout: 20_000 });
  if (!await page.locator('#account-pop').isVisible()) await page.click('#account-btn');
  const box = (await page.locator('#account-pop').boundingBox())!, vw = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(vw - 16 + 0.5);
  await expect(page.locator('#sign-out')).toBeInViewport();
  expect(errors).toEqual([]);
});
