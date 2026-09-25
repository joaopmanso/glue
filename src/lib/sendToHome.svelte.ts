/* Send songs from this browser to a GLUE Home's incoming folder (ADR 0044): a WebRTC data channel,
   set up through the account's signaling room; the files go directly between the two computers. */
import { account } from './account.svelte';
import { CHUNK, HIGH_WATER, ICE_SERVERS, isHandshake, type Ctrl, type Handshake } from '../core/transfer';

export interface Sending { home: string; homeName: string; files: { name: string; size: number; sent: number; state: 'waiting' | 'sending' | 'saved' | 'failed'; note: string }[]; phase: 'connecting' | 'sending' | 'done' | 'failed'; error: string }

const CONNECT_TIMEOUT = 20_000;

class SendToHome {
  /** The transfer on screen (one at a time). */
  now = $state<Sending | null>(null);

  async send(home: string, files: File[]) {
    if (!files.length) return;
    if (this.now && (this.now.phase === 'connecting' || this.now.phase === 'sending')) throw new Error('Wait for the songs being sent to finish.');
    const homeName = account.devices.find(d => d.id === home)?.name ?? 'GLUE Home';
    const st: Sending = { home, homeName, files: files.map(f => ({ name: f.name, size: f.size, sent: 0, state: 'waiting', note: '' })), phase: 'connecting', error: '' };
    this.now = st;
    const set = (patch: Partial<Sending>) => { Object.assign(st, patch); this.now = { ...st, files: [...st.files] }; };
    const setFile = (i: number, patch: Partial<Sending['files'][number]>) => { st.files[i] = { ...st.files[i], ...patch }; this.now = { ...st, files: [...st.files] }; };
    if (!account.online.has(home)) { set({ phase: 'failed', error: homeName + ' is offline: start GLUE Home on that computer.' }); return; }

    const id = crypto.randomUUID();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const say = (h: Handshake) => { if (!account.signal(home, h)) throw new Error('Not connected to GLUE Cloud.'); };
    const off = account.onSignal((from, data) => {
      if (from !== home || !isHandshake(data) || data.id !== id) return;
      if (data.t === 'answer') void pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }).catch(e => fail((e as Error).message));
      else if (data.t === 'ice') void pc.addIceCandidate(data.candidate ?? undefined).catch(() => {});
      else if (data.t === 'bye') fail(data.reason || homeName + ' said no.');
    });
    let finished = false;
    const done = () => { if (finished) return; finished = true; off(); clearTimeout(timer); try { dc.close(); } catch { /* closed */ } pc.close(); };
    const fail = (why: string) => {
      if (finished) return;
      for (let i = 0; i < st.files.length; i++) if (st.files[i].state === 'waiting' || st.files[i].state === 'sending') setFile(i, { state: 'failed' });
      set({ phase: 'failed', error: why }); done();
    };
    const timer = setTimeout(() => fail('Couldn’t connect to ' + homeName + '. Both computers need to reach each other directly for now (a relay comes later).'), CONNECT_TIMEOUT);
    pc.onicecandidate = e => { try { say({ app: 'glue-send', t: 'ice', id, candidate: e.candidate?.toJSON() ?? null }); } catch { /* closing */ } };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') fail('The connection to ' + homeName + ' dropped.'); };

    const dc = pc.createDataChannel('files', { ordered: true });
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = HIGH_WATER / 4;
    const replies = new Map<number, (c: Ctrl) => void>();
    let ready: (() => void) | null = null;
    dc.onmessage = e => {
      if (typeof e.data !== 'string') return;
      let c: Ctrl; try { c = JSON.parse(e.data) as Ctrl; } catch { return; }
      if (c.t === 'ready') ready?.();
      else if (c.t === 'saved' || c.t === 'failed') replies.get(c.n)?.(c);
    };
    const drained = () => new Promise<void>(res => { if (dc.bufferedAmount <= HIGH_WATER) return res(); const f = () => { dc.removeEventListener('bufferedamountlow', f); res(); }; dc.addEventListener('bufferedamountlow', f); });

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      say({ app: 'glue-send', t: 'offer', id, sdp: offer.sdp ?? '' });
      await new Promise<void>((res, rej) => { ready = res; dc.onclose = () => rej(new Error('closed')); });
      clearTimeout(timer);
      set({ phase: 'sending' });
      for (let n = 0; n < files.length; n++) {
        const f = files[n];
        setFile(n, { state: 'sending' });
        const reply = new Promise<Ctrl>(res => replies.set(n, res));
        dc.send(JSON.stringify({ t: 'file', n, name: f.name, size: f.size } satisfies Ctrl));
        let sent = 0;
        for (let at = 0; at < f.size; at += CHUNK * 16) {
          const block = new Uint8Array(await f.slice(at, Math.min(f.size, at + CHUNK * 16)).arrayBuffer());
          for (let i = 0; i < block.length; i += CHUNK) {
            await drained();
            dc.send(block.subarray(i, Math.min(block.length, i + CHUNK)));
          }
          sent += block.length;
          setFile(n, { sent });
        }
        dc.send(JSON.stringify({ t: 'end', n } satisfies Ctrl));
        const r = await reply;
        if (r.t === 'saved') setFile(n, { state: 'saved', sent: f.size, note: r.name !== f.name ? 'saved as ' + r.name : '' });
        else if (r.t === 'failed') setFile(n, { state: 'failed', note: r.error });
      }
      set({ phase: st.files.every(x => x.state === 'saved') ? 'done' : 'failed', error: st.files.some(x => x.state === 'failed') ? 'Some songs couldn’t be saved.' : '' });
      done();
      void import('./incoming.svelte').then(m => m.incoming.refresh());
    } catch (e) { fail(finished ? '' : ((e as Error).message === 'closed' ? homeName + ' closed the connection.' : (e as Error).message)); }
  }
  dismiss() { if (this.now && this.now.phase !== 'connecting' && this.now.phase !== 'sending') this.now = null; }
}

export const sendToHome = new SendToHome();
