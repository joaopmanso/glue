/* End-to-end check (not part of CI): a browser device makes a pairing code, GLUE Home pairs and goes
   online, both see each other in the room, a signal reaches GLUE Home, and revoking it kicks it out.
   Local (`wrangler dev`, user u1/b1): node cloud/smoke-local.ts
   Live: SMOKE_API=https://glue-api.joaopmanso.workers.dev SMOKE_KEY=<SESSION_KEY> SMOKE_USER=smoke-u1 SMOKE_DEVICE=smoke-b1 node cloud/smoke-local.ts */
import { signAccess } from './src/crypto.ts';
import { pair, stayOnline } from '../home/src/home.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = process.env.SMOKE_API ?? 'http://127.0.0.1:8787', KEY = process.env.SMOKE_KEY ?? 'local-dev-session-key-not-secret-0123456789';
const U = process.env.SMOKE_USER ?? 'u1', B = process.env.SMOKE_DEVICE ?? 'b1';
const browser = await signAccess({ sub: U, dev: B }, KEY, Date.now());
const say = (s: string) => console.log('·', s);
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const code = (await (await fetch(API + '/v1/pairing', { method: 'POST', headers: { Authorization: 'Bearer ' + browser } })).json() as { code: string }).code;
say('pairing code ' + code);
const cfg = await pair(code, { name: 'Smoke Home', api: API, path: join(mkdtempSync(join(tmpdir(), 'glue-smoke-')), 'c.json') });
say('paired: device ' + cfg.deviceId);

const homeLog: string[] = [];
const stop = stayOnline(cfg, s => { homeLog.push(s); say('home: ' + s); });
const ws = new WebSocket(API.replace('http', 'ws') + '/v1/signal?token=' + browser);
const got: { type: string; online?: string[] }[] = [];
ws.onmessage = e => { const m = JSON.parse(String(e.data)); got.push(m); say('browser got ' + JSON.stringify(m)); };
await new Promise(r => { ws.onopen = r; });
await wait(1500);
const both = got.some(m => m.type === 'presence' && m.online?.includes(B) && m.online.includes(cfg.deviceId));
ws.send(JSON.stringify({ type: 'signal', to: cfg.deviceId, data: { hello: 'offer' } }));
await wait(800);
const signalled = homeLog.some(s => s.includes('Connection request from ' + B));
const del = await fetch(API + '/v1/devices/' + cfg.deviceId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + browser } });
await wait(5000);
const kicked = homeLog.some(s => s.includes('removed from the account'));
const afterKick = got.filter(m => m.type === 'presence').at(-1)?.online ?? [];
stop(); ws.close();
const ok = both && signalled && del.ok && kicked && !afterKick.includes(cfg.deviceId);
console.log(JSON.stringify({ both, signalled, revoked: del.ok, kicked, presenceAfterKick: afterKick }), ok ? 'SMOKE OK' : 'SMOKE FAILED');
process.exit(ok ? 0 : 1);
