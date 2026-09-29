/* One device per computer (ADR 0091): a second browser on a computer whose GLUE Home runs finds it on
   127.0.0.1, asks it to vouch (its local link's /attach), and from then on is that computer's device.
   Against a stand-in GLUE Cloud; GLUE Home's real service page with its Rust side stood in. */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TAURI_MOCK } from './tauri-mock';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-computers-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1600, height: 900 } });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});

test('a second browser on a computer with GLUE Home joins that computer: one device, not two', async ({ page }) => {
  test.setTimeout(150_000);
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null };
  const desk = { id: 'b1', kind: 'browser', name: 'Desktop', platform: 'Win32', createdAt: 1, lastSeen: 1, role: 'device' };
  const home = { id: 'h1', kind: 'home', name: 'Desktop', platform: 'win32', createdAt: 2, lastSeen: 2, companionOf: 'b1', role: 'device' };
  const chrome = { id: 'b2', kind: 'browser', name: 'Chrome on Windows', platform: 'Win32', createdAt: 3, lastSeen: 3, role: 'browse' };
  let joined = false;
  const attachCalls: unknown[] = [];
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
      renderButton(el) { const b = document.createElement('button'); b.className = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
  const me = () => joined ? 'b1' : 'b2';
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    const p = new URL(r.request().url()).pathname, m = r.request().method();
    const json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/health') return json({ ok: true });
    if (p === '/v1/auth/google') return json({ access: 'a', refresh: 'r', deviceId: 'b2', user });
    if (p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: me() });
    if (p === '/v1/me') return json({ user, thisDevice: me(), devices: [desk, home], sessions: joined ? [] : [chrome] });
    if (p === '/v1/turn') return json({ iceServers: [], ttl: 0 });
    if (p === '/v1/sync' && m === 'GET') return json({ thisDevice: me(), profiles: [] });
    if (p === '/v1/sync/links') return json({ groups: [] });
    return json({ error: 'not found' });
  });
  // The signaling room: the browser (as whichever device it is now) and the desktop's GLUE Home.
  const socks: Record<string, import('@playwright/test').WebSocketRoute | null> = {};
  const presence = () => { const online = Object.keys(socks).filter(k => socks[k]); for (const w of Object.values(socks)) w?.send(JSON.stringify({ type: 'presence', online })); };
  const room = (who: () => string) => (ws: import('@playwright/test').WebSocketRoute) => {
    const id = who(); socks[id] = ws; presence();
    ws.onMessage(raw => { const j = JSON.parse(String(raw)); if (j.type === 'signal') socks[j.to]?.send(JSON.stringify({ type: 'signal', from: id, data: j.data })); });
  };
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room(me));

  // The desktop's GLUE Home.
  const homePage = await page.context().newPage();
  await homePage.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    const p = new URL(r.request().url()).pathname;
    if (p === '/v1/computer/attach') { attachCalls.push(r.request().postDataJSON()); joined = true; return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ device: 'b1' }) }); }
    if (p === '/v1/turn') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ iceServers: [], ttl: 0 }) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ access: 'h' }) });
  });
  await homePage.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room(() => 'h1'));
  await homePage.addInitScript(TAURI_MOCK);
  await homePage.addInitScript(() => localStorage.setItem('home-config', JSON.stringify({ deviceId: 'h1', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true, localToken: 'local-secret' })));
  await homePage.goto('http://localhost:5176/service.html');
  await expect(homePage.locator('#state')).toContainText('Online as Desktop');

  // Its local link on 127.0.0.1 (Rust, stood in): /hello says who it is; /attach, with its token, is passed
  // to the service page as Rust passes it (an event).
  await page.context().route(/^http:\/\/127\.0\.0\.1:474\d\d\//, async r => {
    const u = new URL(r.request().url()), cors = { 'Access-Control-Allow-Origin': 'http://localhost:5174', 'Access-Control-Allow-Private-Network': 'true' };
    if (u.port !== '47400') return r.abort('connectionrefused');
    if (u.pathname === '/hello') return r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ app: 'glue-home', version: '0.23.0', device: 'h1' }) });
    if (u.searchParams.get('t') !== 'local-secret') return r.fulfill({ status: 401, headers: cors, body: '{}' });
    if (u.pathname === '/attach' && r.request().method() === 'POST') {
      const body = r.request().postData() ?? '';
      await homePage.evaluate(b => (window as unknown as { __tauriEvent: (e: string, p: unknown) => void }).__tauriEvent('attach', b), body);
      return r.fulfill({ status: 202, headers: cors, body: '{}' });
    }
    return r.fulfill({ status: 404, headers: cors, body: '{}' });
  });

  // Chrome on the same computer signs in: a session at first, then it joins the desktop.
  await page.goto('./');
  await page.locator('#cloud-panel .fake-google').click();
  await expect.poll(() => attachCalls, { timeout: 60_000 }).toEqual([{ browser: 'b2' }]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mco.cloud.device')), { timeout: 30_000 }).toBe('b1');
  await homePage.close();
});
