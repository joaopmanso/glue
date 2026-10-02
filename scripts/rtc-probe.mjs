// GLUE Home's native connections (crates/glue-rtc, ADR 0150) against a real browser: Edge opens a "stream" and a
// "files" channel as the website does, through crates/glue-rtc/examples/probe.rs, and checks each answer.
//   cargo build --release --example probe --manifest-path crates/glue-rtc/Cargo.toml && node scripts/rtc-probe.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = process.argv[2] ?? 'crates/glue-rtc/target/release/examples/probe' + (process.platform === 'win32' ? '.exe' : '');
const dir = mkdtempSync(join(tmpdir(), 'glue-rtc-probe-'));
const song = join(dir, 'song.flac'), MB = 50;
writeFileSync(song, Buffer.from(Array.from({ length: MB * 1e6 }, (_, i) => (i * 7) % 256)));
const sha = b => createHash('sha256').update(b).digest('hex');
const child = spawn(exe, [dir, song], { stdio: ['pipe', 'pipe', 'inherit'] });
const out = createInterface({ input: child.stdout });
const waiting = [];
let page;
out.on('line', l => {
  const m = JSON.parse(l);
  if (m.event === 'rtc-ice') void page?.evaluate(c => window.pc.addIceCandidate(c ?? undefined).catch(() => {}), m.payload.candidate);
  else if (m.answer || m.error) waiting.shift()?.(m);
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
const check = (what, ok, more = '') => { results.push(ok); console.log((ok ? 'ok  ' : 'FAIL') + ' ' + what + (more ? ' · ' + more : '')); };
try {
  page = await browser.newPage();
  // A secure page (crypto.subtle), served by the test.
  await page.route('https://probe.glue/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title>' }));
  await page.goto('https://probe.glue/');
  await page.exposeFunction('toProbe', m => child.stdin.write(JSON.stringify(m) + '\n'));
  const offer = await page.evaluate(async () => {
    const pc = window.pc = new RTCPeerConnection();
    pc.onicecandidate = e => window.toProbe({ ice: e.candidate?.toJSON() ?? null });
    const s = window.stream = pc.createDataChannel('stream'), f = window.files = pc.createDataChannel('files');
    s.binaryType = f.binaryType = 'arraybuffer';
    // Every message, in order, for the checks to read.
    for (const [k, ch] of [['s', s], ['f', f]]) { window[k + 'got'] = []; ch.onmessage = e => window[k + 'got'].push(typeof e.data === 'string' ? JSON.parse(e.data) : new Uint8Array(e.data)); }
    await pc.setLocalDescription(await pc.createOffer());
    return pc.localDescription.sdp;
  });
  const answer = await new Promise(r => { waiting.push(r); child.stdin.write(JSON.stringify({ offer }) + '\n'); });
  if (answer.error) throw new Error(answer.error);
  await page.evaluate(async sdp => {
    await window.pc.setRemoteDescription({ type: 'answer', sdp });
    const open = ch => new Promise((res, rej) => { if (ch.readyState === 'open') res(); ch.onopen = res; setTimeout(() => rej(new Error('not open: ' + window.pc.connectionState)), 15000); });
    await open(window.stream); await open(window.files);
  }, answer.answer);
  // The helpers, in the page: wait for a text message of request n (or matching), collect its frames.
  await page.evaluate(() => {
    window.until = (k, f, ms = 30000) => new Promise((res, rej) => { const t0 = Date.now(); const look = () => { const i = window[k + 'got'].findIndex(m => !(m instanceof Uint8Array) && f(m)); if (i >= 0) return res(window[k + 'got'].splice(i, 1)[0]); if (Date.now() - t0 > ms) return rej(new Error('nothing for ' + k)); setTimeout(look, 5); }; look(); });
    window.frames = n => { const out = []; window.sgot = window.sgot.filter(m => { if (m instanceof Uint8Array && new DataView(m.buffer, m.byteOffset).getUint32(0, true) === n) { out.push(m.subarray(4)); return false; } return true; }); return out; };
    window.ask = async (req) => { window.stream.send(JSON.stringify(req)); const meta = await window.until('s', m => m.n === req.n && m.t !== 'eof'); if (meta.t === 'error') return { meta }; const eof = await window.until('s', m => m.n === req.n && m.t === 'eof'); const fr = window.frames(req.n); const all = new Uint8Array(fr.reduce((a, b) => a + b.length, 0)); let at = 0; for (const b of fr) { all.set(b, at); at += b.length; } return { meta, eof, bytes: Array.from(all.subarray(0, 64)), size: all.length, sizes: fr.map(b => b.length + 4), all }; };
  });
  const hello = await page.evaluate(() => window.until('s', m => m.t === 'session'));
  check('the session says hello', hello.version === '0.49.0' && hello.max === 5);
  const pong = await page.evaluate(() => window.ask({ t: 'ping', n: 1 }).then(r => r.meta.data));
  check('a ping is answered', pong === 'pong');
  // Part of the song.
  const r = await page.evaluate(async () => { const r = await window.ask({ t: 'range', n: 2, start: 1000, len: 3000000, profile: 'p', collection: 'c', track: 'ab01' }); const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', r.all)), b => b.toString(16).padStart(2, '0')).join(''); return { meta: r.meta, size: r.size, max: Math.max(...r.sizes), h }; });
  const want = readFileSync(song).subarray(1000, 3001000);
  check('a part of a song', r.meta.data.total === MB * 1e6 && r.size === 3e6 && r.h === sha(want), `${r.size} bytes, frames up to ${r.max}`);
  // Uploads in 64 KB frames (65,540 bytes with their number): the server takes messages that big.
  const put = await page.evaluate(async () => {
    const frame = (n, b) => { const o = new Uint8Array(4 + b.length); new DataView(o.buffer).setUint32(0, n, true); o.set(b, 4); return o; };
    window.stream.send(JSON.stringify({ t: 'put', n: 3, kind: 'details', profile: 'p', collection: 'c', track: 'ab01', size: 200000, header: { v: 2 } }));
    const bin = new Uint8Array(200000).map((_, i) => i % 199);
    for (let i = 0; i < bin.length; i += 65536) window.stream.send(frame(3, bin.subarray(i, i + 65536)));
    window.stream.send(JSON.stringify({ t: 'end', n: 3 }));
    const m = await window.until('s', m => m.n === 3); await window.until('s', m => m.n === 3 && m.t === 'eof').catch(() => null);
    return m.t;
  });
  const kept = join(dir, 'cache', 'd', 'p', 'c', 'ab', 'ab01.bin');
  check('an upload in 64 KB frames is kept', put === 'meta' && existsSync(kept) && readFileSync(kept).length === 200000);
  // A song sent to this computer.
  const ready = await page.evaluate(() => window.until('f', m => m.t === 'ready'));
  const sent = await page.evaluate(async () => {
    const f = window.files, b = new Uint8Array(3_000_000).map((_, i) => (i * 3) % 251);
    f.send(JSON.stringify({ t: 'file', n: 1, name: 'sent.mp3', size: b.length }));
    f.bufferedAmountLowThreshold = 1 << 20;
    for (let i = 0; i < b.length; i += 65536) { if (f.bufferedAmount > 4 << 20) await new Promise(r => f.addEventListener('bufferedamountlow', r, { once: true })); f.send(b.subarray(i, i + 65536)); }
    f.send(JSON.stringify({ t: 'end', n: 1 }));
    return window.until('f', m => m.n === 1);
  });
  const got = join(dir, 'incoming', 'sent.mp3');
  check('a song sent here is saved', ready.name === 'Probe' && sent.t === 'saved' && existsSync(got) && sha(readFileSync(got)) === sha(Buffer.from(Array.from({ length: 3e6 }, (_, i) => (i * 3) % 251))));
  // How fast: the whole song.
  const t = await page.evaluate(async () => { const t0 = performance.now(); window.stream.send(JSON.stringify({ t: 'get', n: 4, profile: 'p', collection: 'c', track: 'ab01' })); const meta = await window.until('s', m => m.n === 4); let got = 0; await new Promise(res => { const tick = () => { window.sgot = window.sgot.filter(m => { if (m instanceof Uint8Array) { got += m.length - 4; return false; } return true; }); if (window.sgot.some(m => m.n === 4 && m.t === 'eof')) res(); else setTimeout(tick, 2); }; tick(); }); return { size: meta.size, got, ms: performance.now() - t0 }; });
  check('a whole song', t.got === MB * 1e6, `${(t.got / 1e6 / (t.ms / 1000)).toFixed(1)} MB/s`);
} finally {
  await browser.close(); child.kill(); rmSync(dir, { recursive: true, force: true });
}
process.exit(results.every(Boolean) ? 0 : 1);
