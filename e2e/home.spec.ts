import { test, expect } from '@playwright/test';
import { TAURI_MOCK } from './tauri-mock';

// GLUE Home's settings window (home/ui), with its Rust side replaced by e2e/tauri-mock.ts.
const HOME = 'http://localhost:5176/';

test('GLUE Home settings: first launch asks about starting with the computer; sign in with email; connect with a code or a website link', async ({ page }) => {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const ctx = page.context();
  await ctx.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
    const p = new URL(r.request().url()).pathname, body = r.request().postDataJSON() ?? {};
    calls.push({ path: p, body });
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/home/signin') return body.key && body.email === 'dj@example.com' ? json({ deviceId: 'h1', token: 't1', name: body.name, user: { email: 'dj@example.com', name: 'DJ' } }) : json({ error: 'wrong email or password' }, 401);
    if (p === '/v1/pairing/claim') return body.code === 'ABCD-EFGH' ? json({ deviceId: 'h2', token: 't2', name: body.name, user: { email: 'dj@example.com', name: 'DJ' } }) : json({ error: 'that code isn’t valid' }, 401);
    if (p === '/v1/auth/device') return json({ access: 'a' });
    return json({ error: 'not found' }, 404);
  });
  await ctx.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => { ws.send(JSON.stringify({ type: 'presence', online: ['h1'] })); ws.onMessage(() => {}); });
  await ctx.addInitScript(TAURI_MOCK);
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

  // Email and password: the password is stretched here; the API gets only the key.
  await page.fill('#email', 'dj@example.com');
  await page.fill('#password', 'correct horse battery');
  await page.click('#sign-in');
  await expect(page.locator('#account')).toContainText('dj@example.com', { timeout: 20_000 });
  const si = calls.find(c => c.path === '/v1/home/signin')!;
  expect(si.body).toMatchObject({ email: 'dj@example.com', name: 'Studio PC' });
  expect(JSON.stringify(si.body)).not.toContain('correct horse');
  // The service goes online with the new credential.
  await expect(page.locator('#state-pill')).toHaveText('Online', { timeout: 15_000 });
  await expect(service.locator('#state')).toContainText('Online as Studio PC');

  // Stop, Start and Restart reach the service.
  await page.click('#svc-stop');
  await expect(page.locator('#state-pill')).toHaveText('Stopped');
  await page.click('#svc-start');
  await expect(page.locator('#state-pill')).toHaveText('Online');
  await page.click('#svc-restart');
  await expect(page.locator('#state-pill')).toHaveText('Online');

  // Another incoming folder.
  await page.click('#choose-incoming');
  await expect(page.locator('#incoming')).toHaveText('D:\\Incoming');

  // Disconnect, then connect with a code; and with a gluehome:// link from the website.
  await page.getByRole('button', { name: 'Disconnect this computer' }).click();
  await expect(page.locator('#state-pill')).toHaveText('Not connected');
  // Google: in the browser, on the website's #/connect-home.
  await page.click('#google');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened?: string }).__opened)).toBe('https://joaopmanso.github.io/glue/#/connect-home');
  await page.fill('#code', 'WRONG-CODE');
  await page.click('#use-code');
  await expect(page.locator('#error')).toContainText('isn’t valid');
  await page.fill('#code', 'ABCD-EFGH');
  await page.click('#use-code');
  await expect(page.locator('#account')).toContainText('dj@example.com');
  // Asked only on the first launch.
  await page.reload();
  await expect(page.locator('#account')).toContainText('dj@example.com');
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
