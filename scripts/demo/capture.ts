/* Screenshots and short clips of GLUE for the homepage (public/home/), from the demo library
   (scripts/demo/make-audio.ts), driven through the real app in headless Edge.
   Needs the built site served:  npm run build && npx vite preview --port 5175 --strictPort
   Then:  node scripts/demo/capture.ts   (BASE=… to point elsewhere; ONLY=name to redo one) */
import { chromium, type Page, type CDPSession } from '@playwright/test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5175/glue/';
const DEMO = join(import.meta.dirname, 'out'), OUT = join(import.meta.dirname, '..', '..', 'public', 'home');
const ONLY = process.env.ONLY ?? '';
const W = 1440, H = 900;
mkdirSync(OUT, { recursive: true });
const want = (name: string) => !ONLY || ONLY.split(',').includes(name);
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

/** A PNG screenshot → a compact WebP (2× pixels for sharp screens). */
async function shot(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) {
  if (!want(name)) return;
  const png = join(OUT, name + '.png');
  await page.screenshot({ path: png, clip });
  ff('-i', png, '-c:v', 'libwebp', '-quality', '84', '-compression_level', '6', join(OUT, name + '.webp'));
  rmSync(png);
  console.log('shot', name);
}

/** A visible pointer for the recordings (screencasts don't include the system cursor), with a ring on click. */
async function cursor(page: Page, on: boolean) {
  await page.evaluate(on => {
    document.getElementById('demo-cursor')?.remove();
    if (!on) return;
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2l17 9.5-7.4 1.6 4.3 8.6-3.2 1.6-4.3-8.7L3 20z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg><i></i>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: '99999', pointerEvents: 'none', transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / .5))' });
    const ring = c.querySelector('i') as HTMLElement;
    Object.assign(ring.style, { position: 'absolute', left: '-14px', top: '-14px', width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #ffd100', opacity: '0' });
    document.body.appendChild(c);
    addEventListener('mousemove', e => { c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }, true);
    addEventListener('mousedown', () => ring.animate([{ opacity: 1, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 450, easing: 'ease-out' }), true);
  }, on);
}

/** Record `act` with the DevTools screencast (every painted frame) → an H.264 MP4 and a poster. */
async function clip(page: Page, cdp: CDPSession, name: string, seconds: number, act: () => Promise<void>) {
  if (!want(name)) return;
  const dir = mkdtempSync(join(tmpdir(), 'glue-clip-'));
  const frames: { file: string; t: number }[] = [];
  const onFrame = async (f: { data: string; metadata: { timestamp: number }; sessionId: number }) => {
    const file = join(dir, String(frames.length).padStart(5, '0') + '.jpg');
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cursor(page, true);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
  const t0 = Date.now();
  await act();
  const left = seconds * 1000 - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
  const end = Date.now() / 1000;   // the screencast's timestamps are wall-clock seconds too
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  await cursor(page, false);
  // Frames arrive when something paints: hold each until the next (concat demuxer durations).
  const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.01, ((frames[i + 1]?.t ?? end) - f.t)).toFixed(3)}`).join('\n') + `\nfile '${frames[frames.length - 1].file.replace(/\\/g, '/')}'\n`;
  const listFile = join(dir, 'list.txt');
  writeFileSync(listFile, list);
  ff('-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=30,scale=${W}:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', '-an', join(OUT, name + '.mp4'));
  // The poster: a frame from well into the clip (after the first click has done something).
  ff('-i', frames[Math.floor(frames.length * 0.62)].file, '-vf', `scale=${W}:-2`, '-c:v', 'libwebp', '-quality', '80', join(OUT, name + '-poster.webp'));
  rmSync(dir, { recursive: true, force: true });
  console.log('clip', name, frames.length, 'frames');
}

const profile = mkdtempSync(join(tmpdir(), 'glue-capture-'));
const ctx = await chromium.launchPersistentContext(profile, { channel: 'msedge', viewport: { width: W, height: H }, deviceScaleFactor: 2, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('mco.theme', 'stick'); localStorage.setItem('mco.mode', 'dark');
    const w = window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> };
    w.showDirectoryPicker = async o => (await navigator.storage.getDirectory()).getDirectoryHandle(o.id === 'mco-home' ? 'GLUE' : 'Music', { create: true });
  });
  // Serve the demo files to the page, which writes them into its private storage as "Music/Sets".
  await page.route('https://demo.local/**', r => r.fulfill({ body: readFileSync(join(DEMO, decodeURIComponent(new URL(r.request().url()).pathname))) }));
  await page.goto(BASE + '#/analyze');
  const files = readdirSync(join(DEMO, 'Sets'));
  await page.evaluate(async files => {
    const root = await navigator.storage.getDirectory();
    const sets = await (await root.getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    for (const n of files) {
      const b = await (await fetch('https://demo.local/Sets/' + encodeURIComponent(n))).arrayBuffer();
      const w = await (await sets.getFileHandle(n, { create: true })).createWritable(); await w.write(b); await w.close();
    }
  }, files);
  console.log('seeded', files.length, 'files');

  // Set up a profile, import the rekordbox library, link the music folder, let it analyse.
  await page.goto(BASE);
  await page.click('#choose-home');
  await page.fill('#profile-name', 'Nova');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.setInputFiles('#import-input', { name: 'rekordbox.xml', mimeType: 'text/xml', buffer: readFileSync(join(DEMO, 'rekordbox.xml')) });
  await page.click('#add-folder');
  await page.locator('.an').filter({ hasText: 'All analysed' }).waitFor({ timeout: 10 * 60_000 });
  await page.waitForTimeout(4000);   // duplicates and thumbnails settle
  await page.evaluate(() => document.querySelectorAll('.toast button').forEach(b => (b as HTMLButtonElement).click()));
  const cdp = await ctx.newCDPSession(page);
  const row = (t: string) => page.locator('.tr', { hasText: t });

  // 1. The library: overview spectrograms, quality, tags, ratings.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await page.locator('.thead [data-col="artist"]').click();
  await page.mouse.move(W - 10, H - 10);
  await page.waitForTimeout(1500);
  await shot(page, 'library');

  // 2. A playlist with its insights (tempo flow, keys, tags Venn).
  // The imported playlists live in a folder named after the app: open it, then the subfolder.
  await page.locator('.lside .tree .item', { hasText: 'Rekordbox' }).locator('.twist').first().click();
  await page.locator('.lside .tree .name', { hasText: 'Peak time' }).click();
  await page.waitForTimeout(1200);
  await shot(page, 'insights');

  // 3. Clip: click a mini spectrogram to play from there, scrub, then another track.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await page.waitForTimeout(800);
  await clip(page, cdp, 'clip-library', 9, async () => {
    const wave = async (t: string, f: number) => { await row(t).scrollIntoViewIfNeeded(); const b = (await row(t).locator('.wave').boundingBox())!; await page.mouse.move(b.x + b.width * f, b.y + b.height / 2, { steps: 14 }); await page.mouse.click(b.x + b.width * f, b.y + b.height / 2); };
    await page.waitForTimeout(600);
    await wave('Tunnel Vision', 0.3);
    await page.waitForTimeout(1200);
    console.log('player:', await page.locator('#lib-play').getAttribute('aria-label'));
    await page.waitForTimeout(1400);
    await wave('Tunnel Vision', 0.72);
    await page.waitForTimeout(2200);
    await wave('Heatwave', 0.45);
    await page.waitForTimeout(2500);
  });
  if (await page.locator('#lib-play').getAttribute('aria-label') === 'Pause') await page.click('#lib-play');

  // 4. The track page of a "lossless" WAV that was an MP3: the wall at 16 kHz, the verdict.
  await row('Undertow').dblclick();
  await page.locator('#v-pill').filter({ hasText: /\w/ }).waitFor({ timeout: 60_000 });
  // The verdict and the spectrogram with the encoder's wall.
  await page.locator('#results').evaluate(e => window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 24));
  await page.waitForTimeout(1500);
  await shot(page, 'quality');
  await page.evaluate(() => window.scrollTo(0, 0));

  // 5. Clip: play with the live 3D spectrum on.
  await page.locator('.crumbs a').click();
  await row('Red Meridian').dblclick();
  await page.locator('#v-pill').filter({ hasText: /\w/ }).waitFor({ timeout: 60_000 });
  if (!await page.locator('#live-toggle').isChecked()) await page.click('#live-toggle');
  await page.click('#live-3d');
  await page.locator('#spec-box').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(600);
  await clip(page, cdp, 'clip-live', 9, async () => {
    const p = (await page.locator('#play-btn').boundingBox())!;
    await page.mouse.move(p.x - 200, p.y + 120);
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 16 });
    await page.mouse.click(p.x + p.width / 2, p.y + p.height / 2);
    await page.mouse.move(p.x + 300, p.y + 420, { steps: 20 });
  });
  await page.click('#play-btn');
  await page.locator('.crumbs a').click();

  // 6. The playlist builder: from a track, generate, then another take.
  await row('Tidewater').click();
  await page.click('#auto-from');
  await page.locator('#auto-dialog').waitFor();
  await page.waitForTimeout(500);
  await clip(page, cdp, 'clip-builder', 8, async () => {
    const at = async (sel: string) => { await page.locator(sel).scrollIntoViewIfNeeded(); const b = (await page.locator(sel).boundingBox())!; await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 }); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
    await page.mouse.move(700, 450);
    await page.waitForTimeout(400);
    await at('#auto-go');
    await page.waitForTimeout(2400);
    await at('#auto-again');
    await page.waitForTimeout(2200);
    await at('#auto-again');
    await page.waitForTimeout(1600);
  });
  await shot(page, 'builder');
  await page.keyboard.press('Escape');

  // 7. Duplicates found by sound.
  await page.locator('.lside .name', { hasText: 'Duplicates' }).click();
  await page.waitForTimeout(1500);
  { const b = (await page.locator('.dv').boundingBox())!; await shot(page, 'duplicates', { x: b.x - 16, y: b.y - 60, width: Math.min(1000, b.width + 32), height: 560 }); }

  // 8. The filter by quality (a menu open on the table).
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await page.locator('.thead [data-col="quality"]').hover();
  await page.click('[data-hf="quality"]');
  await page.waitForTimeout(600);
  { const p = (await page.locator('#head-filter').boundingBox())!; const x = Math.max(0, p.x + p.width - 900); await shot(page, 'filter', { x, y: 120, width: 900 + 30, height: 560 }); }
  console.log('done →', OUT, existsSync(OUT) ? readdirSync(OUT).join(', ') : '');
} finally {
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
}
