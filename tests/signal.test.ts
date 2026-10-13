import { afterEach, describe, expect, it, vi } from 'vitest';
import { Signal, STALE } from '../cloud/src/signal';

// The signaling room (ADR 0036, 0037): a device's socket that died without closing (a computer asleep, 2026-10-13: its
// GLUE Home stayed "online" and every offer to it went nowhere) is let go once silent, and the others hear it's offline.
class Sock {
  sent: Record<string, unknown>[] = [];
  closed: number | null = null;
  private att: unknown = null;
  constructor(readonly tag: string) {}
  send(m: string) { this.sent.push(JSON.parse(m)); }
  close(code?: number) { this.closed = code ?? 1000; }
  serializeAttachment(v: unknown) { this.att = structuredClone(v); }
  deserializeAttachment() { return this.att; }
}

function room() {
  const socks: Sock[] = [];
  const state = { acceptWebSocket: (ws: Sock, tags?: string[]) => void socks.push(Object.assign(ws, { tag: tags?.[0] ?? '' })), getWebSockets: (tag?: string) => socks.filter(s => s.closed === null && (tag === undefined || s.tag === tag)) };
  const env = { DB: { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) } };
  const sig = new Signal(state as never, env as never);
  // Joined as the room's own fetch would: accepted, tagged with its device.
  const join = (device: string) => { const s = new Sock(device); state.acceptWebSocket(s, [device]); s.serializeAttachment({ device, conn: '', heard: Date.now() }); return s; };
  return { sig, join };
}

describe('the signaling room', () => {
  afterEach(() => vi.useRealTimers());

  it('a device silent for longer than STALE is let go, and the others hear it’s offline; one that pings is kept', () => {
    vi.useFakeTimers();
    const { sig, join } = room();
    const home = join('hdesk'), laptop = join('laptop'), phone = join('phone');
    // The phone pings every 30 s; the laptop too, until it goes; GLUE Home goes silent at once.
    for (let t = 30_000; t <= STALE; t += 30_000) { vi.advanceTimersByTime(30_000); sig.webSocketMessage(phone as never, '{"type":"ping"}'); if (t <= 60_000) sig.webSocketMessage(laptop as never, '{"type":"ping"}'); }
    expect(home.closed).toBeNull();
    vi.advanceTimersByTime(30_000);
    // An offer for the silent GLUE Home: it's let go, and the phone told it's offline, not left waiting.
    sig.webSocketMessage(phone as never, JSON.stringify({ type: 'signal', to: 'hdesk', data: { t: 'offer' } }));
    expect(home.closed).toBe(1011);
    expect(home.sent.some(m => m.type === 'signal')).toBe(false);
    expect(phone.sent.filter(m => m.type === 'presence').at(-1)).toEqual({ type: 'presence', online: ['laptop', 'phone'] });
    expect(phone.sent.at(-1)).toEqual({ type: 'error', error: 'device offline' });
    // The laptop, silent 120 s (a background tab's slowed timers): still there.
    expect(laptop.closed).toBeNull();
    expect(phone.closed).toBeNull();
  });
});
