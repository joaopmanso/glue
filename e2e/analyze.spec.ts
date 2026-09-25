import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
});
test.afterEach(() => expect(errors).toEqual([]));

test('start page shows the drop zone and example button', async ({ page }) => {
  await page.goto('./#/analyze');
  await expect(page.locator('#dropzone')).toBeVisible();
  await expect(page.locator('#try-example')).toBeVisible();
  await expect(page).toHaveTitle(/GLUE/);
});

test('the example track is judged a transcode with padded bits', async ({ page }) => {
  await page.goto('./#/analyze');
  await page.click('#try-example');
  await expect(page.locator('#v-pill')).toHaveText('Transcoded', { timeout: 30_000 });
  await expect(page.locator('#example-note')).toBeVisible();
  await expect(page.locator('#evidence')).toContainText('Only 16 of 24 bits used');
  await expect(page.locator('#m-bpm')).toContainText('BPM');
});

test('an AIFF analyses, plays and pauses with real clicks', async ({ page }) => {
  await page.goto('./#/analyze');
  await page.setInputFiles('#file-input', fixture('aiff-44k-24.aiff'));
  await expect(page.locator('#v-head')).not.toHaveText('', { timeout: 30_000 });
  await expect(page.locator('#readouts')).toContainText('AIFF');
  const play = page.locator('#play-btn');
  await expect(play).toBeEnabled();
  await play.click();
  await expect(play).toHaveAttribute('aria-label', 'Pause');
  await page.waitForTimeout(700);
  await play.click();
  await expect(play).toHaveAttribute('aria-label', 'Play');
  const t1 = await page.locator('#p-time').textContent();
  await page.waitForTimeout(600);
  expect(await page.locator('#p-time').textContent()).toBe(t1);   // really paused
});

test('a second file dropped mid-analysis wins (no result swap)', async ({ page }) => {
  await page.goto('./#/analyze');
  await page.click('#try-example');                                // slow job first
  await page.setInputFiles('#file-input', fixture('wav-44k-24.wav'));   // then a real file
  await expect(page.locator('#readouts')).toContainText('WAV', { timeout: 30_000 });
  await page.waitForTimeout(3000);                                  // let the example finish too
  await expect(page.locator('#readouts')).toContainText('WAV');
  await expect(page.locator('#example-note')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveCount(0);            // busy bar not stuck
});

test('MP3 and M4A decode through the browser', async ({ page }) => {
  await page.goto('./#/analyze');
  await page.setInputFiles('#file-input', fixture('mp3-128k.mp3'));
  await expect(page.locator('#v-pill')).toHaveText(/Lossy|Caution|Suspect/, { timeout: 30_000 });
  await expect(page.locator('#readouts')).toContainText('MP3');
  await page.setInputFiles('#file-input', fixture('aac-128k.m4a'));
  await expect(page.locator('#readouts')).toContainText('AAC', { timeout: 30_000 });
});

test('live view and key notation toggles', async ({ page }) => {
  await page.goto('./#/analyze');
  await page.click('#try-example');
  await expect(page.locator('#v-pill')).toHaveText('Transcoded', { timeout: 30_000 });
  await page.check('#live-toggle');
  await expect(page.locator('#live-wrap')).toBeVisible();
  await page.click('#kn-open');
  await expect(page.locator('#kn-open')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#m-key')).toHaveText(/\d+[dm]/);
});
