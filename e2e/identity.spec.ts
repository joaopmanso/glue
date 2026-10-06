/* One id per computer (ADR 0108), against GLUE Home's real service page (its Rust side stood in) and a
   stand-in GLUE Cloud running its real code: a GLUE folder shaped like the user's desktop on 2026-09-30
   (its songs written under a stand-in, its entry claimed by another browser's own folder) is put right by
   GLUE Home once it knows its computer; and a browser that kept a library of its own opens GLUE Home's. */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FakeHome } from './fakeHome';
import { TAURI_MOCK } from './tauri-mock';
import { SharedCloudServer } from '../tests/sharedCloud';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-e2e-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1920, height: 960 } });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});

/** Every file of a folder, as text (the JSON ones). */
function texts(dir: string, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const p = prefix ? prefix + '/' + e.name : e.name;
    if (e.isDirectory()) Object.assign(out, texts(dir, p));
    else if (p.endsWith('.json')) out[p] = readFileSync(join(dir, p), 'utf8');
  }
  return out;
}

test('GLUE Home learns its computer from its music folders, vouches for it, and puts back what was written under a stand-in (ADR 0108)', async ({ page }) => {
  test.setTimeout(180_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-identity-'));
  const fake = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: { music: join(tmp, 'Music') } });
  try {
    mkdirSync(join(tmp, 'Music'), { recursive: true }); mkdirSync(fake.dirs.incoming, { recursive: true });
    const col = 'profiles/b2df/collections/bf92';
    const copy = (rootId: string, relPath: string) => ({ status: 'linked', rootId, relPath, importPath: null, size: 10, mtime: 1, sources: [] });
    const song = (id: string, added: string, copies: Record<string, unknown>) => ({ id, fileName: id + '.wav', title: id, artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: 1, format: null, addedAt: added, copies });
    const meta = {
      schemaVersion: 1, id: 'bf92', name: 'My collection', createdAt: '2026-09-24', shared: true,
      members: { lap: { profile: 'plap', name: 'INW Laptop' }, mmJiL: { profile: 'pedge', name: 'Desktop' }, 'this-computer': { profile: 'b2df', name: 'This computer' } },
      rootsBy: { lap: [], mmJiL: [{ id: 'incoming', name: 'TO BE SORTED', hidden: true }, { id: 'music', name: 'Music' }], 'this-computer': [{ id: 'incoming', name: 'TO BE SORTED', hidden: true }] },
    };
    // Every song in one shard file (the file name is only where the store looks: `tracks/<shard>.json`).
    const shard = (await import('../src/store/types')).shardOf;
    const items = {
      a: song('a', '2026-09-01', { mmJiL: copy('music', 'a.wav'), 'this-computer': copy('music', 'a.wav') }),
      b: song('b', '2026-09-01', { mmJiL: copy('incoming', 'b.wav') }),
      b2: song('b2', '2026-09-30', { 'this-computer': copy('incoming', 'b.wav') }),
      l: song('l', '2026-09-01', { lap: copy('lr', 'l.wav') }),
    };
    const files: Record<string, string> = {
      'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'b2df', name: '404', color: '#7cc7ff' }], lastProfile: 'b2df' }),
      'profiles/b2df/profile.json': JSON.stringify({ schemaVersion: 1, id: 'b2df', name: '404', color: '#7cc7ff', createdAt: '2026-01-01', collections: [{ id: 'bf92', name: 'My collection' }], lastCollection: 'bf92' }),
      [col + '/collection.json']: JSON.stringify(meta),
      [col + '/lists/p1.json']: JSON.stringify({ schemaVersion: 1, id: 'p1', kind: 'playlist', name: 'Set', parentId: null, position: 0, notes: '', items: ['b2', 'a'], origin: null, createdAt: '' }),
    };
    const byShard: Record<string, Record<string, unknown>> = {};
    for (const [id, t] of Object.entries(items)) (byShard[shard(id)] ??= {})[id] = t;
    for (const [sh, its] of Object.entries(byShard)) files[`${col}/tracks/${sh}.json`] = JSON.stringify({ schemaVersion: 1, items: its });
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(fake.dirs.glue, rel)), { recursive: true }); writeFileSync(join(fake.dirs.glue, rel), text); }
    await fake.start();

    // GLUE Cloud: the same collection (in step, as of revision 1); this GLUE Home has no companion yet.
    const server = new SharedCloudServer();
    const cloudFiles: Record<string, string> = {};
    for (const [rel, text] of Object.entries(files)) if (rel.startsWith(col + '/')) cloudFiles[rel.slice(col.length + 1)] = text;
    await server.seed('bf92', 'My collection', cloudFiles, 'lap', 1);
    // GLUE Home's engine syncs (ADR 0155): its calls to GLUE Cloud, answered by the stand-in as this computer (the rest by
    // the routes below).
    fake.cloud = async (method, path, body) => (await server.answer(method, new URL('https://glue-api.joaopmanso.workers.dev' + path), body, 'mmJiL')) ?? null;
    const agreed: Record<string, { rev: number; hash: string; text: string }> = {};
    const { createHash } = await import('node:crypto');
    for (const [p, text] of Object.entries(cloudFiles)) agreed[p] = { rev: 1, hash: createHash('sha256').update(text).digest('hex'), text };
    mkdirSync(join(fake.dirs.glue, 'cloud', 'shared'), { recursive: true });
    writeFileSync(join(fake.dirs.glue, 'cloud', 'shared', 'bf92.json'), JSON.stringify({ cursor: 1, files: agreed }));
    const attached: string[] = [];
    const home = await page.context().newPage();
    await home.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
      const req = r.request(), u = new URL(req.url()), p = u.pathname;
      const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
      if (p === '/v1/computer') return json({ computer: null });
      if (p === '/v1/computer/attach') { const b = req.postDataJSON() as { browser: string }; attached.push(b.browser); return json({ device: b.browser }); }
      if (p === '/v1/me') return json({ user: { id: 'u1' }, thisDevice: 'hdesk', devices: [], sessions: [] });
      if (p === '/v1/turn') return json({ iceServers: [], ttl: 0 });
      const a = await server.answer(req.method(), u, req.postData(), 'mmJiL');
      if (a) return r.fulfill({ status: a.status, contentType: a.type, body: a.body });
      return json({ access: 'h' });
    });
    await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => { setTimeout(() => ws.send(JSON.stringify({ type: 'presence', online: ['hdesk'] })), 500); });
    await home.addInitScript(TAURI_MOCK);
    await home.addInitScript(({ glue, port, token, dir, music }) => {
      const w = window as unknown as Record<string, unknown>; w.__glue = glue; w.__localPort = port; w.__lease = false;
      localStorage.setItem('home-config', JSON.stringify({ deviceId: 'hdesk', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true, glue: dir, localToken: token, folders: { music } }));
    }, { glue: files, port: fake.port, token: fake.token, dir: fake.dirs.glue, music: join(tmp, 'Music') });
    await home.goto('http://localhost:5176/service.html');

    // It vouches for the computer whose music folders it found here, and says so.
    await expect.poll(() => attached, { timeout: 60_000 }).toEqual(['mmJiL']);
    await expect.poll(() => home.evaluate(() => (window as unknown as { __status?: { computer?: { id: string | null } } }).__status?.computer?.id), { timeout: 30_000 }).toBe('mmJiL');

    // Put right, after a backup: the desktop's entry is its folder's again, nothing is under the stand-in, and the
    // song that was twice in TO BE SORTED is once, its playlist place kept.
    const meta2 = () => JSON.parse(readFileSync(join(fake.dirs.glue, col, 'collection.json'), 'utf8')) as typeof meta;
    await expect.poll(() => Object.keys(meta2().members).sort(), { timeout: 60_000 }).toEqual(['lap', 'mmJiL']);
    expect(meta2().members.mmJiL.profile).toBe('b2df');
    expect(existsSync(join(fake.dirs.glue, 'backups')) && readdirSync(join(fake.dirs.glue, 'backups')).some(n => n.startsWith('pre-repair-'))).toBe(true);
    await expect.poll(() => Object.entries(texts(join(fake.dirs.glue, col))).filter(([, t]) => t.includes('this-computer')).map(([p]) => p), { timeout: 30_000 }).toEqual([]);
    const lists = JSON.parse(readFileSync(join(fake.dirs.glue, col, 'lists', 'p1.json'), 'utf8')) as { items: string[] };
    expect(lists.items).toEqual(['b', 'a']);
    // And GLUE Cloud has it too (sent up like any edit).
    await expect.poll(async () => JSON.parse(await server.current('bf92', 'collection.json') ?? '{}').members?.mmJiL?.profile, { timeout: 60_000 }).toBe('b2df');
    await home.close();
  } finally { await fake.stop(); rmSync(tmp, { recursive: true, force: true }); }
});

