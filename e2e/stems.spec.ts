import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Slow (model download + minutes of GPU work): run with STEMS=1 npx playwright test e2e/stems.spec.ts
test.skip(!process.env.STEMS, 'set STEMS=1 to run the stem separation test');
test.setTimeout(900_000);

test('separates a short clip into four stems and cancel works', async ({ page }) => {
  await page.goto('./#/analyze');
  await page.setInputFiles('#file-input', fileURLToPath(new URL('../tests/fixtures/wav-44k-24.wav', import.meta.url)));
  await expect(page.locator('#stems-run')).toBeVisible({ timeout: 30_000 });
  // Cancel while the engine loads must stick (it used to be lost).
  await page.click('#stems-run');
  await page.click('#stems-cancel');
  await expect(page.locator('#stems-run')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(5000);
  await expect(page.locator('#stems-ready')).toHaveCount(0);
  // Real run.
  await page.click('#stems-run');
  await expect(page.locator('#stems-ready')).toBeVisible({ timeout: 840_000 });
  await expect(page.locator('#stem-chips .tog')).toHaveCount(4);
});
