/* The Prepare tab (ADR 0052): waveform and grid on a real track, a BPM correction that shows in the
   library and survives a reload, the profile's BPM range and a track's flip, and Re-analyse resetting
   the correction. */
import { test as base, expect, chromium, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-e2e-'));
    const ctx = await chromium.launchPersistentContext(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1600, height: 1000 } });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
  });
});
test.afterEach(() => expect(errors).toEqual([]));

/** 30 s of a four-to-the-floor beat at `bpm` from `offset`: a kick (a low thump) on every beat, louder on each bar's first, and a hat between. 16-bit mono WAV. */
function beatWav(bpm: number, offset: number, seconds = 30, sr = 44100) {
  const n = sr * seconds, x = new Float32Array(n), p = 60 / bpm;
  let s = 99; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
  for (let k = 0, t = offset; t < seconds - 0.3; k++, t += p) {
    const a = Math.round(t * sr), g = k % 4 === 0 ? 0.9 : 0.55;
    for (let i = 0; i < 0.18 * sr && a + i < n; i++) { const tt = i / sr; x[a + i] += g * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 14); }
    const h = Math.round((t + p / 2) * sr);
    for (let i = 0; i < 0.03 * sr && h + i < n; i++) x[h + i] += 0.15 * rnd() * Math.exp(-i / (0.005 * sr));
  }
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 30000))), 44 + i * 2);
  return b;
}

