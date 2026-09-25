/* Live check of cloud sync (not part of CI), with a temporary user made directly in D1:
   SMOKE_API=… SMOKE_KEY=<SESSION_KEY> node cloud/smoke-sync.ts   (user smoke-u1, devices smoke-b1 / smoke-d1) */
import { signAccess } from './src/crypto.ts';

const API = process.env.SMOKE_API ?? 'http://127.0.0.1:8787', KEY = process.env.SMOKE_KEY ?? 'local-dev-session-key-not-secret-0123456789';
const tok = (dev: string) => signAccess({ sub: 'smoke-u1', dev }, KEY, Date.now());
const [laptop, desk] = [await tok('smoke-b1'), await tok('smoke-d1')];
const call = async (t: string, method: string, path: string, body?: unknown, text?: string) => {
  const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + t, ...(body ? { 'Content-Type': 'application/json' } : text ? { 'Content-Type': 'text/plain' } : {}) }, body: body ? JSON.stringify(body) : text });
  const s = await r.text();
  if (!r.ok) throw new Error(method + ' ' + path + ' → ' + r.status + ' ' + s);
  try { return JSON.parse(s); } catch { return s; }
};
const h = 'a'.repeat(64), big = 'QUFB'.repeat(250_000);   // 1 MB of base64
const checks: Record<string, boolean> = {};
const m = await call(laptop, 'POST', '/v1/sync/manifest', { profile: { id: 'sp1', name: 'Smoke' }, stats: { collections: [{ id: 'sc1', name: 'Smoke collection', tracks: 1 }] }, files: [{ path: 'profile.json', hash: h, size: 3 }, { path: 'collections/sc1/tracks/aa.json', hash: 'b'.repeat(64), size: 3 }] });
checks.manifest = m.need.length === 2;
await call(laptop, 'PUT', '/v1/sync/file?profile=sp1&path=profile.json&hash=' + h + '&size=3', undefined, 'H4sI');
await call(laptop, 'PUT', '/v1/sync/file?profile=sp1&path=' + encodeURIComponent('collections/sc1/tracks/aa.json') + '&hash=' + 'b'.repeat(64) + '&size=3', undefined, big);
const l = await call(desk, 'GET', '/v1/sync');
checks.listedFromOtherDevice = l.profiles.length === 1 && l.profiles[0].complete === true;
checks.bigFileRoundTrip = (await call(desk, 'GET', '/v1/sync/smoke-b1/sp1/file?path=' + encodeURIComponent('collections/sc1/tracks/aa.json'))).length === big.length;
await call(desk, 'POST', '/v1/sync/ops', { ops: [{ device: 'smoke-b1', profile: 'sp1', collection: 'sc1', op: { t: 'track', id: 'x', rating: 5 } }] });
const ops = await call(laptop, 'GET', '/v1/sync/ops?profile=sp1');
checks.opsQueued = ops.ops.length === 1;
await call(laptop, 'POST', '/v1/sync/ops/ack', { profile: 'sp1', upTo: ops.ops[0].seq });
checks.opsAcked = (await call(laptop, 'GET', '/v1/sync/ops?profile=sp1')).ops.length === 0;
const g = await call(desk, 'POST', '/v1/sync/links', { name: 'Smoke merged', members: [{ device: 'smoke-b1', profile: 'sp1', collection: 'sc1' }, { device: 'smoke-d1', profile: 'sp2', collection: 'sc2' }] });
checks.linked = (await call(laptop, 'GET', '/v1/sync/links')).groups[0]?.id === g.group;
await call(laptop, 'DELETE', '/v1/sync');
checks.cleaned = (await call(desk, 'GET', '/v1/sync')).profiles.length === 0 && (await call(desk, 'GET', '/v1/sync/links')).groups.length === 0;
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify(checks), ok ? 'SYNC SMOKE OK' : 'SYNC SMOKE FAILED');
process.exit(ok ? 0 : 1);
