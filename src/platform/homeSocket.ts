/* The socket to this computer's GLUE Home for the website's background loads (ADR 0139): the rows' spectrograms and
   waveforms, a song's details, the analyses' results. Thousands, loaded and dropped as the list scrolls: over HTTP they
   took the browser's 6 connections to 127.0.0.1 and a song clicked waited behind them (2026-10-01). Here they share
   one connection, as many at once as wanted, each numbered; one not wanted any more is cancelled. HTTP stays for
   playing and the rest. GLUE Home 0.42 and later (`wsPort` in its link); before, the caller uses HTTP. */

type Waiting = { done: (b: Uint8Array | null) => void };

export class HomeSocket {
  private ws: WebSocket | null = null;
  private opening: Promise<WebSocket | null> | null = null;
  private seq = 1;
  private waiting = new Map<number, Waiting>();
  private failedAt = 0;
  /** `url`: the socket's address with the token, or null when there's none (no link, or an older GLUE Home). */
  constructor(private url: () => string | null) {}

  /** One of GLUE Home's cache files: its bytes, null (not there), or undefined (no socket: use HTTP). */
  async cache(key: string, signal?: AbortSignal): Promise<Uint8Array | null | undefined> {
    const ws = await this.open();
    if (!ws) return undefined;
    if (signal?.aborted) return null;
    const n = this.seq++;
    return new Promise<Uint8Array | null>(done => {
      this.waiting.set(n, { done });
      ws.send(JSON.stringify({ n, op: 'cache', key }));
      signal?.addEventListener('abort', () => {
        if (!this.waiting.delete(n)) return;
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ n, op: 'cancel' }));
        done(null);
      }, { once: true });
    });
  }

  /** Requests waiting for an answer (for tests and the perf panel). */
  get pending() { return this.waiting.size; }

  close() { this.ws?.close(); this.ws = null; this.opening = null; }

  private open(): Promise<WebSocket | null> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve(this.ws);
    // Not again for a few seconds after it couldn't open (HTTP meanwhile).
    if (Date.now() - this.failedAt < 5_000) return Promise.resolve(null);
    return (this.opening ??= new Promise<WebSocket | null>(resolve => {
      const url = this.url();
      if (!url) { this.opening = null; return resolve(null); }
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { this.failedAt = Date.now(); this.opening = null; return resolve(null); }
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { this.ws = ws; this.opening = null; resolve(ws); };
      ws.onmessage = e => {
        if (!(e.data instanceof ArrayBuffer) || e.data.byteLength < 5) return;
        const v = new DataView(e.data), n = v.getUint32(0), w = this.waiting.get(n);
        if (!w) return;
        this.waiting.delete(n);
        w.done(v.getUint8(4) === 0 ? new Uint8Array(e.data, 5) : null);
      };
      // Closed or never opened: what was waiting gets nothing (asked again by its row), and HTTP for a moment.
      const gone = () => {
        if (this.ws === ws) this.ws = null;
        if (this.opening) { this.opening = null; this.failedAt = Date.now(); resolve(null); }
        for (const w of this.waiting.values()) w.done(null);
        this.waiting.clear();
      };
      ws.onclose = gone;
      ws.onerror = gone;
    }));
  }
}