test('Prepare: waveform and grid, a BPM correction shown in the library, range and flip, Re-analyse resets it', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('./#/analyze');
  const wav = beatWav(124, 0.2).toString('base64');
  await page.evaluate(async b64 => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Music', { create: true });
    // The song, and a second copy of it under another name (the same recording, found by sound).
    for (const name of ['Beat 124.wav', 'Other take.wav']) {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); await w.close();
    }
  }, wav);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });
  const row = page.locator('.tr', { hasText: 'Beat 124' }), copy = page.locator('.tr', { hasText: 'Other take' });
  await expect(row.locator('.c-num').first()).toHaveText(/^12[34]/);
  await expect(page.locator('.lside .name', { hasText: 'Duplicates' })).toContainText('1', { timeout: 30_000 });

  // The sidebar's sections fold, and one can take the full height (the others fold meanwhile).
  const allTracks = page.locator('.lside .name', { hasText: 'All tracks' });
  await page.click('[data-sec="library"]');
  await expect(allTracks).toHaveCount(0);
  await page.click('[data-sec="library"]');
  await expect(allTracks).toHaveCount(1);
  await page.click('[data-max="music"]');
  await expect(allTracks).toHaveCount(0);
  await expect(page.locator('.lside .name', { hasText: '📁 Music' })).toBeVisible();
  await page.click('[data-max="music"]');
  await expect(allTracks).toHaveCount(1);

  // Prepare: the waveform draws, the BPM in use is the analysis's.
  await row.locator('.c-title').dblclick();
  await page.click('#tab-prepare');
  await expect(page).toHaveURL(/\/prepare$/);
  await expect(page.locator('#prep-bpm')).toContainText(/12[34]\.\d\d/, { timeout: 30_000 });
  await expect(page.locator('.over-msg')).toHaveCount(0, { timeout: 30_000 });
  const lit = await page.locator('#prep-overview').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
    return n / (d.length / 4);
  });
  expect(lit).toBeGreaterThan(0.05);   // the overview isn't blank
  await expect(page.locator('#prep-copies')).toContainText('the other copy');

  // Tempo +4%: the BPM shown follows the speed; the metronome switches on and off.
  await page.locator('#prep-tempo').evaluate((el: HTMLInputElement) => { el.value = '4'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#prep-bpm')).toContainText('128.96');   // 124 × 1.04
  await expect(page.locator('#prep-bpm')).toContainText('+4.0%');
  await page.locator('#prep-tempo').dblclick();
  await expect(page.locator('#prep-bpm')).not.toContainText('%');
  await page.click('#prep-metronome');
  await expect(page.locator('#prep-metronome')).toHaveClass(/on/);
  await page.click('#prep-metronome');
  await expect(page.locator('#prep-metronome')).not.toHaveClass(/on/);

  // Cues (step 2): hot cues A and B, a memory cue, a 4-beat loop saved; they stay after a reload.
  const ov = page.locator('#prep-overview'), box = (await ov.boundingBox())!;
  await page.click('[data-pad="A"]');
  await expect(page.locator('[data-pad="A"]')).toHaveClass(/set/);
  await ov.click({ position: { x: box.width * 10 / 30, y: box.height / 2 } });
  await page.click('[data-pad="B"]');
  await page.click('#prep-memory');
  await page.click('[data-loop="4"]');
  await page.click('#prep-loop-save');
  await expect(page.locator('#prep-cues .mc')).toHaveCount(2);
  await expect(page.locator('#prep-cues .mc').last()).toContainText('⟳');
  await page.click('#prep-loop-exit');
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('[data-pad="B"]')).toHaveClass(/set/, { timeout: 30_000 });
  await expect(page.locator('[data-pad="B"] small')).toHaveText(/^0:(09|10)\./);   // on a beat near 10 s
  await expect(page.locator('[data-pad="C"]')).not.toHaveClass(/set/);
  await expect(page.locator('#prep-cues .mc')).toHaveCount(2);
  // Shift-click clears a pad.
  await page.locator('[data-pad="A"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-pad="A"]')).not.toHaveClass(/set/);

  await expect(page.locator('#prep-copies')).toBeVisible({ timeout: 30_000 });   // Duplicates found the copy again (after the reload)
  // A correction: 125.00, saved on the track, shown (as yours) in the library, after a reload too.
  await page.fill('#prep-bpm-input', '125');
  await page.locator('#prep-bpm-input').press('Enter');
  await expect(page.locator('#prep-bpm')).toContainText('125.00');
  await expect(page.locator('#prep-reset')).toBeVisible();
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('#prep-bpm')).toContainText('125.00', { timeout: 30_000 });
  // The Details tab's Tempo card and table show it too.
  await page.click('#tab-details');
  await expect(page.locator('#m-bpm')).toContainText('125', { timeout: 30_000 });
  await expect(page.locator('#m-bpm-sub')).toContainText('your BPM');
  await page.goto('./#/');
  await expect(row.locator('.c-num.mine')).toHaveText('125');
  await expect(copy.locator('.c-num.mine')).toHaveText('125');   // the other copy of the recording too

  // The profile shows BPMs half-time: 62.5; this track flipped back: 125.
  await page.locator('.top .who').click();
  await page.locator('select[data-bpm-range]').selectOption('half');
  await page.locator('.profile', { hasText: 'DJ Test' }).click();
  await expect(row.locator('.c-num.mine')).toHaveText('62.5');
  await row.locator('.c-title').dblclick();
  await expect(page.locator('#m-bpm')).toContainText('62.5', { timeout: 30_000 });
  await page.click('#tab-prepare');
  await expect(page.locator('#prep-copies')).toBeVisible({ timeout: 30_000 });   // Duplicates found the copy again
  await page.locator('#prep-flip').check();
  await page.goto('./#/');
  await expect(row.locator('.c-num.mine')).toHaveText('125');
  await expect(copy.locator('.c-num.mine')).toHaveText('125');

  // Re-analyse: the correction goes; the analysis's BPM (folded, flipped) is back.
  await row.locator('.c-title').dblclick();
  await page.click('#tab-details');
  await page.click('#reanalyse');
  await expect(page.locator('#v-pill')).not.toHaveText('', { timeout: 60_000 });
  await page.goto('./#/');
  await expect(row.locator('.c-num.mine')).toHaveCount(0);
  await expect(copy.locator('.c-num.mine')).toHaveCount(0);
  await expect(row.locator('.c-num').first()).toHaveText(/^12[34]/);   // half-time, flipped: back to ~124
  // Cues aren't analysis: Re-analyse kept them.
  await row.locator('.c-title').dblclick();
  await page.click('#tab-prepare');
  await expect(page.locator('[data-pad="B"]')).toHaveClass(/set/, { timeout: 30_000 });
});
