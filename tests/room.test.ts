import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The account's signaling room (ADR 0037): a socket that died without closing (2026-10-13: the Desktop shown online,
// offers to it never answered, until a reload) is connected again once its pongs stop.
class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) { FakeSocket.all.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
  send(s: string) { this.sent.push(s); }
  close() { this.readyState = 3; }
  say(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

describe('the signaling room', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    const store = new Map<string, string>([['mco.cloud.refresh', JSON.stringify('r')]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

  async function signedIn() {
    const { account } = await import('../src/lib/account.svelte');
    const a = account as unknown as { phase: string; access: string; accessExp: number; refreshToken: string; wake(): void };
    a.phase = 'signed-in'; a.access = 'a'; a.accessExp = Date.now() + 3_600_000;
    if (!a.refreshToken) a.refreshToken = 'r';
    a.wake();
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeSocket.all).toHaveLength(1);
    return FakeSocket.all[0];
  }

  it('a room that answered its pings and went silent is connected again; one that answers is kept', async () => {
    const ws = await signedIn();
    // Answering each ping: kept.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(ws.sent.at(-1)).toBe('{"type":"ping"}');
      ws.say({ type: 'pong' });
    }
    expect(FakeSocket.all).toHaveLength(1);
    // Silent (the socket gone without closing): a new one within two pings and a margin.
    await vi.advanceTimersByTimeAsync(110_000);
    expect(FakeSocket.all).toHaveLength(2);
    expect(ws.readyState).toBe(3);
  });

  it('a room that never answers a ping is left be', async () => {
    await signedIn();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
