/* The tests' stand-in for GLUE Home's own connections (crates/glue-rtc, home/src-tauri/src/rtc.rs, ADR 0150): the same
   commands and events, done with the browser's RTCPeerConnection in the mocked service page. crates/glue-rtc holds
   the Rust to the same protocol (tests/protocol.rs, and scripts/rtc-probe.mjs against Edge). Requests are answered by
   the test's real engine (`answer`, crates/glue-engine/src/answers.rs, ADR 0156), as rtc.rs has them answered. Loaded
   by e2e/tauri-mock.ts; never part of GLUE Home itself. */
import { CHUNK, HIGH_WATER, MAX_FILE, frame, unframe } from '../src/core/transfer';

/** What the mock gives it: its events, cache, "disk" and incoming folder. */
export interface MockHome {
  emit: (name: string, payload: unknown) => void;
  cacheGet: (key: string) => Uint8Array | null;
  cachePut: (key: string, b: Uint8Array) => void;
  /** A file to send: the page's stand-in disk, else the test GLUE Home's folders. */
  song: (path: string) => Promise<number[] | undefined>;
  /** GLUE Home's engine's answer to a request (glue_engine::command `answer`). */
  answer: (req: Record<string, unknown>) => Promise<{ data?: unknown; bytes?: string; tell?: unknown; file?: { path: string; range: [number, number] | null; name: string; type: string } }>;
  incomingBegin: (name: string) => [number, string];
  incomingWrite: (id: number, b: Uint8Array) => void;
  incomingEnd: (id: number, ok: boolean) => string;
}

const WAVE_BYTES = 192 * 4;
const shard = (id: string) => id.slice(0, 2);
const safe = (s: unknown) => typeof s === 'string' && !!s && !/[\\/]/.test(s) && s !== '.' && s !== '..';

/** Where a `put` goes (as crates/glue-rtc `put_keys`). */
function putKeys(r: Record<string, unknown>, b: Uint8Array): [string, Uint8Array][] {
  const song = (dir: string, ext: string) => { if (![r.profile, r.collection, r.track].every(safe)) throw new Error('bad song'); return `${dir}/${r.profile}/${r.collection}/${shard(r.track as string)}/${r.track}.${ext}`; };
  if (r.kind === 'thumb') return [[song('t', 'bin'), b]];
  if (r.kind === 'wave') return b.length === WAVE_BYTES ? [[song('w', 'bin'), b]] : [];
  if (r.kind === 'art') return /^[0-9a-f]{8,64}$/.test(String(r.hash)) && (r.px === 64 || r.px === 320) ? [[`a/${r.hash}-${r.px}.jpg`, b]] : [];
  return [[song('d', 'bin'), b], [song('d', 'json'), new TextEncoder().encode(JSON.stringify(r.header ?? null))]];
}

interface Conn { pc: RTCPeerConnection; chans: Map<number, RTCDataChannel>; session: number | null; calls: number; last: number; told: number }

