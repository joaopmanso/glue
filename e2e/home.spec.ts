import { test, expect } from '@playwright/test';
import { TAURI_MOCK } from './tauri-mock';

// GLUE Home's settings window (home/ui), with its Rust side replaced by e2e/tauri-mock.ts.
const HOME = 'http://localhost:5176/';
const GLUE = 'C:\\Users\\dj\\Documents\\GLUE';
// The website's GLUE folder on this computer: one profile, one collection with two music folders.
const LIBRARY = {
  'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'p1', name: 'Nova', color: '#fff' }], lastProfile: 'p1' }),
  'profiles/p1/profile.json': JSON.stringify({ schemaVersion: 1, id: 'p1', name: 'Nova', color: '#fff', createdAt: '', collections: [{ id: 'c1', name: 'My collection' }], lastCollection: 'c1' }),
  'profiles/p1/collections/c1/collection.json': JSON.stringify({ schemaVersion: 1, id: 'c1', name: 'My collection', createdAt: '', roots: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'x', addedAt: '' }, { id: 'r2', name: 'Promos', absPath: null, handleKey: 'y', addedAt: '' }] }),
};

test('GLUE Home settings: asks about starting with the computer; connects with a code as this computer’s companion; finds the GLUE folder and music folders', async ({ page }) => {
  const claims: Record<string, unknown>[] = [];
  const ctx = page.context();
  await ctx.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
    const p = new URL(r.request().url()).pathname, body = r.request().postDataJSON() ?? {};
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/pairing/claim') { claims.push(body); return body.code === 'WRONG-CODE' ? json({ error: 'that code isn’t valid' }, 401) : json({ deviceId: 'h' + claims.length, token: 't' + claims.length, name: body.name, user: { email: 'dj@example.com', name: 'DJ' }, companionOf: { id: 'b1', name: 'Desktop' } }); }
    if (p === '/v1/auth/device') return json({ access: 'a' });
    return json({ error: 'not found' }, 404);
  });
  await ctx.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => { ws.send(JSON.stringify({ type: 'presence', online: ['h1'] })); ws.onMessage(() => {}); });
  await ctx.addInitScript(TAURI_MOCK);
  await ctx.addInitScript(({ glue, lib }) => { const w = window as unknown as Record<string, unknown>; w.__glueFolder = glue; w.__glue = lib; w.__disk = { 'C:\\Users\\dj\\Music\\Sets\\a.mp3': [1] }; }, { glue: GLUE, lib: LIBRARY });
  await page.goto(HOME + 'index.html');
  // The service window runs next to it (the tray's Start / Stop go there).
  const service = await ctx.newPage();
  await service.goto(HOME + 'service.html');

  // First launch: asked once whether to start with the computer (the stand-in answers yes).
  await expect.poll(() => page.evaluate(() => localStorage.getItem('autostart'))).toBe('1');
  await expect(page.locator('#at-login')).toBeChecked();
  await expect(page.locator('#state-pill')).toHaveText('Not connected');
  await expect(page.locator('#incoming')).toContainText('GLUE Incoming');
  await expect(page.locator('#device-name')).toHaveValue('Studio PC');
  // Codes only: no email or Google sign-in.
  await expect(page.locator('#email, #password, #google')).toHaveCount(0);
  // The website's GLUE folder is found, with its profile, collection and music folders.
  await expect(page.locator('#glue-folder')).toHaveText(GLUE);
  await expect(page.locator('#profiles')).toContainText('Nova · My collection');
  await expect(page.locator('#music-folders [data-root="r1"]')).toContainText('C:\\Users\\dj\\Music');     // found by its name
  await expect(page.locator('#music-folders [data-root="r2"]')).toContainText('not found on this computer');
  await page.locator('#music-folders [data-root="r2"] button').click();                                    // the stand-in picks D:\Incoming
  await expect(page.locator('#music-folders [data-root="r2"]')).toContainText('D:\\Incoming');

  // A wrong code, then the right one: connected, and the service goes online.
  await page.fill('#code', 'WRONG-CODE');
  await page.click('#use-code');
  await expect(page.locator('#error')).toContainText('isn’t valid');
  await page.fill('#code', 'ABCD-EFGH');
  await page.click('#use-code');
  await expect(page.locator('#account')).toContainText('dj@example.com');
  await expect(page.locator('#state-pill')).toHaveText('Online', { timeout: 15_000 });
  await expect(service.locator('#state')).toContainText('Online as Studio PC');
  expect(claims[1]).toMatchObject({ code: 'ABCD-EFGH', name: 'Studio PC' });
  expect(claims[1].replaces).toBeUndefined();

  // Connecting again with a new code replaces the previous device (it proves it's its own).
  await page.locator('details summary').click();
  await page.fill('#code-again', 'K7QM-2XPB');
  await page.locator('details button[type="submit"]').click();
  await expect.poll(() => claims.length).toBe(3);
  expect(claims[2]).toMatchObject({ code: 'K7QM-2XPB', replaces: { deviceId: 'h2', token: 't2' } });

  // Stop, Start and Restart reach the service.
  await page.click('#svc-stop');
  await expect(page.locator('#state-pill')).toHaveText('Stopped');
  await page.click('#svc-start');
  await expect(page.locator('#state-pill')).toHaveText('Online');
  await page.click('#svc-restart');
  await expect(page.locator('#state-pill')).toHaveText('Online');

  // Another incoming folder; the library in the browser.
  await page.click('#choose-incoming');
  await expect(page.locator('#incoming')).toHaveText('D:\\Incoming');
  await page.click('#open-library');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened?: string }).__opened)).toBe('library');

  // Updates: up to date, then a newer version installs and restarts GLUE Home.
  await expect(page.locator('#version')).toHaveText('GLUE Home 0.2.0');
  await page.click('#check-updates');
  await expect(page.locator('#update-state')).toHaveText('You have the latest version.');
  await page.evaluate(() => { (window as unknown as { __update: string }).__update = '0.3.0'; });
  await page.click('#check-updates');
  await expect(page.locator('#update-state')).toHaveText('Version 0.3.0 is available.');
  await page.click('#install-update');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restarted?: boolean }).__restarted)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __installed?: string }).__installed)).toBe('0.3.0');
  await expect(page.locator('#auto-update')).toBeChecked();
  await page.locator('#auto-update').uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('home-config')!).autoUpdate)).toBe(false);

  // Disconnect; then the website to get a code; asked about starting with the computer only once.
  await page.getByRole('button', { name: 'Disconnect this computer' }).click();
  await expect(page.locator('#state-pill')).toHaveText('Not connected');
  await page.click('#get-code');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened?: string }).__opened)).toBe('https://joaopmanso.github.io/glue/');
  await page.reload();
  await expect(page.locator('#glue-folder')).toHaveText(GLUE);
  expect(await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls.filter(c => c === 'plugin:dialog|message').length)).toBe(0);
});

test('GLUE Home opens with a gluehome://pair link and connects', async ({ page }) => {
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    const p = new URL(r.request().url()).pathname, body = r.request().postDataJSON() ?? {};
    const json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/pairing/claim' && body.code === 'K7QM-2XPB') return json({ deviceId: 'h3', token: 't3', name: body.name, user: { email: 'dj@example.com', name: 'DJ' } });
    return r.fulfill({ status: 404, body: '{}' });
  });
  await page.addInitScript(TAURI_MOCK);
  await page.addInitScript(() => { (window as unknown as { __deepLink: string[] }).__deepLink = ['gluehome://pair?code=K7QM-2XPB']; localStorage.setItem('home-config', JSON.stringify({ deviceId: null, token: null, name: 'Mac mini', user: null, incoming: null, running: true, askedAutostart: true })); });
  await page.goto(HOME + 'index.html');
  await expect(page.locator('#account')).toContainText('dj@example.com');
  await expect(page.locator('#account')).toContainText('Mac mini');
});
