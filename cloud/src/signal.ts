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
export type RoomMsg = { type: 'presence'; online: string[] } | { type: 'removed' } | { type: 'replaced' } | { type: 'signal'; from: string; data: unknown } | { type: 'pong' } | { type: 'error'; error: string };

const MAX_MSG = 64 * 1024;

export class Signal {
  constructor(private state: State, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url), device = url.searchParams.get('device') ?? '';
    if (url.pathname === '/kick') {
      const gone = this.state.getWebSockets(device);
      for (const ws of gone) { try { ws.send(JSON.stringify({ type: 'removed' } satisfies RoomMsg)); } catch { /* closing */ } ws.close(4001, 'device removed'); }
      this.presence(...gone);
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a WebSocket', { status: 426 });
    // One connection per device: a new one replaces the old (a reload, a reconnect).
    const old = this.state.getWebSockets(device);
    for (const o of old) { try { o.send(JSON.stringify({ type: 'replaced' } satisfies RoomMsg)); } catch { /* closing */ } o.close(4000, 'replaced'); }
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.state.acceptWebSocket(server, [device]);
    server.serializeAttachment({ device });
    this.seen(device);
    this.presence(...old);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  webSocketMessage(ws: WS, raw: string | ArrayBuffer) {
    const from = (ws.deserializeAttachment() as { device: string }).device;
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return ws.send(JSON.stringify({ type: 'error', error: 'message too large' } satisfies RoomMsg));
    let m: ClientMsg;
    try { m = JSON.parse(raw) as ClientMsg; } catch { return ws.send(JSON.stringify({ type: 'error', error: 'not JSON' } satisfies RoomMsg)); }
    if (m.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' } satisfies RoomMsg));
    if (m.type === 'signal' && typeof m.to === 'string') {
      const peers = this.state.getWebSockets(m.to);
      if (!peers.length) return ws.send(JSON.stringify({ type: 'error', error: 'device offline' } satisfies RoomMsg));
      for (const p of peers) p.send(JSON.stringify({ type: 'signal', from, data: m.data } satisfies RoomMsg));
    }
  }
  webSocketClose(ws: WS) {
    const d = (ws.deserializeAttachment() as { device: string } | null)?.device;
    if (d) this.seen(d);
    this.presence(ws);
  }
  webSocketError(ws: WS) { this.webSocketClose(ws); }

  /** Everyone in the room learns who's online. */
  private presence(...leaving: WS[]) {
    const socks = this.state.getWebSockets().filter(w => !leaving.includes(w));
    const online = [...new Set(socks.map(w => (w.deserializeAttachment() as { device: string }).device))];
    const msg = JSON.stringify({ type: 'presence', online } satisfies RoomMsg);
    for (const w of socks) { try { w.send(msg); } catch { /* closing */ } }
  }
  private seen(device: string) {
    void this.env.DB.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').bind(Date.now(), device).run().catch(() => {});
  }
}
