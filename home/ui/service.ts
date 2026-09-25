/* GLUE Home's service (ADR 0044), in a hidden window: online in the account's signaling room while
   it's running, and receiving songs sent from the website into the incoming folder. Start / Stop /
   Restart come from the tray and the settings window. */
import { API, bridge, type HomeConfig, type Received, type Status } from './bridge';
import { stayOnline } from './cloud';
import { ICE_SERVERS, MAX_FILE, isHandshake, type Ctrl, type Handshake } from '../../src/core/transfer';

let cfg: HomeConfig | null = null;
let room: ReturnType<typeof stayOnline> | null = null;
let state: Status['state'] = 'stopped', text = 'Starting…';
let receiving: Status['receiving'] = null;
const peers = new Map<string, RTCPeerConnection>();   // handshake id → connection

const apiOf = (c: HomeConfig) => c.api || API;
function report(s: Status['state'], t: string) {
  state = s; text = t;
  const status: Status = { state, text, running: !!cfg?.running && s !== 'unpaired' && s !== 'removed', receiving, received: cfg?.received ?? [] };
  void bridge.status(status);
  void bridge.trayStatus(t, status.running).catch(() => {});
  const el = document.getElementById('state');
  if (el) el.textContent = t;
}

function start() {
  stop(false);
  if (!cfg?.deviceId || !cfg.token) return report('unpaired', 'Not connected to a GLUE account');
  if (!cfg.running) return report('stopped', 'Stopped');
  report('connecting', 'Connecting…');
  room = stayOnline(apiOf(cfg), cfg.deviceId, cfg.token, e => {
    if (e.type === 'online') report('online', 'Online as ' + cfg!.name + (cfg!.user?.email ? ' · ' + cfg!.user.email : ''));
    else if (e.type === 'offline') report('offline', 'Offline: ' + e.why);
    else if (e.type === 'replaced') report('stopped', 'Stopped: GLUE Home started on another computer with this account’s same device');
    else if (e.type === 'removed') void unpaired();
    else if (e.type === 'signal') void onSignal(e.from, e.data);
  });
}
function stop(say = true) {
  room?.stop(); room = null;
  for (const pc of peers.values()) pc.close();
  peers.clear();
  if (say) report(cfg?.deviceId ? 'stopped' : 'unpaired', cfg?.deviceId ? 'Stopped' : 'Not connected to a GLUE account');
}
/** Removed from the account on the website: forget the credential. */
async function unpaired() {
  stop(false);
  if (cfg) { cfg = { ...cfg, deviceId: null, token: null, user: null }; await bridge.saveConfig(cfg).catch(() => {}); }
  report('removed', 'Removed from the GLUE account: connect again in the settings');
}

// ---- receiving songs ------------------------------------------------------------------------------
async function onSignal(from: string, data: unknown) {
  if (!isHandshake(data) || !room) return;
  const say = (h: Handshake) => room?.send(from, h);
  if (data.t === 'offer') {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(data.id, pc);
    pc.onicecandidate = e => say({ app: 'glue-send', t: 'ice', id: data.id, candidate: e.candidate?.toJSON() ?? null });
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { peers.delete(data.id); pc.close(); } };
    pc.ondatachannel = ev => receive(ev.channel, from);
    await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    say({ app: 'glue-send', t: 'answer', id: data.id, sdp: answer.sdp ?? '' });
  } else if (data.t === 'ice') await peers.get(data.id)?.addIceCandidate(data.candidate ?? undefined).catch(() => {});
  else if (data.t === 'bye') { peers.get(data.id)?.close(); peers.delete(data.id); }
}

function receive(dc: RTCDataChannel, from: string) {
  dc.binaryType = 'arraybuffer';
  const reply = (c: Ctrl) => { if (dc.readyState === 'open') dc.send(JSON.stringify(c)); };
  let cur: { n: number; id: number; name: string; size: number; got: number; error: string } | null = null;
  // One step at a time, in order: a file starts, its bytes are written, it ends.
  let chain: Promise<void> = Promise.resolve();
  const fromName = () => 'another device';
  dc.onopen = () => reply({ t: 'ready', name: cfg?.name ?? 'GLUE Home' });
  dc.onmessage = e => { chain = chain.then(() => step(e.data)).catch(err => { if (cur) cur.error = (err as Error).message || String(err); }); };
  dc.onclose = () => { chain = chain.then(async () => { if (cur) { await bridge.end(cur.id, false).catch(() => {}); cur = null; receiving = null; report(state, text); } }); };

  async function step(d: string | ArrayBuffer) {
    if (typeof d !== 'string') {
      if (!cur || cur.error) return;
      cur.got += d.byteLength;
      if (cur.got > cur.size) { cur.error = 'more bytes than announced'; return; }
      await bridge.write(cur.id, new Uint8Array(d));
      if (receiving) receiving = { ...receiving, got: cur.got };
      return;
    }
    const c = JSON.parse(d) as Ctrl;
    if (c.t === 'file') {
      if (c.size > MAX_FILE) { reply({ t: 'failed', n: c.n, error: 'too large' }); return; }
      const [id, name] = await bridge.begin(c.name);
      cur = { n: c.n, id, name, size: c.size, got: 0, error: '' };
      receiving = { name, got: 0, size: c.size };
      report(state, text);
    } else if (c.t === 'end' && cur && cur.n === c.n) {
      const f = cur; cur = null; receiving = null;
      if (f.error || f.got !== f.size) {
        await bridge.end(f.id, false).catch(() => {});
        reply({ t: 'failed', n: f.n, error: f.error || 'incomplete' });
      } else {
        const path = await bridge.end(f.id, true);
        const r: Received = { name: f.name, path, from: fromName(), at: Date.now(), size: f.size };
        if (cfg) { cfg = { ...cfg, received: [r, ...(cfg.received ?? [])].slice(0, 30) }; await bridge.saveConfig(cfg).catch(() => {}); }
        reply({ t: 'saved', n: f.n, name: f.name });
      }
      report(state, text);
    }
  }
  void from;
}

// ---- wiring ---------------------------------------------------------------------------------------
async function boot() {
  cfg = await bridge.config();
  if (cfg && cfg.running === undefined) cfg = { ...cfg, running: true };
  start();
  await bridge.onControl(async what => {
    if (!cfg) return;
    const running = what !== 'stop';
    if (cfg.running !== running) { cfg = { ...cfg, running }; await bridge.saveConfig(cfg).catch(() => {}); }
    if (what === 'stop') stop(); else start();
  });
  // New settings (joined an account, another incoming folder): reconnect if the account changed.
  await bridge.onConfig(c => {
    const before = cfg;
    cfg = c;
    if (!before || before.deviceId !== c.deviceId || before.token !== c.token || before.running !== c.running || (before.api ?? '') !== (c.api ?? '')) start();
    else report(state, text);
  });
  await bridge.onAskStatus(() => report(state, text));
}
void boot();
