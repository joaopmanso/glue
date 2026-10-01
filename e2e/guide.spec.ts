/* Gluey (ADR 0126): the first tour on a person's first login, once; again from "Who's using GLUE?" and from his
   button; someone who used GLUE before him gets an offer instead. */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-e2e-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1600, height: 900 } }, true);
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});
const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async o =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
  });
});
test.afterEach(() => expect(errors).toEqual([]));

/** The GLUE folder's index (mco.json) as it is on "disk". */
const index = (page: Page) => page.evaluate(async () => {
  try {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('MCO');
  const f = await (await d.getFileHandle('mco.json')).getFile();
  return JSON.parse(await f.text()) as { guide?: { seen?: string[] } };
  } catch { return {} as { guide?: { seen?: string[] } }; }   // being replaced (a save) this instant
});

test('Gluey’s first tour: on the first login, once; again from “Who’s using GLUE?” and his button; an offer for people from before him', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('./#/analyze');
  const mp3 = readFileSync(fixture('mp3-128k.mp3')).toString('base64');
  await page.evaluate(async b => {
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    const w = await (await d.getFileHandle('one.mp3', { create: true })).createWritable(); await w.write(Uint8Array.from(atob(b), c => c.charCodeAt(0))); await w.close();
  }, mp3);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.tr')).toHaveCount(1, { timeout: 30_000 });

  // The first login: Gluey starts by himself, and each stop lights up its part of GLUE.
  const bubble = page.locator('#gluey-bubble');
  await expect(bubble).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#gluey-title')).toHaveText('Hi, I’m Gluey!');
  const targets: string[] = [];
  for (let i = 0; i < 12 && await bubble.isVisible(); i++) {
    const t = await bubble.getAttribute('data-target');
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tour-${i}.png` });
    if (t) { targets.push(t); await expect(page.locator(`[data-guide="${t}"]`).first()).toBeVisible(); }
    await page.click('#gluey-next');
    await page.waitForTimeout(250);
  }
  await expect(bubble).toHaveCount(0);
  expect(targets).toEqual(['library-views', 'add-music', 'analysis', 'track-tabs', 'playlists', 'devices', 'help']);
  // Kept in the GLUE folder (every browser using it), and not shown again.
  await expect.poll(async () => (await index(page)).guide?.seen ?? [], { timeout: 10_000 }).toContain('welcome');
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(bubble).toHaveCount(0);

  // Again, from his button…
  await page.click('#gluey-btn');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/panel.png` });
  await page.locator('#gluey-panel [data-tour="welcome"]').click();
  await expect(bubble).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bubble).toHaveCount(0);
  // …and from “Who’s using GLUE?”.
  await page.locator('.top .who').click();
  await page.click('#tour-again');
  await expect(bubble).toBeVisible({ timeout: 15_000 });
  await page.click('#gluey-skip');
  await expect(bubble).toHaveCount(0);

  // Someone who used GLUE before Gluey (a collection from before 2026-10-01, nothing seen): an offer, not a tour.
  await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('MCO');
    const put = async (d: FileSystemDirectoryHandle, name: string, f: (j: Record<string, unknown>) => void) => { const h = await d.getFileHandle(name); const j = JSON.parse(await (await h.getFile()).text()); f(j); const w = await h.createWritable(); await w.write(JSON.stringify(j)); await w.close(); };
    await put(root, 'mco.json', j => { delete j.guide; });
    const profiles = await root.getDirectoryHandle('profiles');
    for await (const [, p] of (profiles as unknown as { entries(): AsyncIterable<[string, FileSystemDirectoryHandle]> }).entries()) {
      const cols = await p.getDirectoryHandle('collections').catch(() => null);
      if (!cols) continue;
      for await (const [, c] of (cols as unknown as { entries(): AsyncIterable<[string, FileSystemDirectoryHandle]> }).entries()) await put(c, 'collection.json', j => { j.createdAt = '2026-09-01T00:00:00.000Z'; });
    }
    localStorage.removeItem('mco.guide');
  });
  await page.reload();
  await expect(page.locator('#gluey-offer')).toBeVisible({ timeout: 20_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offer.png` });
  await expect(bubble).toHaveCount(0);
  await page.click('#gluey-offer-no');
  await expect(page.locator('#gluey-offer')).toHaveCount(0);
  await expect.poll(async () => (await index(page)).guide?.seen ?? [], { timeout: 10_000 }).toContain('welcome');
});

test('on a phone, Gluey’s first tour is the phone’s (ADR 0126)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/analyze');
  const mp3 = readFileSync(fixture('mp3-128k.mp3')).toString('base64');
  await page.evaluate(async b => {
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    const w = await (await d.getFileHandle('one.mp3', { create: true })).createWritable(); await w.write(Uint8Array.from(atob(b), c => c.charCodeAt(0))); await w.close();
  }, mp3);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  const bubble = page.locator('#gluey-bubble');
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  const targets: string[] = [];
  for (let i = 0; i < 6 && await bubble.isVisible(); i++) {
    const t = await bubble.getAttribute('data-target');
    if (t) { targets.push(t); await expect(page.locator(`[data-guide="${t}"]`).first()).toBeVisible(); }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/phone-${i}.png` });
    await page.click('#gluey-next');
    await page.waitForTimeout(250);
  }
  expect(targets).toEqual(['phone-library', 'phone-tabs', 'help']);
});

test('seen on another device: a new browser signed in to the account doesn’t show the first tour (ADR 0126)', async ({ page }) => {
  test.setTimeout(120_000);
  const patched: unknown[] = [];
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null, tier: 'free', createdAt: Date.now(), guide: { seen: ['welcome'], tips: [] } };
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
    const req = r.request(), p = new URL(req.url()).pathname;
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/health') return json({ ok: true });
    if (p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'b2' });
    if (p === '/v1/me') return json({ user, thisDevice: 'b2', devices: [], sessions: [] });
    if (p === '/v1/me/guide') { patched.push(JSON.parse(req.postData() ?? '{}')); return json({ guide: user.guide }); }
    if (p === '/v1/profiles') return json({ profiles: [], gone: [], seeded: false });
    if (p === '/v1/shared') return json({ collections: [], gone: [] });
    return json({ error: 'not found' }, 404);
  });
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, () => {});
  await page.goto('./#/analyze');
  await page.evaluate(() => { localStorage.setItem('mco.cloud.refresh', 'r'); localStorage.setItem('mco.cloud.device', 'b2'); localStorage.setItem('mco.onboard', 'local'); });
  const mp3 = readFileSync(fixture('mp3-128k.mp3')).toString('base64');
  await page.evaluate(async b => {
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    const w = await (await d.getFileHandle('one.mp3', { create: true })).createWritable(); await w.write(Uint8Array.from(atob(b), c => c.charCodeAt(0))); await w.close();
  }, mp3);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.tr')).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(3000);
  await expect(page.locator('#gluey-bubble')).toHaveCount(0);
  await expect(page.locator('#gluey-offer')).toHaveCount(0);
  // What the account knows is kept in this GLUE folder too (every browser on this computer).
  await expect.poll(async () => (await index(page)).guide?.seen ?? [], { timeout: 10_000 }).toContain('welcome');
});
