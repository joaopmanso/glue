/* One signaling room per user (a Durable Object, ADR 0036/0037): the user's devices connect by
   WebSocket, see who's online, and pass WebRTC offers / answers / candidates to each other. The room
   relays; it never sees audio or library data. Uses the WebSocket hibernation API, so an idle room
   costs nothing. */

interface WS { send(m: string): void; close(code?: number, reason?: string): void; serializeAttachment(v: unknown): void; deserializeAttachment(): unknown }
interface State { acceptWebSocket(ws: WS, tags?: string[]): void; getWebSockets(tag?: string): WS[] }
interface Env { DB: { prepare(sql: string): { bind(...v: unknown[]): { run(): Promise<unknown> } } } }
declare const WebSocketPair: { new(): { 0: WS; 1: WS } };

/** What devices may send. `data` is opaque to the room (SDP, ICE candidates, signed by the sender). */
export type ClientMsg = { type: 'signal'; to: string; data: unknown } | { type: 'ping' };
/** `removed` / `replaced` come just before the room closes a socket, so clients act on them even
    when a close code doesn't reach them (seen with local workerd). */
export type RoomMsg = { type: 'shared'; collection: string; seq: number; from: string } | { type: 'presence'; online: string[] } | { type: 'removed' } | { type: 'replaced' } | { type: 'signal'; from: string; data: unknown } | { type: 'pong' } | { type: 'error'; error: string };

const MAX_MSG = 64 * 1024;
/** Every device pings every 30 s (a background tab's timers, slowed to once a minute, too). A socket silent this long
    died without closing (a computer asleep, a network gone, 2026-10-13: its GLUE Home stayed "online" and every offer
    to it went nowhere): it's let go, and everyone hears it's offline. */
export const STALE = 150_000;
/** `closing`: told to close. The runtime keeps such a socket in its list until the other end answers or its connection
    dies, which from a laptop asleep can be a long time, and sending to it throws (2026-11-03: that stopped every answer
    to the device's new socket, while its offers still arrived). It counts for nothing from then on: see `live`. */
type Att = { device: string; conn?: string; heard?: number; closing?: boolean };

export class Signal {
  constructor(private state: State, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url), device = url.searchParams.get('device') ?? '';
    // A shared collection moved on (ADR 0094): every connected device hears of it.
    if (url.pathname === '/broadcast') {
      const msg = await req.text();
      for (const ws of this.state.getWebSockets()) { try { ws.send(msg); } catch { /* closing */ } }
      return new Response('ok');
    }
    if (url.pathname === '/kick') {
      const gone = this.live(device);
      for (const ws of gone) { try { ws.send(JSON.stringify({ type: 'removed' } satisfies RoomMsg)); } catch { /* closing */ } this.letGo(ws, 4001, 'device removed'); }
      this.presence(...gone);
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a WebSocket', { status: 426 });
    // One connection per device and tab: a new one replaces the old (a reload, a reconnect). The browsers of
    // one computer share its device (ADR 0091), so each tab says which it is (`conn`); without, as before.
    const conn = url.searchParams.get('conn') ?? '';
    const old = this.live(device).filter(w => ((w.deserializeAttachment() as { conn?: string } | null)?.conn ?? '') === conn);
    for (const o of old) { try { o.send(JSON.stringify({ type: 'replaced' } satisfies RoomMsg)); } catch { /* closing */ } this.letGo(o, 4000, 'replaced'); }
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.state.acceptWebSocket(server, [device]);
    server.serializeAttachment({ device, conn, heard: Date.now() } satisfies Att);
    this.seen(device);
    this.presence(...old);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  webSocketMessage(ws: WS, raw: string | ArrayBuffer) {
    const att = ws.deserializeAttachment() as Att, from = att.device;
    if (att.closing) return;   // said before it heard it was let go
    ws.serializeAttachment({ ...att, heard: Date.now() } satisfies Att);
    this.prune();
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return ws.send(JSON.stringify({ type: 'error', error: 'message too large' } satisfies RoomMsg));
    let m: ClientMsg;
    try { m = JSON.parse(raw) as ClientMsg; } catch { return ws.send(JSON.stringify({ type: 'error', error: 'not JSON' } satisfies RoomMsg)); }
    if (m.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' } satisfies RoomMsg));
    if (m.type === 'signal' && typeof m.to === 'string') {
      // Each on its own: one that can't take it (closing from its end) doesn't cost the others theirs.
      let heard = 0;
      for (const p of this.live(m.to)) { try { p.send(JSON.stringify({ type: 'signal', from, data: m.data } satisfies RoomMsg)); heard++; } catch { /* closing */ } }
      if (!heard) return ws.send(JSON.stringify({ type: 'error', error: 'device offline' } satisfies RoomMsg));
    }
  }
  webSocketClose(ws: WS) {
    const d = (ws.deserializeAttachment() as { device: string } | null)?.device;
    if (d) this.seen(d);
    this.presence(ws);
  }
  webSocketError(ws: WS) { this.webSocketClose(ws); }

  /** The sockets that count: not those told to close and not answering yet (`Att`). */
  private live(tag?: string) { return this.state.getWebSockets(tag).filter(w => !(w.deserializeAttachment() as Att | null)?.closing); }
  private letGo(w: WS, code: number, reason: string) {
    w.serializeAttachment({ ...(w.deserializeAttachment() as Att), closing: true } satisfies Att);
    try { w.close(code, reason); } catch { /* closing */ }
  }
  /** The sockets gone silent (`STALE`) let go; the rest told. */
  private prune() {
    const now = Date.now(), gone = this.live().filter(w => now - ((w.deserializeAttachment() as Att | null)?.heard ?? now) > STALE);
    if (!gone.length) return;
    for (const w of gone) this.letGo(w, 1011, 'silent');
    this.presence();
  }
  /** Everyone in the room learns who's online. */
  private presence(...leaving: WS[]) {
    const socks = this.live().filter(w => !leaving.includes(w));
    const online = [...new Set(socks.map(w => (w.deserializeAttachment() as { device: string }).device))];
    const msg = JSON.stringify({ type: 'presence', online } satisfies RoomMsg);
    for (const w of socks) { try { w.send(msg); } catch { /* closing */ } }
  }
  private seen(device: string) {
    void this.env.DB.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').bind(Date.now(), device).run().catch(() => {});
  }
}
