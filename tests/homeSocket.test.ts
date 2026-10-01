import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeSocket } from '../src/platform/homeSocket';

// The socket to GLUE Home for the background loads (ADR 0139): numbered requests on one connection, cancellable.
class FakeSocket {
  static last: FakeSocket | null = null;
  static OPEN = 1;
  readyState = 0;
  binaryType = '';
  sent: { n: number; op: string; key?: string }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { FakeSocket.last = this; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
  answer(n: number, bytes: number[] | null) {
    const b = new Uint8Array(5 + (bytes?.length ?? 0));
    new DataView(b.buffer).setUint32(0, n);
    b[4] = bytes ? 0 : 1;
    if (bytes) b.set(bytes, 5);
    this.onmessage?.({ data: b.buffer });
  }
}

describe('the socket to GLUE Home', () => {
  beforeEach(() => { vi.stubGlobal('WebSocket', FakeSocket); FakeSocket.last = null; });
  afterEach(() => vi.unstubAllGlobals());

  it('asks by number and takes the answers in any order; "not there" is null', async () => {
    const s = new HomeSocket(() => 'ws://127.0.0.1:1/?t=x');
    const a = s.cache('w/a'), b = s.cache('w/b');
    await vi.waitFor(() => expect(FakeSocket.last?.sent).toHaveLength(2));
    const [ra, rb] = FakeSocket.last!.sent;
    expect(ra).toMatchObject({ op: 'cache', key: 'w/a' });
    FakeSocket.last!.answer(rb.n, null);
    FakeSocket.last!.answer(ra.n, [1, 2, 3]);
    expect(Array.from((await a)!)).toEqual([1, 2, 3]);
    expect(await b).toBeNull();
    expect(s.pending).toBe(0);
  });

  it('cancels what isn’t wanted any more', async () => {
    const s = new HomeSocket(() => 'ws://127.0.0.1:1/?t=x'), ctl = new AbortController();
    const p = s.cache('w/a', ctl.signal);
    await vi.waitFor(() => expect(FakeSocket.last?.sent).toHaveLength(1));
    ctl.abort();
    expect(await p).toBeNull();
    expect(FakeSocket.last!.sent[1]).toEqual({ n: FakeSocket.last!.sent[0].n, op: 'cancel' });
  });

  it('no socket (an older GLUE Home): undefined, so the caller uses HTTP', async () => {
    expect(await new HomeSocket(() => null).cache('w/a')).toBeUndefined();
  });

  it('closed: what was waiting gets nothing, to be asked again', async () => {
    const s = new HomeSocket(() => 'ws://127.0.0.1:1/?t=x');
    const p = s.cache('w/a');
    await vi.waitFor(() => expect(FakeSocket.last?.sent).toHaveLength(1));
    FakeSocket.last!.close();
    expect(await p).toBeNull();
  });
});