export function rtc(home: MockHome) {
  const conns = new Map<string, Conn>();
  let nextChan = 1;
  const drained = (dc: RTCDataChannel) => new Promise<void>(res => { if (dc.bufferedAmount <= HIGH_WATER) return res(); const f = () => { dc.removeEventListener('bufferedamountlow', f); res(); }; dc.addEventListener('bufferedamountlow', f); });
  const text = (dc: RTCDataChannel, v: unknown) => { if (dc.readyState === 'open') dc.send(JSON.stringify(v)); };
  const bytes = async (dc: RTCDataChannel, n: number, b: Uint8Array) => { for (let i = 0; i < b.length; i += CHUNK) { await drained(dc); if (dc.readyState !== 'open') return; dc.send(frame(n, b.subarray(i, Math.min(b.length, i + CHUNK)))); } };
  const chan = (id: string, ch: number) => { const dc = conns.get(id)?.chans.get(ch); if (!dc) throw new Error('that connection has closed'); return dc; };
  const reply = async (id: string, ch: number, n: number, data: unknown, b: Uint8Array, extra: Record<string, unknown> = {}) => {
    const dc = chan(id, ch);
    text(dc, { t: 'meta', n, size: b.length, data: data ?? null, ...extra });
    await bytes(dc, n, b);
    text(dc, { t: 'eof', n, ...(extra.type !== undefined ? { type: extra.type } : {}) });
  };
  const activity = (id: string, counted: boolean) => {
    const c = conns.get(id); if (!c) return;
    c.last = Date.now(); if (counted) c.calls++;
    if (c.last - c.told >= 2000) { c.told = c.last; home.emit('rtc-activity', { id, calls: c.calls, last: c.last }); }
  };

  function serve(id: string, dc: RTCDataChannel, hello: { version: string; max: number }) {
    const ch = nextChan++, c = conns.get(id);
    if (!c) return;
    c.chans.set(ch, dc); c.session ??= ch;
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = HIGH_WATER / 4;
    const hi = () => text(dc, { t: 'session', version: hello.version, max: hello.max });
    if (dc.readyState === 'open') hi(); else dc.addEventListener('open', hi, { once: true });
    const uploads = new Map<number, { req: Record<string, unknown>; parts: Uint8Array[] }>();
    dc.onclose = () => { c.chans.delete(ch); if (c.session === ch) c.session = null; };
    dc.onmessage = e => {
      if (typeof e.data !== 'string') { activity(id, false); const f = unframe(e.data as ArrayBuffer); uploads.get(f.n)?.parts.push(f.data.slice()); return; }
      const req = JSON.parse(e.data) as Record<string, unknown> & { t: string; n: number };
      if (req.t === 'ping') { activity(id, false); void reply(id, ch, req.n, 'pong', new Uint8Array(0)); return; }
      activity(id, true);
      if (req.t === 'put') { uploads.set(req.n, { req, parts: [] }); return; }
      if (req.t === 'end') {
        const u = uploads.get(req.n); uploads.delete(req.n);
        if (!u) return;
        const all = new Uint8Array(u.parts.reduce((a, p) => a + p.length, 0)); let at = 0;
        for (const p of u.parts) { all.set(p, at); at += p.length; }
        const t0 = performance.now();
        try { for (const [k, b] of putKeys(u.req, all)) home.cachePut(k, b); void reply(id, ch, req.n, null, new Uint8Array(0)); }
        catch (err) { text(dc, { t: 'error', n: req.n, error: (err as Error).message }); }
        home.emit('rtc-served', { what: 'put ' + (u.req.kind ?? 'details'), ms: performance.now() - t0, bytes: 0 });
        return;
      }
      if (req.t === 'cache') {
        const t0 = performance.now(), found: [string, number][] = [], parts: Uint8Array[] = [];
        for (const k of (req.keys as string[]).slice(0, 200)) { const b = home.cacheGet(k); found.push([k, b?.length ?? 0]); if (b) parts.push(b); }
        const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0;
        for (const p of parts) { all.set(p, at); at += p.length; }
        void reply(id, ch, req.n, found, all);
        home.emit('rtc-served', { what: 'cache', ms: performance.now() - t0, bytes: all.length });
        return;
      }
      // The library's answer, from GLUE Home's engine (ADR 0156); counted for the settings (`rtc-served`).
      const t0 = performance.now();
      void (async () => {
        let sent = 0;
        try {
          const a = await home.answer(req);
          if (a.file) sent = await sendFile(id, ch, req.n, a.file);
          else {
            const b = Uint8Array.from(atob(a.bytes ?? ''), c => c.charCodeAt(0));
            await reply(id, ch, req.n, a.data ?? null, b);
            sent = b.length;
            if (a.tell) tell(a.tell);
          }
        } catch (err) { text(dc, { t: 'error', n: req.n, error: String((err as Error)?.message ?? err) }); }
        home.emit('rtc-served', { what: req.t, ms: performance.now() - t0, bytes: sent });
      })();
    };
  }

  function receive(dc: RTCDataChannel, hello: { name: string }) {
    dc.binaryType = 'arraybuffer';
    const ready = () => text(dc, { t: 'ready', name: hello.name });
    if (dc.readyState === 'open') ready(); else dc.addEventListener('open', ready, { once: true });
    let cur: { n: number; id: number; name: string; size: number; got: number; told: number; error: string } | null = null;
    dc.onmessage = e => {
      if (typeof e.data !== 'string') {
        if (!cur || cur.error) return;
        cur.got += (e.data as ArrayBuffer).byteLength;
        if (cur.got > cur.size) { cur.error = 'more bytes than announced'; return; }
        home.incomingWrite(cur.id, new Uint8Array(e.data as ArrayBuffer));
        // Every MB, as crates/glue-rtc says it.
        if (cur.got - cur.told >= 1 << 20) { cur.told = cur.got; home.emit('rtc-receiving', { name: cur.name, got: cur.got, size: cur.size }); }
        return;
      }
      const m = JSON.parse(e.data) as { t: string; n: number; name?: string; size?: number };
      if (m.t === 'file') {
        if ((m.size ?? 0) > MAX_FILE) { text(dc, { t: 'failed', n: m.n, error: 'too large' }); return; }
        const [id, name] = home.incomingBegin(m.name ?? 'song');
        cur = { n: m.n, id, name, size: m.size ?? 0, got: 0, told: 0, error: '' };
        home.emit('rtc-receiving', { name, got: 0, size: cur.size });
      } else if (m.t === 'end' && cur && cur.n === m.n) {
        const f = cur; cur = null;
        home.emit('rtc-receiving', null);
        if (f.error || f.got !== f.size) { home.incomingEnd(f.id, false); text(dc, { t: 'failed', n: f.n, error: f.error || 'incomplete' }); }
        else { const path = home.incomingEnd(f.id, true); text(dc, { t: 'saved', n: f.n, name: f.name }); home.emit('rtc-received', { name: f.name, path, size: f.size }); }
      }
    };
    dc.onclose = () => { if (cur) { home.incomingEnd(cur.id, false); cur = null; home.emit('rtc-receiving', null); } };
  }

  return {
    async answer(id: string, sdp: string, servers: RTCIceServer[], hello: { version: string; max: number; name: string }) {
      conns.get(id)?.pc.close();
      const pc = new RTCPeerConnection({ iceServers: servers });
      conns.set(id, { pc, chans: new Map(), session: null, calls: 0, last: Date.now(), told: 0 });
      pc.onicecandidate = e => home.emit('rtc-ice', { id, candidate: e.candidate?.toJSON() ?? null });
      pc.onconnectionstatechange = () => home.emit('rtc-state', { id, state: pc.connectionState });
      pc.ondatachannel = e => e.channel.label === 'stream' ? serve(id, e.channel, hello) : receive(e.channel, hello);
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const a = await pc.createAnswer();
      await pc.setLocalDescription(a);
      return a.sdp ?? '';
    },
    async ice(id: string, candidate: RTCIceCandidateInit | null) { if (candidate) await conns.get(id)?.pc.addIceCandidate(candidate); },
    close(id: string) { conns.get(id)?.pc.close(); conns.delete(id); },
    reply,
    sendFile,
    error(id: string, ch: number, n: number, error: string) { text(chan(id, ch), { t: 'error', n, error }); },
    tell,
  };
  async function sendFile(id: string, ch: number, n: number, s: { path: string; range: [number, number] | null; name: string; type: string }) {
      const dc = chan(id, ch), all = await home.song(s.path);
      if (!all) throw new Error('not found');
      const total = all.length;
      const [start, len] = s.range ? [Math.min(s.range[0], total), 0] : [0, total];
      const n2 = s.range ? Math.min(s.range[1], 8 * 1024 * 1024, total - start) : len;
      text(dc, s.range ? { t: 'meta', n, size: n2, data: { total, type: s.type }, name: s.name } : { t: 'meta', n, size: total, data: null, name: s.name, type: s.type });
      await bytes(dc, n, new Uint8Array(all.slice(start, start + n2)));
      text(dc, s.range ? { t: 'eof', n } : { t: 'eof', n, type: s.type });
      return n2;
  }
  function tell(msg: unknown) { for (const c of conns.values()) { const dc = c.session != null ? c.chans.get(c.session) : undefined; if (dc) text(dc, msg); } }
}