test('a browser that kept a library of its own opens GLUE Home’s on a computer where it runs (ADR 0108)', async ({ page }) => {
  test.setTimeout(120_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-private-home-'));
  const fake = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: {} });
  try {
    mkdirSync(fake.dirs.incoming, { recursive: true });
    const files: Record<string, string> = {
      'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'b2df', name: '404', color: '#7cc7ff' }], lastProfile: 'b2df' }),
      'profiles/b2df/profile.json': JSON.stringify({ schemaVersion: 1, id: 'b2df', name: '404', color: '#7cc7ff', createdAt: '2026-01-01', collections: [{ id: 'c1', name: 'Main' }], lastCollection: 'c1', cloudSync: false }),
      'profiles/b2df/collections/c1/collection.json': JSON.stringify({ schemaVersion: 1, id: 'c1', name: 'Main', createdAt: '2026-01-01', roots: [] }),
    };
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(fake.dirs.glue, rel)), { recursive: true }); writeFileSync(join(fake.dirs.glue, rel), text); }
    await fake.start();
    // Last time this browser kept a library in its own storage (a profile "Joao Manso"), as Edge had.
    await page.goto('./#/analyze');
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const w = async (path: string, text: string) => {
        const parts = path.split('/'), name = parts.pop()!;
        let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
        const f = await (await d.getFileHandle(name, { create: true })).createWritable(); await f.write(text); await f.close();
      };
      await w('mco.json', JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'e791', name: 'Joao Manso', color: '#fff' }], lastProfile: 'e791' }));
      await w('profiles/e791/profile.json', JSON.stringify({ schemaVersion: 1, id: 'e791', name: 'Joao Manso', color: '#fff', createdAt: '', collections: [], lastCollection: null }));
      await new Promise<void>((res, rej) => { const r = indexedDB.open('mco'); r.onupgradeneeded = () => r.result.createObjectStore('handles'); r.onsuccess = () => { const t = r.result.transaction('handles', 'readwrite'); t.objectStore('handles').put({ kind: 'private' }, 'home'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }; r.onerror = () => rej(r.error); });
    });
    await page.evaluate(p => localStorage.setItem('mco.localHome', JSON.stringify(p)), fake.pref);
    await page.goto('./');
    // GLUE Home's library: its profile's collection, not the browser's own copy.
    await expect(page.locator('#collection-pick')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#collection-pick option', { hasText: 'Main' })).toHaveCount(1);
    await expect(page.locator('body')).not.toContainText('Joao Manso');
    expect([...fake.calls, ...fake.reads].some(r => r.includes('mco.json'))).toBe(true);   // read through GLUE Home's disk
  } finally { await fake.stop(); rmSync(tmp, { recursive: true, force: true }); }
});
